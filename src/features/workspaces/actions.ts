"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { inviteSchema, profileSchema, workspaceSchema } from "@/lib/validations/auth";
import { dbErrorMessage, fail, zodFail } from "@/lib/utils/errors";
import { z } from "zod";
import { PERMISSIONS, type ActionResult } from "@/types/domain";
import { ACTIVE_WORKSPACE_COOKIE, getSessionContext } from "./context";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };

export async function createWorkspace(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const parsed = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_timezone: "America/Sao_Paulo",
  });
  if (error) return { error: dbErrorMessage(error) };

  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, data as string, COOKIE_OPTS);
  redirect("/");
}

export async function switchWorkspace(workspaceId: string) {
  const ctx = await getSessionContext();
  if (!ctx.workspaces.some((w) => w.id === workspaceId)) return;
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, COOKIE_OPTS);
  revalidatePath("/", "layout");
}

/**
 * Convida por e-mail. Registra o convite (RLS: exige members.manage) e gera um
 * link de convite copiável — funciona mesmo sem SMTP configurado no Supabase.
 * A ordem importa: o convite é gravado antes de o usuário ser criado no Auth,
 * para que o trigger de cadastro o aceite automaticamente.
 */
export async function inviteMember(input: unknown): Promise<ActionResult<{ link: string | null; existingUser: boolean }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { workspace_id, email, can_validate } = parsed.data;

  const ctx = await getSessionContext();
  if (ctx.workspace.id !== workspace_id || !ctx.permissions.includes("members.manage")) {
    return fail("Você não tem permissão para convidar pessoas.");
  }
  if (ctx.members.some((m) => m.profile.email === email)) {
    return fail("Esta pessoa já participa do workspace.");
  }

  const supabase = await createClient();
  await supabase
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspace_id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { error: invError } = await supabase.from("workspace_invitations").insert({
    workspace_id,
    email,
    invited_by: ctx.userId,
    permissions: can_validate ? ["impacts.validate"] : [],
  });
  if (invError) return fail(dbErrorMessage(invError));

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return fail("Convite registrado, mas SUPABASE_SECRET_KEY não está configurada para gerar o link.");
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      // Conta já existe: o convite é aceito no próximo acesso (accept_pending_invitations).
      return { ok: true, data: { link: null, existingUser: true } };
    }
    return fail("Convite registrado, mas não foi possível gerar o link. Tente novamente.");
  }

  const url = new URL("/auth/confirm", publicEnv().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "invite");
  url.searchParams.set("next", "/definir-senha");
  revalidatePath("/configuracoes");
  return { ok: true, data: { link: url.toString(), existingUser: false } };
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/configuracoes");
  return { ok: true, data: undefined };
}

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await getSessionContext();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", ctx.userId);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function renameWorkspace(input: unknown): Promise<ActionResult> {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await getSessionContext();
  if (!ctx.permissions.includes("workspace.manage")) return fail("Você não tem permissão para alterar o workspace.");
  const supabase = await createClient();
  const { error } = await supabase.from("workspaces").update({ name: parsed.data.name }).eq("id", ctx.workspace.id);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

const permissionToggleSchema = z.object({
  user_id: z.uuid(),
  permission: z.enum(PERMISSIONS),
  granted: z.boolean(),
});

/** Concede/revoga permissões (ex.: validador de ganhos). RLS exige members.manage. */
export async function setMemberPermission(input: unknown): Promise<ActionResult> {
  const parsed = permissionToggleSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await getSessionContext();
  if (!ctx.permissions.includes("members.manage")) return fail("Você não tem permissão para alterar permissões.");
  const supabase = await createClient();
  const { user_id, permission, granted } = parsed.data;
  const { error } = granted
    ? await supabase
        .from("workspace_member_permissions")
        .upsert({ workspace_id: ctx.workspace.id, user_id, permission, granted_by: ctx.userId }, { ignoreDuplicates: true })
    : await supabase
        .from("workspace_member_permissions")
        .delete()
        .eq("workspace_id", ctx.workspace.id)
        .eq("user_id", user_id)
        .eq("permission", permission);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/configuracoes");
  return { ok: true, data: undefined };
}

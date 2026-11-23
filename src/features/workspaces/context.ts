import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayInTimeZone } from "@/lib/utils/dates";
import type { Member, Permission, Profile, Workspace } from "@/types/domain";
import { displayName } from "./display";

export const ACTIVE_WORKSPACE_COOKIE = "dp_ws";

export type SessionContext = {
  userId: string;
  profile: Profile;
  workspace: Workspace;
  workspaces: Workspace[];
  members: Member[];
  permissions: Permission[];
  today: string;
};

/** Usuário autenticado (claims validadas) ou redireciona para /login. */
export const requireUserId = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return userId;
});

/**
 * Contexto da requisição: perfil, workspace ativo, membros e permissões.
 * Memoizado por requisição (React cache). Todas as leituras passam pela RLS.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const userId = await requireUserId();
  const supabase = await createClient();

  const [profileRes, membershipsRes] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, avatar_url, theme").eq("id", userId).single(),
    supabase
      .from("workspace_members")
      .select("workspace:workspaces!inner(id, name, timezone, due_soon_days)")
      .eq("user_id", userId),
  ]);

  if (profileRes.error || !profileRes.data) redirect("/login?erro=perfil");

  const workspaces = (membershipsRes.data ?? [])
    .map((m) => m.workspace as unknown as Workspace)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  if (workspaces.length === 0) redirect("/onboarding");

  const preferred = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === preferred) ?? workspaces[0];

  const [membersRes, permsRes] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("user_id, role, profile:profiles!inner(id, email, full_name, avatar_url)")
      .eq("workspace_id", workspace.id),
    supabase.from("workspace_member_permissions").select("user_id, permission").eq("workspace_id", workspace.id),
  ]);

  const permsByUser = new Map<string, Permission[]>();
  for (const p of permsRes.data ?? []) {
    permsByUser.set(p.user_id, [...(permsByUser.get(p.user_id) ?? []), p.permission as Permission]);
  }

  const members: Member[] = (membersRes.data ?? [])
    .map((m) => ({
      user_id: m.user_id,
      role: m.role as Member["role"],
      profile: m.profile as unknown as Member["profile"],
      permissions: permsByUser.get(m.user_id) ?? [],
    }))
    .sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile), "pt-BR"));

  return {
    userId,
    profile: profileRes.data as Profile,
    workspace,
    workspaces,
    members,
    permissions: permsByUser.get(userId) ?? [],
    today: todayInTimeZone(workspace.timezone),
  };
});

export { displayName } from "./display";

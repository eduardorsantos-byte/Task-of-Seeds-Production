"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { emailSchema, loginSchema, passwordSchema } from "@/lib/validations/auth";
import { safeNextPath } from "@/lib/utils/redirect";

export type FormState = { error?: string; message?: string; fieldErrors?: Record<string, string[] | undefined> };

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Mensagem única: não revela se o e-mail existe.
    return { error: "E-mail ou senha incorretos." };
  }
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/definir-senha`,
  });
  return { message: "Se houver uma conta com este e-mail, você receberá um link para redefinir a senha." };
}

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { error: "Seu link expirou. Peça um novo convite ou redefinição de senha." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error: error.code === "same_password" ? "Escolha uma senha diferente da atual." : "Não foi possível definir a senha.",
    };
  }
  if (parsed.data.full_name) {
    await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", userId);
  }
  redirect("/");
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/features/workspaces/context";
import { OnboardingForm } from "./onboarding-form";
import { Mark } from "@/components/layout/mark";

/** Telas autenticadas: sempre renderizadas por requisição (dados por usuário, RLS). */
export const dynamic = "force-dynamic";

export const metadata = { title: "Criar workspace" };

export default async function OnboardingPage() {
  const userId = await requireUserId();
  const supabase = await createClient();

  // Convites recebidos depois do cadastro são aceitos aqui.
  await supabase.rpc("accept_pending_invitations");
  const { count } = await supabase
    .from("workspace_members")
    .select("workspace_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) redirect("/");

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <Mark className="mb-8 size-8" />
        <h1 className="text-xl font-semibold tracking-tight">Crie seu workspace</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          É o espaço compartilhado da equipe. Você será o administrador e o validador de ganhos; isso pode ser alterado
          depois. Se você esperava um convite, peça para quem administra reenviá-lo.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}

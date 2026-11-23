import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next, erro } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">O acesso é feito por convite do seu workspace.</p>
      {erro === "link" && (
        <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          O link é inválido ou expirou. Peça um novo convite a quem administra o workspace.
        </p>
      )}
      <LoginForm next={next} />
    </>
  );
}

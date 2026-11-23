export const metadata = { title: "Configuração pendente" };

/** Exibida quando as variáveis do Supabase não estão configuradas. */
export default function SetupPendingPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-xl font-semibold">Conexão com o banco não configurada</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Copie <code>.env.example</code> para <code>.env.local</code>, preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
        <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> e reinicie o servidor. O passo a passo está em{" "}
        <code>docs/SUPABASE.md</code>.
      </p>
    </main>
  );
}

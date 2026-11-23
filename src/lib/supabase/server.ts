import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Cliente do servidor com a sessão do usuário (cookies).
 * Todas as consultas passam pela RLS com a identidade de quem está logado.
 */
export async function createClient() {
  // cookies() primeiro: marca a rota como dinâmica (nunca pré-renderizada com dados de usuário)
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Chamado a partir de um Server Component: o proxy.ts renova a sessão.
        }
      },
    },
  });
}

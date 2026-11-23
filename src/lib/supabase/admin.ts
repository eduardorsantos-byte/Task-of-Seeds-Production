import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Cliente com a chave secreta (ignora RLS). Uso restrito a operações
 * administrativas no servidor (ex.: gerar link de convite). NUNCA importe em
 * Client Components; o pacote "server-only" quebra o build se isso acontecer.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.");
  }
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

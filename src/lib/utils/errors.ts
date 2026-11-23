import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";
import type { ActionResult } from "@/types/domain";

/**
 * Converte erros do Postgres/PostgREST em mensagens compreensíveis.
 * Mensagens de regras de negócio levantadas pelos triggers (em português)
 * são repassadas; detalhes técnicos não são expostos.
 */
export function dbErrorMessage(error: Pick<PostgrestError, "code" | "message">): string {
  switch (error.code) {
    case "42501":
      return error.message.includes("row-level security")
        ? "Você não tem permissão para esta ação."
        : error.message;
    case "23503":
      return "Um dos itens vinculados não existe mais ou não pertence a este workspace.";
    case "23505":
      return "Este registro já existe.";
    case "23514":
      return /[áéíóúãõç]|não|deve/i.test(error.message) ? error.message : "Os dados informados não são válidos.";
    case "40001":
      return error.message;
    case "PGRST116":
      return "Registro não encontrado.";
    default:
      console.error("[db]", error.code);
      return "Não foi possível salvar. Tente novamente.";
  }
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function zodFail(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos.", fieldErrors };
}

export const CONFLICT_MESSAGE =
  "Esta tarefa foi alterada por outra pessoa enquanto você editava. Recarregamos a versão mais recente.";

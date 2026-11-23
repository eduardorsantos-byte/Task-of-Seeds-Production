import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/** "Hoje" (AAAA-MM-DD) no fuso do workspace. */
export function todayInTimeZone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return format(new TZDate(now, timeZone), "yyyy-MM-dd");
}

export type DueState = "none" | "overdue" | "today" | "soon" | "later" | "done";

/** Classifica o prazo (datas civis, sem hora) em relação a "hoje" no fuso do workspace. */
export function dueState(
  dueDate: string | null,
  today: string,
  opts: { done?: boolean; soonDays?: number } = {},
): { state: DueState; days: number | null } {
  if (!dueDate) return { state: "none", days: null };
  const days = differenceInCalendarDays(parseISO(dueDate), parseISO(today));
  if (opts.done) return { state: "done", days };
  if (days < 0) return { state: "overdue", days };
  if (days === 0) return { state: "today", days };
  if (days <= (opts.soonDays ?? 2)) return { state: "soon", days };
  return { state: "later", days };
}

export function dueLabel(dueDate: string | null, today: string, opts: { done?: boolean; soonDays?: number } = {}) {
  const { state, days } = dueState(dueDate, today, opts);
  if (state === "none" || days === null || !dueDate) return "Sem prazo";
  if (state === "done" || state === "later") return formatDate(dueDate);
  if (state === "overdue") return days === -1 ? "Atrasada há 1 dia" : `Atrasada há ${-days} dias`;
  if (state === "today") return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Vence em ${days} dias`;
}

export function formatDate(isoDate: string) {
  return format(parseISO(isoDate), "dd/MM/yyyy");
}

export function formatDateTime(iso: string, timeZone: string = DEFAULT_TIMEZONE) {
  return format(new TZDate(new Date(iso), timeZone), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

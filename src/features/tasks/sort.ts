import { PRIORITY_ORDER } from "./constants";
import { TASK_STATUSES, type Task } from "@/types/domain";

type Sortable = Pick<Task, "title" | "status" | "priority" | "due_date" | "updated_at">;

/** Ordenação da lista. Sem prazo vai sempre para o fim. */
export function sortTasks<T extends Sortable>(tasks: T[], key = "due_date", dir: "asc" | "desc" = "asc"): T[] {
  const m = dir === "asc" ? 1 : -1;
  const cmp: Record<string, (a: T, b: T) => number> = {
    title: (a, b) => a.title.localeCompare(b.title, "pt-BR") * m,
    status: (a, b) => (TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status)) * m,
    priority: (a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) * m,
    updated_at: (a, b) => a.updated_at.localeCompare(b.updated_at) * m,
    due_date: (a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date) * m;
    },
  };
  const fn = cmp[key] ?? cmp.due_date;
  return [...tasks].sort((a, b) => fn(a, b) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title));
}

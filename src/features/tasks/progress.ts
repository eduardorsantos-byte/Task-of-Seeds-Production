/**
 * Progresso operacional ponderado — metodologia em docs/ARCHITECTURE.md §5.1.
 *
 *   p(t) = 1                         se t concluída
 *        = Σ w(c)·p(c) / Σ w(c)      se t tem subtarefas (não arquivadas)
 *        = 0                         caso contrário
 *
 * Projeto = média ponderada de p(t) sobre tarefas raiz. Subtarefas contam
 * apenas através do pai, o que elimina contagem dupla.
 */
export type ProgressNode = {
  id: string;
  parent_task_id: string | null;
  status: string;
  weight: number;
  archived_at?: string | null;
};

export function buildChildrenIndex<T extends ProgressNode>(tasks: T[]) {
  const children = new Map<string, T[]>();
  for (const t of tasks) {
    if (t.archived_at || !t.parent_task_id) continue;
    const list = children.get(t.parent_task_id) ?? [];
    list.push(t);
    children.set(t.parent_task_id, list);
  }
  return children;
}

export function taskProgress<T extends ProgressNode>(
  task: T,
  children: Map<string, T[]>,
  seen: Set<string> = new Set(),
): number {
  if (task.status === "done") return 1;
  if (seen.has(task.id)) return 0; // defesa contra ciclos (o banco já os impede)
  seen.add(task.id);
  const kids = children.get(task.id) ?? [];
  if (kids.length === 0) return 0;
  return weightedAverage(kids.map((k) => ({ weight: k.weight, value: taskProgress(k, children, seen) })));
}

/** Progresso de um conjunto de tarefas (ex.: um projeto). Retorna null se vazio. */
export function operationalProgress<T extends ProgressNode>(tasks: T[]): number | null {
  const active = tasks.filter((t) => !t.archived_at);
  const ids = new Set(active.map((t) => t.id));
  const children = buildChildrenIndex(active);
  // Raiz = sem pai OU com pai fora do conjunto (ex.: filtro aplicado)
  const roots = active.filter((t) => !t.parent_task_id || !ids.has(t.parent_task_id));
  if (roots.length === 0) return null;
  return weightedAverage(roots.map((r) => ({ weight: r.weight, value: taskProgress(r, children) })));
}

function weightedAverage(items: { weight: number; value: number }[]) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return 0;
  return items.reduce((s, i) => s + i.weight * i.value, 0) / total;
}

/** Contagem de subtarefas diretas concluídas (indicador do cartão). */
export function subtaskCounts<T extends ProgressNode>(taskId: string, children: Map<string, T[]>) {
  const kids = children.get(taskId) ?? [];
  return { done: kids.filter((k) => k.status === "done").length, total: kids.length };
}

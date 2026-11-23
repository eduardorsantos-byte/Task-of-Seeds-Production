import "server-only";
import { addDays, format, parseISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import type { ActivityLog, Comment, Project, Task } from "@/types/domain";
import type { TaskFilters } from "@/lib/validations/tasks";
import type { SessionContext } from "@/features/workspaces/context";
import { buildChildrenIndex, subtaskCounts, taskProgress } from "./progress";

const TASK_COLUMNS =
  "id, workspace_id, parent_task_id, project_id, category_id, recurrence_id, title, description, type, status, priority, assignee_id, start_date, due_date, weight, position, completed_at, archived_at, created_by, created_at, updated_at, version";

/** Limite de segurança por consulta; a lista avisa quando é atingido. */
export const TASK_LIST_LIMIT = 500;
/** No Kanban, concluídas há mais de N dias saem da coluna (continuam na lista). */
export const KANBAN_DONE_WINDOW_DAYS = 30;

export type TaskRow = Task & {
  progress: number;
  subtasks: { done: number; total: number };
  parent_title: string | null;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listProjects(ctx: SessionContext): Promise<Project[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, workspace_id, name, description, owner_id, status, priority, start_date, due_date, color, version")
    .eq("workspace_id", ctx.workspace.id)
    .is("deleted_at", null)
    .order("name");
  return (data ?? []) as Project[];
}

/**
 * Tarefas do workspace com filtros. Progresso e contagem de subtarefas são
 * calculados sobre a árvore completa (não filtrada), para não distorcer.
 */
export async function listTasks(
  ctx: SessionContext,
  filters: TaskFilters,
  opts: { view: "kanban" | "lista" },
): Promise<{ tasks: TaskRow[]; truncated: boolean }> {
  const supabase = await createClient();
  const includeSubtasks = Boolean(filters.assignee || filters.q);

  let query = supabase.from("tasks").select(TASK_COLUMNS).eq("workspace_id", ctx.workspace.id);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (!includeSubtasks) query = query.is("parent_task_id", null);
  if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.assignee === "none") query = query.is("assignee_id", null);
  else if (filters.assignee === "me") query = query.eq("assignee_id", ctx.userId);
  else if (filters.assignee) query = query.eq("assignee_id", filters.assignee);
  if (filters.project === "none") query = query.is("project_id", null);
  else if (filters.project) query = query.eq("project_id", filters.project);

  if (filters.due === "overdue") query = query.lt("due_date", ctx.today).neq("status", "done");
  if (filters.due === "soon") {
    const limit = format(addDays(parseISO(ctx.today), ctx.workspace.due_soon_days), "yyyy-MM-dd");
    query = query.gte("due_date", ctx.today).lte("due_date", limit).neq("status", "done");
  }
  if (filters.due === "none") query = query.is("due_date", null);

  if (opts.view === "kanban" && !filters.status && !filters.archived) {
    const cutoff = subDays(new Date(), KANBAN_DONE_WINDOW_DAYS).toISOString();
    query = query.or(`status.neq.done,completed_at.gte.${cutoff}`);
  }

  query = query.order("position").limit(TASK_LIST_LIMIT + 1);

  // Árvore completa (campos mínimos) para progresso e indicador de subtarefas
  const treeQuery = supabase
    .from("tasks")
    .select("id, parent_task_id, status, weight, archived_at, title")
    .eq("workspace_id", ctx.workspace.id)
    .is("archived_at", null);

  const [{ data, error }, { data: tree }] = await Promise.all([query, treeQuery]);
  if (error) throw new Error("Falha ao carregar tarefas.");

  const rows = (data ?? []) as Task[];
  const nodes = tree ?? [];
  const children = buildChildrenIndex(nodes);
  const titles = new Map(nodes.map((n) => [n.id, n.title as string]));

  const tasks = rows.slice(0, TASK_LIST_LIMIT).map((t) => ({
    ...t,
    weight: Number(t.weight),
    progress: taskProgress({ ...t, weight: Number(t.weight) }, children),
    subtasks: subtaskCounts(t.id, children),
    parent_title: t.parent_task_id ? (titles.get(t.parent_task_id) ?? null) : null,
  }));

  return { tasks, truncated: rows.length > TASK_LIST_LIMIT };
}

export type TaskDetail = {
  task: Task;
  parent: Pick<Task, "id" | "title"> | null;
  subtasks: (Task & { progress: number; subtasks: { done: number; total: number } })[];
  comments: Comment[];
  activity: ActivityLog[];
};

export async function getTaskDetail(ctx: SessionContext, id: string): Promise<TaskDetail | null> {
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!task) return null;

  const [parentRes, treeRes, commentsRes, activityRes] = await Promise.all([
    task.parent_task_id
      ? supabase.from("tasks").select("id, title").eq("id", task.parent_task_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("workspace_id", ctx.workspace.id)
      .is("archived_at", null)
      .not("parent_task_id", "is", null),
    supabase
      .from("comments")
      .select("id, task_id, author_id, body, created_at, edited_at")
      .eq("task_id", id)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("activity_logs")
      .select("id, actor_id, action, changes, created_at")
      .eq("entity_type", "task")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const all = ((treeRes.data ?? []) as Task[]).map((t) => ({ ...t, weight: Number(t.weight) }));
  const children = buildChildrenIndex(all);
  const subtasks = (children.get(id) ?? [])
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ ...s, progress: taskProgress(s, children), subtasks: subtaskCounts(s.id, children) }));

  return {
    task: { ...(task as Task), weight: Number(task.weight) },
    parent: (parentRes.data as TaskDetail["parent"]) ?? null,
    subtasks,
    comments: (commentsRes.data ?? []) as Comment[],
    activity: (activityRes.data ?? []) as ActivityLog[],
  };
}

/** Indicadores da visão geral (dados reais; Fase 4 amplia com gráficos e ganhos). */
export async function getOverview(ctx: SessionContext) {
  const supabase = await createClient();
  const soonLimit = format(addDays(parseISO(ctx.today), ctx.workspace.due_soon_days), "yyyy-MM-dd");
  const monthAgo = subDays(new Date(), 30).toISOString();
  const base = () =>
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .is("archived_at", null);

  const [open, inProgress, overdue, soon, doneMonth, doneOnTime, priority] = await Promise.all([
    base().neq("status", "done"),
    base().eq("status", "in_progress"),
    base().neq("status", "done").lt("due_date", ctx.today),
    base().neq("status", "done").gte("due_date", ctx.today).lte("due_date", soonLimit),
    base().eq("status", "done").gte("completed_at", monthAgo),
    supabase
      .from("tasks")
      .select("due_date, completed_at")
      .eq("workspace_id", ctx.workspace.id)
      .is("archived_at", null)
      .eq("status", "done")
      .gte("completed_at", monthAgo)
      .not("due_date", "is", null),
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("workspace_id", ctx.workspace.id)
      .is("archived_at", null)
      .neq("status", "done")
      .or(`assignee_id.eq.${ctx.userId},assignee_id.is.null`)
      .not("due_date", "is", null)
      .lte("due_date", soonLimit)
      .order("due_date")
      .limit(8),
  ]);

  const withDue = doneOnTime.data ?? [];
  const onTime = withDue.filter((t) => {
    const completedLocal = new Date(t.completed_at as string).toLocaleDateString("sv-SE", {
      timeZone: ctx.workspace.timezone,
    });
    return completedLocal <= (t.due_date as string);
  }).length;

  return {
    open: open.count ?? 0,
    inProgress: inProgress.count ?? 0,
    overdue: overdue.count ?? 0,
    dueSoon: soon.count ?? 0,
    doneLast30: doneMonth.count ?? 0,
    onTimeRate: withDue.length ? onTime / withDue.length : null,
    onTimeBase: withDue.length,
    priorityTasks: (priority.data ?? []) as Task[],
  };
}

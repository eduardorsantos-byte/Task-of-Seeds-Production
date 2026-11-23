import type { Metadata } from "next";
import { z } from "zod";
import { getSessionContext } from "@/features/workspaces/context";
import { getTaskDetail, listTasks } from "@/features/tasks/queries";
import { sortTasks } from "@/features/tasks/sort";
import { taskFiltersSchema } from "@/lib/validations/tasks";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata: Metadata = { title: "Tarefas" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const single = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = taskFiltersSchema.parse(single);
  const view = filters.view ?? "kanban";
  const openId = z.uuid().safeParse(single.tarefa).data;

  const ctx = await getSessionContext();
  const [{ tasks, truncated }, detail] = await Promise.all([
    listTasks(ctx, filters, { view }),
    openId ? getTaskDetail(ctx, openId) : Promise.resolve(null),
  ]);

  const rows = view === "lista" ? sortTasks(tasks, filters.sort, filters.dir) : tasks;

  return (
    <TasksView
      view={view}
      tasks={rows}
      truncated={truncated}
      filtered={Object.entries(filters).some(([k, v]) => v && !["view", "sort", "dir"].includes(k))}
      detail={detail}
      openId={openId ?? null}
    />
  );
}

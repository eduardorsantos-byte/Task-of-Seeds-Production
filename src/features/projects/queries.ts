import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/workspaces/context";
import { listProjects } from "@/features/tasks/queries";
import { operationalProgress } from "@/features/tasks/progress";

/** Projetos com progresso operacional ponderado e contagens. */
export async function listProjectsWithProgress(ctx: SessionContext) {
  const supabase = await createClient();
  const [projects, { data: tasks }] = await Promise.all([
    listProjects(ctx),
    supabase
      .from("tasks")
      .select("id, parent_task_id, project_id, status, weight, archived_at, due_date")
      .eq("workspace_id", ctx.workspace.id)
      .is("archived_at", null)
      .not("project_id", "is", null),
  ]);

  const byProject = new Map<string, NonNullable<typeof tasks>>();
  for (const t of tasks ?? []) {
    const list = byProject.get(t.project_id!) ?? [];
    list.push({ ...t, weight: Number(t.weight) });
    byProject.set(t.project_id!, list);
  }

  return projects.map((p) => {
    const list = byProject.get(p.id) ?? [];
    const roots = list.filter((t) => !t.parent_task_id);
    return {
      ...p,
      progress: operationalProgress(list),
      rootTasks: roots.length,
      doneRootTasks: roots.filter((t) => t.status === "done").length,
      overdue: list.filter((t) => t.status !== "done" && t.due_date && t.due_date < ctx.today).length,
    };
  });
}

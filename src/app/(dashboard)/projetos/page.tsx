import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { ProgressBar } from "@/components/tasks/task-badges";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { getSessionContext, displayName } from "@/features/workspaces/context";
import { listProjectsWithProgress } from "@/features/projects/queries";
import { PRIORITY_LABEL } from "@/features/tasks/constants";
import { formatDate } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Projetos" };

const STATUS: Record<string, string> = {
  planned: "Planejado",
  active: "Ativo",
  on_hold: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export default async function ProjectsPage() {
  const ctx = await getSessionContext();
  const projects = await listProjectsWithProgress(ctx);
  const owners = new Map(ctx.members.map((m) => [m.user_id, displayName(m.profile)]));

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Progresso operacional ponderado pelas tarefas de cada projeto."
        actions={<NewProjectButton />}
      />
      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title="Nenhum projeto ainda" action={<NewProjectButton />}>
          Projetos agrupam tarefas com um objetivo comum, como a automatização de um relatório. Metas e indicadores de
          resultado chegam na Fase 3.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/tarefas?view=lista&project=${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs">{STATUS[p.status]}</span>
              </div>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              <div className="mt-4">
                {p.progress === null ? (
                  <p className="text-xs text-muted-foreground">Sem tarefas vinculadas</p>
                ) : (
                  <ProgressBar value={p.progress} label={`Progresso de ${p.name}`} />
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Tarefas</dt>
                <dd className="text-right tabular-nums">
                  {p.doneRootTasks}/{p.rootTasks} concluídas
                </dd>
                {p.overdue > 0 && (
                  <>
                    <dt className="text-muted-foreground">Atrasadas</dt>
                    <dd className="text-right font-medium text-destructive tabular-nums">{p.overdue}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Responsável</dt>
                <dd className="truncate text-right">{p.owner_id ? owners.get(p.owner_id) : "—"}</dd>
                <dt className="text-muted-foreground">Prazo</dt>
                <dd className="text-right">{p.due_date ? formatDate(p.due_date) : "—"}</dd>
                <dt className="text-muted-foreground">Prioridade</dt>
                <dd className="text-right">{PRIORITY_LABEL[p.priority]}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, CornerDownRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { UserAvatar } from "@/components/layout/user-avatar";
import { displayName } from "@/features/workspaces/display";
import type { TaskRow } from "@/features/tasks/queries";
import { cn } from "@/lib/utils";
import { DueBadge, PriorityBadge, ProgressBar, StatusLabel, TypeBadge } from "./task-badges";
import { TaskActionsMenu } from "./task-actions-menu";
import { useUrlState } from "./use-url-state";

type SortKey = "title" | "status" | "priority" | "due_date" | "updated_at";

export function TaskList({ tasks, onOpenTask }: { tasks: TaskRow[]; onOpenTask: (id: string) => void }) {
  const { memberById, projects, today, workspace } = useWorkspace();
  const { params, set } = useUrlState();
  const sort = (params.get("sort") as SortKey | null) ?? "due_date";
  const dir = params.get("dir") === "desc" ? "desc" : "asc";

  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort === key;
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => set({ sort: key, dir: active && dir === "asc" ? "desc" : "asc" }, { replace: true })}
        >
          {label}
          <Icon className="size-3" aria-hidden="true" />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            {header("title", "Tarefa", "min-w-64")}
            <TableHead className="hidden 2xl:table-cell">Tipo</TableHead>
            <TableHead className="hidden md:table-cell">Responsável</TableHead>
            <TableHead className="hidden xl:table-cell">Projeto</TableHead>
            {header("priority", "Prioridade", "hidden sm:table-cell")}
            {header("status", "Status")}
            {header("due_date", "Prazo")}
            <TableHead className="hidden w-36 lg:table-cell">Progresso</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => {
            const assignee = t.assignee_id ? memberById.get(t.assignee_id) : undefined;
            const project = projects.find((p) => p.id === t.project_id);
            return (
              <TableRow key={t.id} className={cn(t.archived_at && "opacity-60")}>
                <TableCell className="max-w-md">
                  <button type="button" onClick={() => onOpenTask(t.id)} className="text-left hover:underline">
                    {t.parent_title && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CornerDownRight className="size-3" aria-hidden="true" />
                        {t.parent_title}
                      </span>
                    )}
                    <span className={cn("font-medium whitespace-normal", t.status === "done" && "text-muted-foreground line-through")}>
                      {t.title}
                    </span>
                    {t.subtasks.total > 0 && (
                      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                        {t.subtasks.done}/{t.subtasks.total} subtarefas
                      </span>
                    )}
                  </button>
                </TableCell>
                <TableCell className="hidden 2xl:table-cell">
                  <TypeBadge type={t.type} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {assignee ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <UserAvatar name={displayName(assignee.profile)} />
                      <span className="max-w-32 truncate">{displayName(assignee.profile)}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground xl:table-cell">{project?.name ?? "—"}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <PriorityBadge priority={t.priority} />
                </TableCell>
                <TableCell>
                  <StatusLabel status={t.status} />
                </TableCell>
                <TableCell>
                  {t.due_date ? (
                    <DueBadge dueDate={t.due_date} today={today} done={t.status === "done"} soonDays={workspace.due_soon_days} className="-ml-1.5" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <ProgressBar value={t.progress} label={`Progresso de ${t.title}`} />
                </TableCell>
                <TableCell>
                  <TaskActionsMenu task={t} onOpen={() => onOpenTask(t.id)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

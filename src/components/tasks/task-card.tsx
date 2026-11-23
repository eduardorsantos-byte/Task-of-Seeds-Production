"use client";

import { forwardRef } from "react";
import { CornerDownRight, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueState } from "@/lib/utils/dates";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { UserAvatar } from "@/components/layout/user-avatar";
import { displayName } from "@/features/workspaces/display";
import { PRIORITY_BAR, PRIORITY_LABEL } from "@/features/tasks/constants";
import type { TaskRow } from "@/features/tasks/queries";
import { DueBadge, PriorityBadge, TypeBadge } from "./task-badges";
import { TaskActionsMenu } from "./task-actions-menu";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  task: TaskRow;
  onOpen: () => void;
  onOptimisticStatus?: (status: TaskRow["status"]) => void;
  dragging?: boolean;
  overlay?: boolean;
};

/**
 * Cartão do Kanban. A faixa na borda esquerda codifica a prioridade
 * (reforçada pelo texto); o prazo aparece em linguagem relativa.
 */
export const TaskCard = forwardRef<HTMLDivElement, Props>(function TaskCard(
  { task, onOpen, onOptimisticStatus, dragging, overlay, className, ...rest },
  ref,
) {
  const { memberById, projects, today, workspace } = useWorkspace();
  const assignee = task.assignee_id ? memberById.get(task.assignee_id) : undefined;
  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : undefined;
  const done = task.status === "done";
  const overdue = dueState(task.due_date, today, { done }).state === "overdue";

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "group relative overflow-hidden rounded-md border bg-card pl-3 shadow-xs transition-shadow",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        overdue && "border-destructive/40",
        dragging && "opacity-40",
        overlay && "rotate-1 shadow-lg ring-1 ring-primary/30",
        className,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", PRIORITY_BAR[task.priority])} aria-hidden="true" />
      <div className="flex items-start gap-1 py-2 pr-1">
        <button
          type="button"
          onClick={onOpen}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 text-left outline-none"
          aria-label={`Abrir ${task.title}. Prioridade ${PRIORITY_LABEL[task.priority]}${overdue ? ", atrasada" : ""}`}
        >
          {task.parent_title && (
            <span className="mb-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <CornerDownRight className="size-3 shrink-0" aria-hidden="true" />
              {task.parent_title}
            </span>
          )}
          <span className={cn("line-clamp-3 text-sm leading-snug font-medium", done && "text-muted-foreground line-through decoration-1")}>
            {task.title}
          </span>
        </button>
        <div onPointerDown={(e) => e.stopPropagation()} className="opacity-70 group-hover:opacity-100 focus-within:opacity-100">
          <TaskActionsMenu task={task} onOpen={onOpen} onOptimisticStatus={onOptimisticStatus} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-2 pb-2 text-xs">
        <PriorityBadge priority={task.priority} />
        <TypeBadge type={task.type} />
        {project && <span className="max-w-32 truncate text-muted-foreground">{project.name}</span>}
      </div>

      {(task.due_date || assignee || task.subtasks.total > 0) && (
        <div className="flex min-w-0 items-center gap-2 border-t border-dashed py-1.5 pr-2">
          <DueBadge dueDate={task.due_date} today={today} done={done} soonDays={workspace.due_soon_days} className="-ml-1.5" />
          {task.subtasks.total > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums" title="Subtarefas concluídas">
              <ListChecks className="size-3" aria-hidden="true" />
              {task.subtasks.done}/{task.subtasks.total}
              <span className="sr-only">subtarefas concluídas</span>
            </span>
          )}
          <span className="ml-auto">
            {assignee ? (
              <UserAvatar name={displayName(assignee.profile)} />
            ) : (
              <span
                className="grid size-6 place-items-center rounded-full border border-dashed border-muted-foreground/50"
                title="Sem responsável"
              >
                <span className="sr-only">Sem responsável</span>
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
});

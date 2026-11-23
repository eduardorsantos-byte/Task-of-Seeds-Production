import { AlertTriangle, CalendarClock, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, dueState } from "@/lib/utils/dates";
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/features/tasks/constants";
import type { TaskPriority, TaskStatus, TaskType } from "@/types/domain";

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-warning",
  urgent: "text-destructive font-semibold",
};

/** Prioridade com ícone de barras + texto (não depende só de cor). */
export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  const level = { low: 1, medium: 2, high: 3, urgent: 4 }[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", PRIORITY_STYLE[priority], className)}>
      <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 3} y={9 - i * 2.5} width="2" height={3 + i * 2.5} rx="0.5" className={i < level ? "fill-current" : "fill-current opacity-20"} />
        ))}
      </svg>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function DueBadge({
  dueDate,
  today,
  done,
  soonDays,
  className,
}: {
  dueDate: string | null;
  today: string;
  done?: boolean;
  soonDays?: number;
  className?: string;
}) {
  if (!dueDate) return null;
  const { state } = dueState(dueDate, today, { done, soonDays });
  const overdue = state === "overdue";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap",
        overdue && "bg-destructive/10 font-medium text-destructive",
        (state === "today" || state === "soon") && "bg-warning/12 font-medium text-warning",
        (state === "later" || state === "done") && "text-muted-foreground",
        className,
      )}
    >
      {overdue ? <AlertTriangle className="size-3" aria-hidden="true" /> : <CalendarClock className="size-3" aria-hidden="true" />}
      {dueLabel(dueDate, today, { done, soonDays })}
    </span>
  );
}

export function TypeBadge({ type }: { type: TaskType }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {type === "recurring" && <Repeat className="size-3" aria-hidden="true" />}
      {TYPE_LABEL[type]}
    </span>
  );
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "border-muted-foreground",
  in_progress: "border-primary bg-primary/30",
  blocked: "border-destructive bg-destructive/30",
  in_review: "border-chart-4 bg-chart-4/30",
  done: "border-success bg-success",
};

export function StatusDot({ status }: { status: TaskStatus }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full border-[1.5px]", STATUS_DOT[status])} aria-hidden="true" />;
}

export function StatusLabel({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progresso"}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

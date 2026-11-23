"use client";

import { useState, useTransition } from "react";
import { ChevronRight, History, ListChecks, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { UserAvatar } from "@/components/layout/user-avatar";
import { displayName } from "@/features/workspaces/display";
import { addComment, patchTask, quickCreateTask } from "@/features/tasks/actions";
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/features/tasks/constants";
import type { TaskDetail } from "@/features/tasks/queries";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import type { ActivityLog, TaskPriority, TaskStatus, TaskType } from "@/types/domain";
import { cn } from "@/lib/utils";
import { TaskForm } from "./task-form";
import { DueBadge, ProgressBar, StatusLabel } from "./task-badges";

export function TaskDetailSheet({
  detail,
  open,
  onClose,
  onOpenTask,
}: {
  detail: TaskDetail | null;
  open: boolean;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { workspace, today } = useWorkspace();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {!detail ? (
          <SheetHeader>
            <SheetTitle>Tarefa não encontrada</SheetTitle>
            <SheetDescription>Ela pode ter sido removida deste workspace ou você não tem acesso.</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader className="border-b pb-4">
              {detail.parent && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenTask(detail.parent!.id)}
                >
                  {detail.parent.title} <ChevronRight className="size-3" aria-hidden="true" />
                </button>
              )}
              <SheetTitle className="pr-6 text-lg leading-snug">{detail.task.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-3">
                <StatusLabel status={detail.task.status} />
                <DueBadge dueDate={detail.task.due_date} today={today} done={detail.task.status === "done"} soonDays={workspace.due_soon_days} />
                {detail.task.archived_at && <span className="text-xs">Arquivada</span>}
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="detalhes" className="p-4">
              <TabsList className="w-full">
                <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
                <TabsTrigger value="subtarefas">
                  <ListChecks /> Subtarefas {detail.subtasks.length > 0 && `(${detail.subtasks.length})`}
                </TabsTrigger>
                <TabsTrigger value="comentarios">
                  <MessageSquare /> {detail.comments.length || ""}
                  <span className="sr-only">Comentários</span>
                </TabsTrigger>
                <TabsTrigger value="historico">
                  <History />
                  <span className="sr-only">Histórico</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="detalhes" className="pt-4">
                <TaskForm key={`${detail.task.id}:${detail.task.version}`} task={detail.task} />
                <p className="mt-4 text-xs text-muted-foreground">
                  Criada em {formatDateTime(detail.task.created_at, workspace.timezone)}
                  {detail.task.completed_at && ` · concluída em ${formatDateTime(detail.task.completed_at, workspace.timezone)}`}
                </p>
              </TabsContent>

              <TabsContent value="subtarefas" className="pt-4">
                <Subtasks detail={detail} onOpenTask={onOpenTask} />
              </TabsContent>

              <TabsContent value="comentarios" className="pt-4">
                <Comments detail={detail} />
              </TabsContent>

              <TabsContent value="historico" className="pt-4">
                <ActivityList items={detail.activity} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Subtasks({ detail, onOpenTask }: { detail: TaskDetail; onOpenTask: (id: string) => void }) {
  const { workspace, memberById } = useWorkspace();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const done = detail.subtasks.filter((s) => s.status === "done").length;
  const weighted =
    detail.subtasks.length > 0
      ? detail.subtasks.reduce((s, t) => s + t.weight * t.progress, 0) / detail.subtasks.reduce((s, t) => s + t.weight, 0)
      : 0;

  return (
    <div className="grid gap-4">
      {detail.subtasks.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">
            {done} de {detail.subtasks.length} concluídas · progresso ponderado
          </p>
          <ProgressBar value={weighted} label="Progresso das subtarefas" />
        </div>
      )}
      <ul className="grid gap-1">
        {detail.subtasks.map((s) => {
          const assignee = s.assignee_id ? memberById.get(s.assignee_id) : undefined;
          return (
            <li key={s.id} className="flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent">
              <Checkbox
                checked={s.status === "done"}
                disabled={pending}
                aria-label={`Concluir ${s.title}`}
                onCheckedChange={(c) =>
                  start(async () => {
                    const r = await patchTask({ id: s.id, version: s.version, patch: { status: c ? "done" : "todo" } });
                    if (!r.ok) toast.error(r.error);
                  })
                }
              />
              <button
                type="button"
                className={cn("min-w-0 flex-1 truncate text-left text-sm", s.status === "done" && "text-muted-foreground line-through")}
                onClick={() => onOpenTask(s.id)}
              >
                {s.title}
              </button>
              {s.subtasks.total > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.subtasks.done}/{s.subtasks.total}
                </span>
              )}
              {s.due_date && <span className="text-xs text-muted-foreground">{formatDate(s.due_date)}</span>}
              {assignee && <UserAvatar name={displayName(assignee.profile)} />}
            </li>
          );
        })}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          start(async () => {
            const r = await quickCreateTask({ workspace_id: workspace.id, title: title.trim(), parent_task_id: detail.task.id });
            if (!r.ok) toast.error(r.error);
            else setTitle("");
          });
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova subtarefa" aria-label="Título da nova subtarefa" maxLength={300} />
        <Button type="submit" variant="secondary" disabled={pending || !title.trim()}>
          <Plus /> Adicionar
        </Button>
      </form>
    </div>
  );
}

function Comments({ detail }: { detail: TaskDetail }) {
  const { workspace, memberById } = useWorkspace();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      {detail.comments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
      <ol className="grid gap-4">
        {detail.comments.map((c) => {
          const author = memberById.get(c.author_id);
          const name = author ? displayName(author.profile) : "Ex-membro";
          return (
            <li key={c.id} className="flex gap-2.5">
              <UserAvatar name={name} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium">{name}</span>{" "}
                  <time className="text-muted-foreground" dateTime={c.created_at}>
                    {formatDateTime(c.created_at, workspace.timezone)}
                  </time>
                  {c.edited_at && <span className="text-muted-foreground"> (editado)</span>}
                </p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          start(async () => {
            const r = await addComment({ workspace_id: workspace.id, task_id: detail.task.id, body });
            if (!r.ok) toast.error(r.error);
            else setBody("");
          });
        }}
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Escreva um comentário" aria-label="Novo comentário" maxLength={10000} />
        <Button type="submit" className="justify-self-end" disabled={pending || !body.trim()}>
          Comentar
        </Button>
      </form>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  title: "título",
  description: "descrição",
  status: "status",
  priority: "prioridade",
  assignee_id: "responsável",
  due_date: "prazo",
  start_date: "início",
  project_id: "projeto",
  type: "tipo",
  weight: "peso",
  parent_task_id: "tarefa principal",
};

function ActivityList({ items }: { items: ActivityLog[] }) {
  const { workspace, memberById, projects } = useWorkspace();
  const who = (id: string | null) => {
    if (!id) return "Sistema";
    const m = memberById.get(id);
    return m ? displayName(m.profile) : "Ex-membro";
  };
  const value = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "vazio";
    if (field === "status") return STATUS_LABEL[v as TaskStatus] ?? String(v);
    if (field === "priority") return PRIORITY_LABEL[v as TaskPriority] ?? String(v);
    if (field === "type") return TYPE_LABEL[v as TaskType] ?? String(v);
    if (field === "assignee_id") return who(String(v));
    if (field === "project_id") return projects.find((p) => p.id === v)?.name ?? "projeto removido";
    if (field.endsWith("_date") && typeof v === "string") return formatDate(v);
    return String(v);
  };
  const describe = (log: ActivityLog) => {
    if (log.action === "created") return "criou a tarefa";
    if (log.action === "archived") return "arquivou a tarefa";
    if (log.action === "restored") return "restaurou a tarefa";
    const parts = Object.entries(log.changes ?? {})
      .filter(([k]) => k in FIELD_LABEL)
      .map(([k, c]) => (c.changed ? `alterou a ${FIELD_LABEL[k]}` : `${FIELD_LABEL[k]}: ${value(k, c.from)} → ${value(k, c.to)}`));
    return parts.length ? parts.join("; ") : log.action === "completed" ? "concluiu a tarefa" : "atualizou a tarefa";
  };

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem histórico.</p>;
  return (
    <ol className="grid gap-3 border-l pl-4">
      {items.map((log) => (
        <li key={log.id} className="relative text-sm">
          <span className="absolute top-1.5 -left-[19px] size-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{who(log.actor_id)}</span> {describe(log)}
          <time className="block text-xs text-muted-foreground" dateTime={log.created_at}>
            {formatDateTime(log.created_at, workspace.timezone)}
          </time>
        </li>
      ))}
    </ol>
  );
}

"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { displayName } from "@/features/workspaces/display";
import { createTask, updateTask } from "@/features/tasks/actions";
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/features/tasks/constants";
import { taskFieldsSchema, type TaskFormInput, type TaskFormValues } from "@/lib/validations/tasks";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, type Task } from "@/types/domain";

const NONE = "__none";

type Props = {
  task?: Task;
  defaults?: Partial<TaskFormInput>;
  parentTaskId?: string | null;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
};

/**
 * Formulário de tarefa (criar/editar). Agrupado em: o quê → quem/quando → detalhes.
 * O mesmo schema Zod valida aqui e na Server Action.
 */
export function TaskForm({ task, defaults, parentTaskId, onSaved, onCancel, submitLabel }: Props) {
  const { workspace, members, projects } = useWorkspace();
  const isSubtask = Boolean(parentTaskId ?? task?.parent_task_id);

  const form = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFieldsSchema),
    defaultValues: toFormValues(task, defaults),
  });

  useEffect(() => {
    form.reset(toFormValues(task, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia apenas quando a versão muda
  }, [task?.id, task?.version]);

  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = task
      ? await updateTask({ ...values, id: task.id, version: task.version })
      : await createTask({ ...values, workspace_id: workspace.id, parent_task_id: parentTaskId ?? null });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(task ? "Tarefa salva" : "Tarefa criada");
    onSaved?.("id" in result.data ? result.data.id : task!.id);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <fieldset className="grid gap-3">
        <legend className="sr-only">Descrição</legend>
        <FormField id="title" label="Título" error={errors.title?.message}>
          <Input id="title" autoFocus={!task} maxLength={300} aria-invalid={!!errors.title} {...form.register("title")} />
        </FormField>
        <FormField id="description" label="Descrição" error={errors.description?.message}>
          <Textarea id="description" rows={3} placeholder="Contexto, critério de pronto, links…" {...form.register("description")} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground sm:col-span-2">Responsabilidade e prazo</legend>
        <FormField id="assignee_id" label="Responsável">
          <Controller
            control={form.control}
            name="assignee_id"
            render={({ field }) => (
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                <SelectTrigger id="assignee_id" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {displayName(m.profile)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="priority" label="Prioridade">
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="start_date" label="Início" error={errors.start_date?.message}>
          <Input id="start_date" type="date" {...form.register("start_date")} />
        </FormField>
        <FormField id="due_date" label="Prazo" error={errors.due_date?.message}>
          <Input id="due_date" type="date" aria-invalid={!!errors.due_date} {...form.register("due_date")} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground sm:col-span-2">Classificação</legend>
        <FormField id="status" label="Status">
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="type" label="Tipo">
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={task?.recurrence_id != null}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField
          id="project_id"
          label="Projeto"
          hint={isSubtask ? "Subtarefas seguem o projeto da tarefa principal." : undefined}
        >
          <Controller
            control={form.control}
            name="project_id"
            render={({ field }) => (
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)} disabled={isSubtask}>
                <SelectTrigger id="project_id" className="w-full" aria-describedby={isSubtask ? "project_id-hint" : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem projeto</SelectItem>
                  {projects
                    .filter((p) => p.status !== "cancelled" || p.id === field.value)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="weight" label="Peso no progresso" hint="Padrão 1. Use valores maiores para entregas mais relevantes." error={errors.weight?.message}>
          <Input id="weight" type="number" min="0.1" step="0.5" inputMode="decimal" aria-describedby="weight-hint" {...form.register("weight")} />
        </FormField>
      </fieldset>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          {submitLabel ?? (task ? "Salvar alterações" : "Criar tarefa")}
        </Button>
      </div>
    </form>
  );
}

function toFormValues(task?: Task, defaults?: Partial<TaskFormInput>): TaskFormInput {
  return {
    title: task?.title ?? defaults?.title ?? "",
    description: task?.description ?? defaults?.description ?? "",
    type: task?.type ?? defaults?.type ?? "one_off",
    status: task?.status ?? defaults?.status ?? "todo",
    priority: task?.priority ?? defaults?.priority ?? "medium",
    assignee_id: task ? task.assignee_id : (defaults?.assignee_id ?? null),
    project_id: task ? task.project_id : (defaults?.project_id ?? null),
    start_date: task?.start_date ?? defaults?.start_date ?? "",
    due_date: task?.due_date ?? defaults?.due_date ?? "",
    weight: task?.weight ?? defaults?.weight ?? 1,
  };
}

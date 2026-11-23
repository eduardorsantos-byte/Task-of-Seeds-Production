"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/features/workspaces/context";
import {
  commentSchema,
  createTaskSchema,
  moveTaskSchema,
  quickTaskSchema,
  taskFieldsSchema,
  updateTaskSchema,
} from "@/lib/validations/tasks";
import { CONFLICT_MESSAGE, dbErrorMessage, fail, zodFail } from "@/lib/utils/errors";
import type { ActionResult, Task } from "@/types/domain";

/**
 * Server Actions de tarefas.
 *  - Validação de entrada com Zod (mesmos schemas do formulário).
 *  - Autorização: RLS no banco (o cliente usa a sessão do usuário).
 *  - Concorrência otimista: toda alteração envia a "version" lida; se outra
 *    pessoa alterou antes, nenhuma linha é afetada e devolvemos um conflito.
 */

function refresh() {
  revalidatePath("/tarefas");
  revalidatePath("/");
}

async function workspaceGuard(workspaceId: string) {
  const ctx = await getSessionContext();
  if (ctx.workspace.id !== workspaceId) throw new Error("workspace inválido");
  return ctx;
}

/** UPDATE condicionado à versão; distingue conflito de "não encontrado". */
async function versionedUpdate(
  id: string,
  version: number,
  patch: Record<string, unknown>,
): Promise<ActionResult<{ version: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .eq("version", version)
    .select("version")
    .maybeSingle();
  if (error) return fail(dbErrorMessage(error));
  if (!data) {
    const { data: exists } = await supabase.from("tasks").select("id").eq("id", id).maybeSingle();
    return fail(exists ? CONFLICT_MESSAGE : "Tarefa não encontrada.");
  }
  refresh();
  return { ok: true, data: { version: data.version } };
}

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await workspaceGuard(parsed.data.workspace_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...parsed.data, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error));
  refresh();
  return { ok: true, data: { id: data.id } };
}

/** Criação rápida (título + coluna), pensada para "poucos segundos". */
export async function quickCreateTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = quickTaskSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await workspaceGuard(parsed.data.workspace_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...parsed.data, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error));
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function updateTask(input: unknown): Promise<ActionResult<{ version: number }>> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { id, version, ...fields } = parsed.data;
  return versionedUpdate(id, version, fields);
}

const patchSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  patch: z
    .object({
      status: taskFieldsSchema.shape.status,
      priority: taskFieldsSchema.shape.priority,
      assignee_id: taskFieldsSchema.shape.assignee_id,
      due_date: taskFieldsSchema.shape.due_date,
      project_id: taskFieldsSchema.shape.project_id,
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Nada para alterar"),
});

/** Alterações pontuais pelo menu do cartão (status, responsável, prioridade, prazo, projeto). */
export async function patchTask(input: unknown): Promise<ActionResult<{ version: number }>> {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const raw = (input as { patch: Record<string, unknown> }).patch;
  // Só envia as chaves realmente informadas (transform de opcionais gera null)
  const patch = Object.fromEntries(Object.entries(parsed.data.patch).filter(([k]) => k in raw));
  return versionedUpdate(parsed.data.id, parsed.data.version, patch);
}

/** Drag-and-drop no Kanban: muda status e/ou posição na coluna. */
export async function moveTask(input: unknown): Promise<ActionResult<{ version: number }>> {
  const parsed = moveTaskSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { id, version, status, position } = parsed.data;
  return versionedUpdate(id, version, position === undefined ? { status } : { status, position });
}

export async function archiveTask(id: string, version: number, archived: boolean) {
  return versionedUpdate(id, version, { archived_at: archived ? new Date().toISOString() : null });
}

const DUPLICABLE: (keyof Task)[] = [
  "workspace_id",
  "project_id",
  "category_id",
  "description",
  "type",
  "priority",
  "assignee_id",
  "start_date",
  "due_date",
  "weight",
];

/** Duplica a tarefa e suas subtarefas diretas (status volta para "A fazer"). */
export async function duplicateTask(id: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await getSessionContext();
  const supabase = await createClient();
  const { data: original, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .single();
  if (error || !original) return fail("Tarefa não encontrada.");

  const pick = (t: Record<string, unknown>) => Object.fromEntries(DUPLICABLE.map((k) => [k, t[k]]));
  const type = original.type === "recurring" ? "one_off" : original.type;

  const { data: copy, error: insertError } = await supabase
    .from("tasks")
    .insert({
      ...pick(original),
      type,
      parent_task_id: original.parent_task_id,
      title: `${original.title} (cópia)`.slice(0, 300),
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insertError) return fail(dbErrorMessage(insertError));

  const { data: kids } = await supabase
    .from("tasks")
    .select("*")
    .eq("parent_task_id", id)
    .is("archived_at", null)
    .order("position");
  if (kids?.length) {
    const { error: kidsError } = await supabase.from("tasks").insert(
      kids.map((k) => ({
        ...pick(k),
        type: k.type === "recurring" ? "one_off" : k.type,
        title: k.title,
        parent_task_id: copy.id,
        created_by: ctx.userId,
      })),
    );
    if (kidsError) return fail(`Tarefa duplicada, mas as subtarefas não: ${dbErrorMessage(kidsError)}`);
  }
  refresh();
  return { ok: true, data: { id: copy.id } };
}

export async function addComment(input: unknown): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await workspaceGuard(parsed.data.workspace_id);
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ ...parsed.data, author_id: ctx.userId });
  if (error) return fail(dbErrorMessage(error));
  refresh();
  return { ok: true, data: undefined };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/features/workspaces/context";
import { dbErrorMessage, fail, zodFail } from "@/lib/utils/errors";
import { TASK_PRIORITIES, type ActionResult } from "@/types/domain";

const optionalDate = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(200),
    description: z.string().max(5000).default(""),
    priority: z.enum(TASK_PRIORITIES).default("medium"),
    owner_id: z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => v || null),
    start_date: optionalDate,
    due_date: optionalDate,
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, {
    path: ["due_date"],
    message: "O prazo deve ser posterior ao início",
  });

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, workspace_id: ctx.workspace.id, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/projetos");
  revalidatePath("/tarefas");
  return { ok: true, data: { id: data.id } };
}

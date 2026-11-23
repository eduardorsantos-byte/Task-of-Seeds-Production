import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/types/domain";

const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const optionalDate = z
  .union([z.iso.date({ error: "Data inválida" }), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const taskFieldsSchema = z
  .object({
    title: z.string().trim().min(1, "Informe o título").max(300, "Máximo de 300 caracteres"),
    description: z.string().max(20000, "Descrição muito longa").default(""),
    type: z.enum(TASK_TYPES).default("one_off"),
    status: z.enum(TASK_STATUSES).default("todo"),
    priority: z.enum(TASK_PRIORITIES).default("medium"),
    assignee_id: optionalUuid,
    project_id: optionalUuid,
    start_date: optionalDate,
    due_date: optionalDate,
    weight: z.coerce.number().positive("O peso deve ser maior que zero").max(1000).default(1),
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, {
    path: ["due_date"],
    message: "O prazo deve ser igual ou posterior à data de início",
  });

export const createTaskSchema = taskFieldsSchema.and(
  z.object({ workspace_id: z.uuid(), parent_task_id: optionalUuid }),
);

export const updateTaskSchema = taskFieldsSchema.and(
  z.object({ id: z.uuid(), version: z.number().int().positive() }),
);

export const moveTaskSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.enum(TASK_STATUSES),
  position: z.number().finite().optional(),
});

export const quickTaskSchema = z.object({
  workspace_id: z.uuid(),
  title: z.string().trim().min(1, "Informe o título").max(300),
  status: z.enum(TASK_STATUSES).default("todo"),
  parent_task_id: optionalUuid,
  assignee_id: optionalUuid,
});

export const commentSchema = z.object({
  workspace_id: z.uuid(),
  task_id: z.uuid(),
  body: z.string().trim().min(1, "Escreva um comentário").max(10000),
});

export type TaskFormInput = z.input<typeof taskFieldsSchema>;
export type TaskFormValues = z.output<typeof taskFieldsSchema>;

/** Filtros da listagem (searchParams). Valores inválidos são descartados. */
export const taskFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(TASK_STATUSES).optional().catch(undefined),
  priority: z.enum(TASK_PRIORITIES).optional().catch(undefined),
  type: z.enum(TASK_TYPES).optional().catch(undefined),
  assignee: z.union([z.uuid(), z.literal("none"), z.literal("me")]).optional().catch(undefined),
  project: z.union([z.uuid(), z.literal("none")]).optional().catch(undefined),
  due: z.enum(["overdue", "soon", "none"]).optional().catch(undefined),
  archived: z.literal("1").optional().catch(undefined),
  view: z.enum(["kanban", "lista"]).optional().catch(undefined),
  sort: z.enum(["due_date", "priority", "title", "status", "updated_at"]).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});

export type TaskFilters = z.infer<typeof taskFiltersSchema>;

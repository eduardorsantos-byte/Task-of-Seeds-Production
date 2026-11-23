import type { TaskPriority, TaskStatus, TaskType } from "@/types/domain";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  in_review: "Em revisão",
  done: "Concluída",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const TYPE_LABEL: Record<TaskType, string> = {
  one_off: "Pontual",
  recurring: "Recorrente",
  project: "Projeto",
};

/** Classes da faixa de prioridade (borda do cartão). Cor + texto: nunca só cor. */
export const PRIORITY_BAR: Record<TaskPriority, string> = {
  low: "bg-border",
  medium: "bg-chart-2",
  high: "bg-warning",
  urgent: "bg-destructive",
};

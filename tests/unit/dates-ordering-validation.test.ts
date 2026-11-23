import { describe, expect, it } from "vitest";
import { dueLabel, dueState, todayInTimeZone } from "@/lib/utils/dates";
import { positionBetween } from "@/features/tasks/ordering";
import { sortTasks } from "@/features/tasks/sort";
import { safeNextPath } from "@/lib/utils/redirect";
import { createTaskSchema, taskFiltersSchema } from "@/lib/validations/tasks";
import { passwordSchema } from "@/lib/validations/auth";

describe("datas no fuso do workspace", () => {
  it("23h30 em São Paulo ainda é o mesmo dia, embora em UTC já seja o seguinte", () => {
    const instant = new Date("2026-11-20T02:30:00Z"); // 23:30 de 19/11 em São Paulo
    expect(todayInTimeZone("America/Sao_Paulo", instant)).toBe("2026-11-19");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-11-20");
  });

  it("classifica prazos", () => {
    const today = "2026-11-19";
    expect(dueState("2026-11-18", today).state).toBe("overdue");
    expect(dueState("2026-11-19", today).state).toBe("today");
    expect(dueState("2026-11-21", today, { soonDays: 2 }).state).toBe("soon");
    expect(dueState("2026-11-22", today, { soonDays: 2 }).state).toBe("later");
    expect(dueState("2026-11-10", today, { done: true }).state).toBe("done");
    expect(dueLabel("2026-11-16", today)).toBe("Atrasada há 3 dias");
    expect(dueLabel("2026-11-20", today)).toBe("Vence amanhã");
    expect(dueLabel(null, today)).toBe("Sem prazo");
  });
});

describe("ordenação do Kanban", () => {
  it("posição fica entre os vizinhos", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(5, undefined)).toBe(6);
    expect(positionBetween(undefined, 5)).toBe(4);
    expect(positionBetween(undefined, undefined, 99)).toBe(99);
  });

  it("lista: sem prazo vai para o fim nas duas direções", () => {
    const base = { status: "todo" as const, priority: "medium" as const, updated_at: "" };
    const tasks = [
      { ...base, title: "B", due_date: null },
      { ...base, title: "A", due_date: "2026-12-01" },
      { ...base, title: "C", due_date: "2026-11-01" },
    ];
    expect(sortTasks(tasks, "due_date", "asc").map((t) => t.title)).toEqual(["C", "A", "B"]);
    expect(sortTasks(tasks, "due_date", "desc").map((t) => t.title)).toEqual(["A", "C", "B"]);
  });
});

describe("validação", () => {
  const ws = "6f1c6b1e-6a0e-4f43-9c0c-1f2f7b5b8f01";

  it("tarefa: só o título é obrigatório; campos vazios viram null", () => {
    const r = createTaskSchema.parse({ workspace_id: ws, title: "  Relatório  ", assignee_id: "", due_date: "" });
    expect(r).toMatchObject({ title: "Relatório", assignee_id: null, due_date: null, priority: "medium", weight: 1 });
  });

  it("tarefa: rejeita prazo antes do início e título vazio", () => {
    expect(createTaskSchema.safeParse({ workspace_id: ws, title: "x", start_date: "2026-11-10", due_date: "2026-11-01" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ workspace_id: ws, title: "   " }).success).toBe(false);
  });

  it("filtros inválidos na URL são descartados, não quebram a página", () => {
    expect(taskFiltersSchema.parse({ status: "hacked", assignee: "1; drop", view: "lista" })).toEqual({ view: "lista" });
  });

  it("senha forte e confirmação", () => {
    expect(passwordSchema.safeParse({ password: "curta1", confirm: "curta1" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "senhaforte123", confirm: "outra" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "senhaforte123", confirm: "senhaforte123" }).success).toBe(true);
  });

  it("redirecionamento só para caminhos internos", () => {
    expect(safeNextPath("/tarefas?view=lista")).toBe("/tarefas?view=lista");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });
});

import { describe, expect, it } from "vitest";
import { buildChildrenIndex, operationalProgress, subtaskCounts, taskProgress } from "@/features/tasks/progress";

const t = (id: string, status: string, weight = 1, parent: string | null = null, archived = false) => ({
  id,
  parent_task_id: parent,
  status,
  weight,
  archived_at: archived ? "2026-01-01" : null,
});

describe("progresso operacional", () => {
  it("tarefa sem subtarefas: 0 ou 1", () => {
    const idx = buildChildrenIndex([]);
    expect(taskProgress(t("a", "todo"), idx)).toBe(0);
    expect(taskProgress(t("a", "in_review"), idx)).toBe(0);
    expect(taskProgress(t("a", "done"), idx)).toBe(1);
  });

  it("pai é a média ponderada dos filhos", () => {
    const tasks = [t("p", "in_progress"), t("c1", "done", 3, "p"), t("c2", "todo", 1, "p")];
    expect(taskProgress(tasks[0], buildChildrenIndex(tasks))).toBeCloseTo(0.75);
  });

  it("sem contagem dupla: subtarefas ocupam só o slot do pai no projeto", () => {
    // Projeto com 2 tarefas raiz de peso 1. A primeira tem 4 subtarefas concluídas.
    // Contagem ingênua (6 itens, 5 concluídos) daria 83%; o correto é 50%.
    const tasks = [
      t("a", "todo"),
      t("a1", "done", 1, "a"),
      t("a2", "done", 1, "a"),
      t("a3", "done", 1, "a"),
      t("a4", "done", 1, "a"),
      t("b", "todo"),
    ];
    expect(operationalProgress(tasks)).toBeCloseTo(0.5);
  });

  it("vários níveis e pesos", () => {
    const tasks = [
      t("root", "todo", 2),
      t("x", "todo", 1, "root"),
      t("x1", "done", 1, "x"),
      t("x2", "todo", 1, "x"),
      t("y", "done", 1, "root"),
      t("other", "done", 2),
    ];
    // x = 0.5; root = (0.5 + 1)/2 = 0.75; projeto = (2*0.75 + 2*1)/4 = 0.875
    expect(operationalProgress(tasks)).toBeCloseTo(0.875);
  });

  it("pai concluído vale 1 mesmo com subtarefas abertas", () => {
    const tasks = [t("p", "done"), t("c", "todo", 1, "p")];
    expect(operationalProgress(tasks)).toBe(1);
  });

  it("arquivadas são ignoradas; conjunto vazio retorna null", () => {
    const tasks = [t("p", "todo"), t("c1", "done", 1, "p"), t("c2", "todo", 1, "p", true)];
    expect(operationalProgress(tasks)).toBe(1);
    expect(operationalProgress([])).toBeNull();
  });

  it("subtarefa cujo pai está fora do conjunto conta como raiz", () => {
    expect(operationalProgress([t("c", "done", 1, "fora")])).toBe(1);
  });

  it("contagem de subtarefas diretas", () => {
    const tasks = [t("p", "todo"), t("c1", "done", 1, "p"), t("c2", "todo", 1, "p"), t("g", "done", 1, "c2")];
    expect(subtaskCounts("p", buildChildrenIndex(tasks))).toEqual({ done: 1, total: 2 });
  });

  it("resiste a ciclo (defesa; o banco já impede)", () => {
    const tasks = [t("a", "todo", 1, "b"), t("b", "todo", 1, "a")];
    expect(() => taskProgress(tasks[0], buildChildrenIndex(tasks))).not.toThrow();
  });
});

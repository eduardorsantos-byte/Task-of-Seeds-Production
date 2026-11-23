import { describe, expect, it } from "vitest";
import { metricProgress } from "@/features/goals/metric-progress";

describe("progresso de resultado", () => {
  it("meta de redução: 20h → 10h, atual 15h = 50% (exemplo da especificação)", () => {
    expect(metricProgress({ direction: "decrease", baseline: 20, target: 10, current: 15 })).toBeCloseTo(0.5);
  });

  it("meta de redução: piorar fica em 0, superar fica em 100%", () => {
    expect(metricProgress({ direction: "decrease", baseline: 20, target: 10, current: 25 })).toBe(0);
    expect(metricProgress({ direction: "decrease", baseline: 20, target: 10, current: 8 })).toBe(1);
  });

  it("meta de aumento", () => {
    expect(metricProgress({ direction: "increase", baseline: 60, target: 90, current: 75 })).toBeCloseTo(0.5);
    expect(metricProgress({ direction: "increase", baseline: 60, target: 90, current: 50 })).toBe(0);
  });

  it("manutenção em faixa", () => {
    const m = { direction: "range" as const, min: 95, max: 105 };
    expect(metricProgress({ ...m, current: 100 })).toBe(1);
    expect(metricProgress({ ...m, current: 105 })).toBe(1);
    expect(metricProgress({ ...m, current: 110 })).toBe(0);
  });

  it("sem valor atual ou alvo igual ao inicial: indefinido", () => {
    expect(metricProgress({ direction: "increase", baseline: 1, target: 2, current: null })).toBeNull();
    expect(metricProgress({ direction: "increase", baseline: 1, target: 1, current: 1 })).toBeNull();
  });
});

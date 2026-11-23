/**
 * Progresso de resultado de um indicador (0..1) — espelha public.metric_progress
 * no banco. Metodologia em docs/ARCHITECTURE.md §5.2.
 */
export type MetricDirection = "increase" | "decrease" | "range";

export type MetricInput = {
  direction: MetricDirection;
  baseline?: number | null;
  current?: number | null;
  target?: number | null;
  min?: number | null;
  max?: number | null;
};

export function metricProgress(m: MetricInput): number | null {
  if (m.current == null) return null;
  if (m.direction === "range") {
    if (m.min == null || m.max == null) return null;
    return m.current >= m.min && m.current <= m.max ? 1 : 0;
  }
  if (m.baseline == null || m.target == null || m.target === m.baseline) return null;
  const raw = (m.current - m.baseline) / (m.target - m.baseline);
  return Math.min(1, Math.max(0, raw));
}

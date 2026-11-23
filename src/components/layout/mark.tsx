/** Marca: três barras de prazo escalonadas (planejado → em curso → entregue). */
export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="7" className="fill-primary" />
      <rect x="7" y="8" width="8" height="3" rx="1.5" className="fill-primary-foreground/55" />
      <rect x="7" y="12.5" width="12" height="3" rx="1.5" className="fill-primary-foreground/80" />
      <rect x="7" y="17" width="14" height="3" rx="1.5" className="fill-primary-foreground" />
    </svg>
  );
}

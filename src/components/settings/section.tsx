export function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-[14rem_1fr]" aria-labelledby={title}>
      <div>
        <h2 id={title} className="text-sm font-semibold">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-lg border bg-card p-4">{children}</div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/features/workspaces/context";
import { getOverview } from "@/features/tasks/queries";
import { DueBadge, PriorityBadge } from "@/components/tasks/task-badges";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visão geral" };

export default async function OverviewPage() {
  const ctx = await getSessionContext();
  const o = await getOverview(ctx);
  const firstName = ctx.profile.full_name.split(" ")[0] || "";

  const stats = [
    { label: "Abertas", value: o.open, href: "/tarefas?view=lista" },
    { label: "Em andamento", value: o.inProgress, href: "/tarefas?view=lista&status=in_progress" },
    { label: "Atrasadas", value: o.overdue, href: "/tarefas?view=lista&due=overdue", tone: o.overdue > 0 ? "danger" : undefined },
    { label: "Vencem em breve", value: o.dueSoon, href: "/tarefas?view=lista&due=soon", tone: o.dueSoon > 0 ? "warn" : undefined },
  ];

  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}` : "Visão geral"} description={`Hoje é ${new Date(`${ctx.today}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}.`} />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className={cn("mt-1 text-3xl font-semibold tabular-nums", s.tone === "danger" && "text-destructive", s.tone === "warn" && "text-warning")}>
              {s.value}
            </p>
          </Link>
        ))}
        <div className="col-span-2 rounded-lg border bg-card p-4 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Entregas no prazo (30 dias)</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {o.onTimeRate === null ? "—" : `${Math.round(o.onTimeRate * 100)}%`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {o.onTimeBase > 0 ? `${o.onTimeBase} concluídas com prazo · ${o.doneLast30} no total` : "Sem entregas com prazo no período"}
          </p>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="prioridades">
        <h2 id="prioridades" className="mb-3 text-sm font-semibold">
          Suas prioridades e tarefas sem responsável
        </h2>
        {o.priorityTasks.length === 0 ? (
          <EmptyState icon={<CalendarCheck2 />} title="Nada vencendo nos próximos dias">
            Tarefas atrasadas ou com prazo próximo atribuídas a você aparecem aqui.
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {o.priorityTasks.map((t) => (
              <li key={t.id}>
                <Link href={`/tarefas?tarefa=${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-accent">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  <PriorityBadge priority={t.priority} />
                  <DueBadge dueDate={t.due_date} today={ctx.today} soonDays={ctx.workspace.due_soon_days} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        Gráficos de evolução, distribuição por responsável e ganhos validados chegam na Fase 4.
      </p>
    </>
  );
}

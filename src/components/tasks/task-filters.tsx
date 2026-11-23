"use client";

import { useEffect, useState } from "react";
import { Columns3, List, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { displayName } from "@/features/workspaces/display";
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/features/tasks/constants";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/types/domain";
import { cn } from "@/lib/utils";
import { useUrlState } from "./use-url-state";

const ALL = "__all";
const FILTER_KEYS = ["q", "status", "priority", "type", "assignee", "project", "due", "archived"];

export function TaskFilters({ view }: { view: "kanban" | "lista" }) {
  const { members, projects } = useWorkspace();
  const { params, set } = useUrlState();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Busca com espera curta para não recarregar a cada tecla
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => set({ q: q || null }, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [q, params, set]);

  const active = FILTER_KEYS.filter((k) => params.get(k)).length;
  const [showMobile, setShowMobile] = useState(false);

  const select = (key: string, label: string, options: { value: string; label: string }[]) => (
    <Select value={params.get(key) ?? ALL} onValueChange={(v) => set({ [key]: v === ALL ? null : v }, { replace: true })}>
      <SelectTrigger size="sm" className={cn("w-auto min-w-32", params.get(key) && "border-primary/50 bg-primary/5")} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full sm:w-60">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefas" aria-label="Buscar tarefas por título" className="h-8 pl-8" />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="md:hidden"
        aria-expanded={showMobile}
        aria-controls="filtros-avancados"
        onClick={() => setShowMobile((v) => !v)}
      >
        <SlidersHorizontal /> Filtros{active > 0 && ` (${active})`}
      </Button>

      <div id="filtros-avancados" className={cn("w-full flex-wrap items-center gap-2 md:flex md:w-auto", showMobile ? "flex" : "hidden")}>
      {select("assignee", "Responsável", [
        { value: "me", label: "Minhas tarefas" },
        { value: "none", label: "Sem responsável" },
        ...members.map((m) => ({ value: m.user_id, label: displayName(m.profile) })),
      ])}
      {select("priority", "Prioridade", TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })))}
      {select("type", "Tipo", TASK_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })))}
      {projects.length > 0 &&
        select("project", "Projeto", [{ value: "none", label: "Sem projeto" }, ...projects.map((p) => ({ value: p.id, label: p.name }))])}
      {select(
        "due",
        "Prazo",
        [
          { value: "overdue", label: "Atrasadas" },
          { value: "soon", label: "Próximas do vencimento" },
          { value: "none", label: "Sem prazo" },
        ])}
      {view === "lista" && select("status", "Status", TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })))}

      <Button
        variant={params.get("archived") ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={Boolean(params.get("archived"))}
        onClick={() => set({ archived: params.get("archived") ? null : "1" }, { replace: true })}
      >
        Arquivadas
      </Button>

      </div>

      {active > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), { replace: true });
          }}
        >
          <X /> Limpar filtros ({active})
        </Button>
      )}

      <div className="ml-auto flex rounded-md border bg-card p-0.5" role="group" aria-label="Visualização">
        <Button
          variant={view === "kanban" ? "secondary" : "ghost"}
          size="sm"
          className="h-7"
          aria-pressed={view === "kanban"}
          onClick={() => set({ view: null, status: null })}
        >
          <Columns3 /> Quadro
        </Button>
        <Button variant={view === "lista" ? "secondary" : "ghost"} size="sm" className="h-7" aria-pressed={view === "lista"} onClick={() => set({ view: "lista" })}>
          <List /> Lista
        </Button>
      </div>
    </div>
  );
}

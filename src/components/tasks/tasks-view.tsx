"use client";

import { useState } from "react";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import type { TaskDetail, TaskRow } from "@/features/tasks/queries";
import { KanbanBoard } from "./kanban-board";
import { TaskDetailSheet } from "./task-detail-sheet";
import { TaskFilters } from "./task-filters";
import { TaskForm } from "./task-form";
import { TaskList } from "./task-list";
import { useUrlState } from "./use-url-state";

export function TasksView({
  view,
  tasks,
  truncated,
  filtered,
  detail,
  openId,
}: {
  view: "kanban" | "lista";
  tasks: TaskRow[];
  truncated: boolean;
  filtered: boolean;
  detail: TaskDetail | null;
  openId: string | null;
}) {
  const { set } = useUrlState();
  const [creating, setCreating] = useState(false);
  const openTask = (id: string) => set({ tarefa: id });
  const closeTask = () => set({ tarefa: null }, { replace: true });

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Demandas pontuais, recorrentes e de projetos em um só lugar."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nova tarefa
          </Button>
        }
      />
      <TaskFilters view={view} />

      {truncated && (
        <p role="status" className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Mostrando as primeiras 500 tarefas. Use os filtros para refinar.
        </p>
      )}

      {tasks.length === 0 && (view === "lista" || filtered) ? (
        <EmptyState
          icon={<ListTodo />}
          title={filtered ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa ainda"}
          action={
            !filtered && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Criar a primeira tarefa
              </Button>
            )
          }
        >
          {filtered ? "Ajuste ou limpe os filtros para ver mais resultados." : "Crie uma tarefa ou use “Adicionar tarefa” em uma coluna do quadro."}
        </EmptyState>
      ) : view === "kanban" ? (
        <KanbanBoard tasks={tasks} onOpenTask={openTask} />
      ) : (
        <TaskList tasks={tasks} onOpenTask={openTask} />
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Só o título é obrigatório. O resto pode ser preenchido depois.</DialogDescription>
          </DialogHeader>
          <TaskForm
            onCancel={() => setCreating(false)}
            onSaved={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <TaskDetailSheet detail={detail} open={Boolean(openId)} onClose={closeTask} onOpenTask={openTask} />
    </>
  );
}

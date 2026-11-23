"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { moveTask, quickCreateTask } from "@/features/tasks/actions";
import { STATUS_LABEL } from "@/features/tasks/constants";
import { positionBetween } from "@/features/tasks/ordering";
import type { TaskRow } from "@/features/tasks/queries";
import { TASK_STATUSES, type TaskStatus } from "@/types/domain";
import { cn } from "@/lib/utils";
import { StatusDot } from "./task-badges";
import { TaskCard } from "./task-card";

type Columns = Record<TaskStatus, string[]>;
const COL_PREFIX = "col:";

function buildColumns(tasks: TaskRow[]): Columns {
  const cols = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as string[]])) as Columns;
  for (const t of [...tasks].sort((a, b) => a.position - b.position)) cols[t.status].push(t.id);
  return cols;
}

export function KanbanBoard({ tasks, onOpenTask }: { tasks: TaskRow[]; onOpenTask: (id: string) => void }) {
  const [byId, setById] = useState(() => new Map(tasks.map((t) => [t.id, t])));
  const [columns, setColumns] = useState<Columns>(() => buildColumns(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const snapshot = useRef<{ columns: Columns; byId: Map<string, TaskRow> } | null>(null);
  const [, startTransition] = useTransition();

  // Dados do servidor (ou Realtime) substituem o estado local, exceto durante um arraste.
  // Ajuste durante o render (padrão do React), sem effect.
  const [syncedFrom, setSyncedFrom] = useState(tasks);
  if (tasks !== syncedFrom && !activeId) {
    setSyncedFrom(tasks);
    setById(new Map(tasks.map((t) => [t.id, t])));
    setColumns(buildColumns(tasks));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string, cols = columns): TaskStatus | undefined => {
    if (id.startsWith(COL_PREFIX)) return id.slice(COL_PREFIX.length) as TaskStatus;
    return TASK_STATUSES.find((s) => cols[s].includes(id));
  };

  const setStatusLocally = (id: string, status: TaskStatus) => {
    setColumns((cols) => {
      const from = findColumn(id, cols);
      if (!from || from === status) return cols;
      return { ...cols, [from]: cols[from].filter((x) => x !== id), [status]: [...cols[status], id] };
    });
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    snapshot.current = { columns, byId };
    setActiveId(String(active.id));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const overIndex = cols[to].indexOf(String(over.id));
      const index = overIndex >= 0 ? overIndex : cols[to].length;
      const target = [...cols[to]];
      target.splice(index, 0, String(active.id));
      return { ...cols, [from]: cols[from].filter((x) => x !== active.id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setActiveId(null);
    const before = snapshot.current;
    snapshot.current = null;
    if (!over || !before) return;

    const to = findColumn(String(over.id));
    if (!to) return;

    let col = columns[to];
    const oldIndex = col.indexOf(id);
    const overIndex = String(over.id).startsWith(COL_PREFIX) ? col.length - 1 : col.indexOf(String(over.id));
    if (oldIndex !== overIndex && overIndex >= 0) col = arrayMove(col, oldIndex, overIndex);
    const nextColumns = { ...columns, [to]: col };
    setColumns(nextColumns);

    const task = byId.get(id);
    if (!task) return;
    const idx = col.indexOf(id);
    const prev = byId.get(col[idx - 1])?.position;
    const next = byId.get(col[idx + 1])?.position;
    const originalStatus = before.byId.get(id)?.status;
    const unchangedOrder = before.columns[to].join() === col.join();
    if (originalStatus === to && unchangedOrder) return;

    const position = positionBetween(prev, next);
    setById((m) => new Map(m).set(id, { ...task, status: to, position }));

    startTransition(async () => {
      const result = await moveTask({ id, version: task.version, status: to, position });
      if (!result.ok) {
        setColumns(before.columns);
        setById(before.byId);
        toast.error(result.error);
        return;
      }
      setById((m) => {
        const current = m.get(id);
        return current ? new Map(m).set(id, { ...current, version: result.data.version }) : m;
      });
    });
  };

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => `Tarefa ${byId.get(String(active.id))?.title ?? ""} selecionada.`,
      onDragOver: ({ over }) => (over ? `Sobre ${describe(String(over.id))}.` : "Fora de uma coluna."),
      onDragEnd: ({ over }) => (over ? `Tarefa solta em ${describe(String(over.id))}.` : "Movimento cancelado."),
      onDragCancel: () => "Movimento cancelado.",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byId, columns],
  );

  function describe(overId: string) {
    const status = findColumn(overId);
    return status ? `coluna ${STATUS_LABEL[status]}` : "uma coluna";
  }

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        if (snapshot.current) {
          setColumns(snapshot.current.columns);
          setById(snapshot.current.byId);
        }
        snapshot.current = null;
        setActiveId(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Para mover, pressione espaço ou Enter, use as setas e pressione espaço de novo para soltar. Esc cancela. Também é possível usar o menu de ações do cartão.",
        },
      }}
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {TASK_STATUSES.map((status) => (
          <KanbanColumn key={status} status={status} count={columns[status].length}>
            <SortableContext items={columns[status]} strategy={verticalListSortingStrategy}>
              {columns[status].map((id) => {
                const t = byId.get(id);
                return t ? (
                  <SortableCard key={id} task={t} onOpen={() => onOpenTask(id)} onOptimisticStatus={(s) => setStatusLocally(id, s)} />
                ) : null;
              })}
            </SortableContext>
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <TaskCard task={active} onOpen={() => undefined} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ status, count, children }: { status: TaskStatus; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${status}` });
  return (
    <section
      aria-label={`${STATUS_LABEL[status]}, ${count} tarefas`}
      className="flex w-[82vw] max-w-72 shrink-0 snap-start flex-col rounded-lg bg-secondary/60 sm:w-64 xl:w-auto xl:max-w-none xl:min-w-52 xl:flex-1"
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <StatusDot status={status} />
        <h2 className="text-sm font-medium">{STATUS_LABEL[status]}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </header>
      <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2", isOver && "rounded-md bg-primary/5")}>
        {children}
        {count === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Arraste uma tarefa para cá</p>}
      </div>
      {status !== "done" && <QuickAdd status={status} />}
    </section>
  );
}

function SortableCard({
  task,
  onOpen,
  onOptimisticStatus,
}: {
  task: TaskRow;
  onOpen: () => void;
  onOptimisticStatus: (s: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      onOpen={onOpen}
      onOptimisticStatus={onOptimisticStatus}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="cursor-grab touch-manipulation active:cursor-grabbing"
      {...attributes}
      {...listeners}
      aria-roledescription="tarefa arrastável"
    />
  );
}

/** Criação rápida: digite e Enter. Continua aberto para a próxima. */
function QuickAdd({ status }: { status: TaskStatus }) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-2 mb-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden="true" /> Adicionar tarefa
      </button>
    );
  }

  return (
    <form
      className="px-2 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = title.trim();
        if (!value) return;
        start(async () => {
          const result = await quickCreateTask({ workspace_id: workspace.id, title: value, status });
          if (!result.ok) toast.error(result.error);
          else setTitle("");
        });
      }}
    >
      <Input
        autoFocus
        value={title}
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        onBlur={() => !title && setOpen(false)}
        placeholder="Título e Enter"
        aria-label={`Nova tarefa em ${STATUS_LABEL[status]}`}
        maxLength={300}
        className="bg-card"
      />
    </form>
  );
}

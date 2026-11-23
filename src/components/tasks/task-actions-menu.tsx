"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowRightLeft, Copy, Flag, MoreHorizontal, PanelRightOpen, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { displayName } from "@/features/workspaces/display";
import { archiveTask, duplicateTask, patchTask } from "@/features/tasks/actions";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/features/tasks/constants";
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from "@/types/domain";

const NONE = "__none";

type Props = {
  task: Pick<Task, "id" | "title" | "status" | "priority" | "assignee_id" | "version" | "archived_at">;
  onOpen?: () => void;
  /** Atualização otimista local (Kanban). */
  onOptimisticStatus?: (status: Task["status"]) => void;
  align?: "start" | "end";
};

/**
 * Menu de ações da tarefa. É também a alternativa ao arrastar-e-soltar:
 * "Mover para" funciona por teclado, leitor de tela e toque.
 */
export function TaskActionsMenu({ task, onOpen, onOptimisticStatus, align = "end" }: Props) {
  const { members } = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
      } else if (success) toast.success(success);
    });

  const patch = (p: Record<string, unknown>, success?: string) =>
    run(() => patchTask({ id: task.id, version: task.version, patch: p }), success);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Ações da tarefa ${task.title}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-52" onClick={(e) => e.stopPropagation()}>
          {onOpen && (
            <DropdownMenuItem onSelect={onOpen}>
              <PanelRightOpen /> Abrir detalhes
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRightLeft /> Mover para
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={task.status}
                onValueChange={(v) => {
                  onOptimisticStatus?.(v as Task["status"]);
                  patch({ status: v }, `Movida para “${STATUS_LABEL[v as Task["status"]]}”`);
                }}
              >
                {TASK_STATUSES.map((s) => (
                  <DropdownMenuRadioItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <UserRound /> Responsável
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={task.assignee_id ?? NONE}
                onValueChange={(v) => patch({ assignee_id: v === NONE ? null : v }, "Responsável atualizado")}
              >
                <DropdownMenuRadioItem value={NONE}>Sem responsável</DropdownMenuRadioItem>
                {members.map((m) => (
                  <DropdownMenuRadioItem key={m.user_id} value={m.user_id}>
                    {displayName(m.profile)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Flag /> Prioridade
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={task.priority} onValueChange={(v) => patch({ priority: v }, "Prioridade atualizada")}>
                {TASK_PRIORITIES.map((p) => (
                  <DropdownMenuRadioItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run(() => duplicateTask(task.id), "Tarefa duplicada")}>
            <Copy /> Duplicar
          </DropdownMenuItem>
          {task.archived_at ? (
            <DropdownMenuItem onSelect={() => run(() => archiveTask(task.id, task.version, false), "Tarefa restaurada")}>
              <ArchiveRestore /> Restaurar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmArchive(true)}>
              <Archive /> Arquivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar “{task.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa e suas subtarefas saem do quadro e da lista. O histórico é mantido e você pode restaurá-la pelo
              filtro “Arquivadas”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => archiveTask(task.id, task.version, true), "Tarefa arquivada")}>
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

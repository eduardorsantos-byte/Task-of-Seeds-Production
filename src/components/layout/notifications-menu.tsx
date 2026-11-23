"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsRead } from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/queries";
import { cn } from "@/lib/utils";

export function NotificationsMenu({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const [pending, start] = useTransition();
  const label = unread ? `Notificações: ${unread} não lidas` : "Notificações";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label}>
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notificações</p>
          {unread > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={pending} onClick={() => start(() => markNotificationsRead("all"))}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nada por aqui. Atribuições, prazos e comentários aparecem nesta lista.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.entity_type === "task" && n.entity_id ? `/tarefas?tarefa=${n.entity_id}` : "/"}
                  onClick={() => !n.read_at && start(() => markNotificationsRead([n.id]))}
                  className={cn("block border-b px-3 py-2.5 text-sm last:border-0 hover:bg-accent", !n.read_at && "bg-primary/5")}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {!n.read_at && <span className="size-1.5 rounded-full bg-primary" aria-label="não lida" />}
                    {n.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-muted-foreground">{n.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

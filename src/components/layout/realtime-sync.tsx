"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Sincronização entre usuários: escuta mudanças em tarefas, comentários e
 * notificações do workspace (Realtime respeita RLS) e atualiza a tela.
 * Agrupa eventos próximos para evitar recarregamentos em cascata.
 */
export function RealtimeSync({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const filter = `workspace_id=eq.${workspaceId}`;
    const channel = supabase
      .channel(`ws:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, schedule)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter }, schedule)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, schedule)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, router]);

  return null;
}

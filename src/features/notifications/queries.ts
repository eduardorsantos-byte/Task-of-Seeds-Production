import "server-only";
import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export async function listNotifications(userId: string, workspaceId: string) {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, entity_type, entity_id, read_at, created_at")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .is("read_at", null),
  ]);
  return { items: (data ?? []) as NotificationItem[], unread: count ?? 0 };
}

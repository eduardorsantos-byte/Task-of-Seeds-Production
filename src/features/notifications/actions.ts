"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/features/workspaces/context";

export async function markNotificationsRead(ids: string[] | "all") {
  const userId = await requireUserId();
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  if (ids !== "all") q = q.in("id", z.array(z.uuid()).max(200).parse(ids));
  await q;
  revalidatePath("/", "layout");
}

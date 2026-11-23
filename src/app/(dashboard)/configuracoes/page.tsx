import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { MembersSection } from "@/components/settings/members-section";
import { ProfileSection, WorkspaceSection } from "@/components/settings/profile-section";
import { getSessionContext } from "@/features/workspaces/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await getSessionContext();
  const canManage = ctx.permissions.includes("members.manage");
  let invitations: { id: string; email: string; created_at: string; expires_at: string }[] = [];
  if (canManage) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspace_invitations")
      .select("id, email, created_at, expires_at")
      .eq("workspace_id", ctx.workspace.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    invitations = data ?? [];
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configurações" />
      <div className="grid gap-8">
        <ProfileSection fullName={ctx.profile.full_name} email={ctx.profile.email} theme={ctx.profile.theme} />
        <WorkspaceSection name={ctx.workspace.name} timezone={ctx.workspace.timezone} canEdit={ctx.permissions.includes("workspace.manage")} />
        <MembersSection canManage={canManage} invitations={invitations} />
      </div>
    </div>
  );
}

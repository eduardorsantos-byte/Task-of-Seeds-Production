import { AppShell } from "@/components/layout/app-shell";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { RealtimeSync } from "@/components/layout/realtime-sync";
import { WorkspaceProvider } from "@/components/layout/workspace-provider";
import { displayName, getSessionContext } from "@/features/workspaces/context";
import { listNotifications } from "@/features/notifications/queries";
import { listProjects } from "@/features/tasks/queries";

/** Telas autenticadas: sempre renderizadas por requisição (dados por usuário, RLS). */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  const [notifications, projects] = await Promise.all([
    listNotifications(ctx.userId, ctx.workspace.id),
    listProjects(ctx),
  ]);

  return (
    <WorkspaceProvider
      value={{
        userId: ctx.userId,
        workspace: ctx.workspace,
        members: ctx.members,
        permissions: ctx.permissions,
        today: ctx.today,
        projects: projects.map(({ id, name, color, status }) => ({ id, name, color, status })),
      }}
    >
      <AppShell
        workspace={ctx.workspace}
        workspaces={ctx.workspaces}
        userName={displayName(ctx.profile)}
        userEmail={ctx.profile.email}
        notifications={<NotificationsMenu items={notifications.items} unread={notifications.unread} />}
      >
        {children}
      </AppShell>
      <RealtimeSync workspaceId={ctx.workspace.id} />
    </WorkspaceProvider>
  );
}

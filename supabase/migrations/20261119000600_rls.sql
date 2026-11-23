-- =============================================================================
-- 0006 — Row Level Security, grants, Realtime
-- Regra geral: só membros do workspace leem/escrevem dados do workspace.
-- Sem políticas de DELETE em entidades com exclusão lógica.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grants (defesa em profundidade: anon não acessa nada)
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;
grant execute on function public.review_business_impact(uuid, text, text, integer) to authenticated;
grant execute on function public.metric_progress(text, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Notificações: usuário só pode marcar como lida.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Tabelas internas: somente service_role / funções security definer.
revoke all on public.email_outbox from authenticated;
revoke all on public.automation_runs from authenticated;

-- Histórico: somente leitura para usuários.
revoke insert, update, delete on public.activity_logs from authenticated;
revoke insert, update, delete on public.business_impact_reviews from authenticated;

-- -----------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas
-- -----------------------------------------------------------------------------

alter table public.profiles                      enable row level security;
alter table public.workspaces                    enable row level security;
alter table public.workspace_members             enable row level security;
alter table public.workspace_member_permissions  enable row level security;
alter table public.workspace_invitations         enable row level security;
alter table public.categories                    enable row level security;
alter table public.objectives                    enable row level security;
alter table public.goals                         enable row level security;
alter table public.goal_metrics                  enable row level security;
alter table public.goal_metric_history           enable row level security;
alter table public.projects                      enable row level security;
alter table public.project_members               enable row level security;
alter table public.project_goals                 enable row level security;
alter table public.task_recurrences              enable row level security;
alter table public.tasks                         enable row level security;
alter table public.comments                      enable row level security;
alter table public.attachments                   enable row level security;
alter table public.activity_logs                 enable row level security;
alter table public.notifications                 enable row level security;
alter table public.notification_preferences      enable row level security;
alter table public.email_outbox                  enable row level security;
alter table public.automation_runs               enable row level security;
alter table public.business_impacts              enable row level security;
alter table public.business_impact_reviews       enable row level security;

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_workspace_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Workspace, membros, permissões, convites
-- -----------------------------------------------------------------------------

create policy workspaces_select on public.workspaces for select to authenticated
  using (private.is_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.has_permission(id, 'workspace.manage'))
  with check (private.has_permission(id, 'workspace.manage'));

create policy members_select on public.workspace_members for select to authenticated
  using (private.is_member(workspace_id));
create policy members_update on public.workspace_members for update to authenticated
  using (private.has_permission(workspace_id, 'members.manage'))
  with check (private.has_permission(workspace_id, 'members.manage'));
create policy members_delete on public.workspace_members for delete to authenticated
  using (private.has_permission(workspace_id, 'members.manage') and user_id <> (select auth.uid()));

create policy perms_select on public.workspace_member_permissions for select to authenticated
  using (private.is_member(workspace_id));
create policy perms_insert on public.workspace_member_permissions for insert to authenticated
  with check (private.has_permission(workspace_id, 'members.manage'));
create policy perms_delete on public.workspace_member_permissions for delete to authenticated
  using (private.has_permission(workspace_id, 'members.manage'));

create policy invitations_select on public.workspace_invitations for select to authenticated
  using (private.has_permission(workspace_id, 'members.manage'));
create policy invitations_insert on public.workspace_invitations for insert to authenticated
  with check (private.has_permission(workspace_id, 'members.manage') and invited_by = (select auth.uid()));
create policy invitations_update on public.workspace_invitations for update to authenticated
  using (private.has_permission(workspace_id, 'members.manage'))
  with check (private.has_permission(workspace_id, 'members.manage'));

-- -----------------------------------------------------------------------------
-- Entidades do workspace: leitura/escrita por membros (sem DELETE)
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'objectives', 'goals', 'goal_metrics', 'goal_metric_history',
    'projects', 'task_recurrences', 'business_impacts'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (private.is_member(workspace_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated with check (private.is_member(workspace_id))', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id))', t);
  end loop;
end;
$$;

-- Tabelas de associação: membros podem vincular e desvincular.
do $$
declare
  t text;
begin
  foreach t in array array['project_members', 'project_goals'] loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (private.is_member(workspace_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated with check (private.is_member(workspace_id))', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated using (private.is_member(workspace_id))', t);
  end loop;
end;
$$;

-- Tarefas
create policy tasks_select on public.tasks for select to authenticated
  using (private.is_member(workspace_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (private.is_member(workspace_id) and created_by = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));

-- Comentários: todos os membros leem; só o autor edita/exclui (lógico).
create policy comments_select on public.comments for select to authenticated
  using (private.is_member(workspace_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (private.is_member(workspace_id) and author_id = (select auth.uid()));
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and private.is_member(workspace_id))
  with check (author_id = (select auth.uid()));

-- Anexos (metadados)
create policy attachments_select on public.attachments for select to authenticated
  using (private.is_member(workspace_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (private.is_member(workspace_id) and uploaded_by = (select auth.uid()));
create policy attachments_update on public.attachments for update to authenticated
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));

-- Histórico (somente leitura)
create policy activity_logs_select on public.activity_logs for select to authenticated
  using (private.is_member(workspace_id));
create policy impact_reviews_select on public.business_impact_reviews for select to authenticated
  using (private.is_member(workspace_id));

-- Notificações: cada um vê só as suas
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy notif_prefs_all on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()) and private.is_member(workspace_id))
  with check (user_id = (select auth.uid()) and private.is_member(workspace_id));

-- email_outbox e automation_runs: sem políticas (apenas service_role).

-- -----------------------------------------------------------------------------
-- Realtime (respeita RLS)
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks, public.comments, public.notifications;
  end if;
end;
$$;

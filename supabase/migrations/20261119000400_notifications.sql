-- =============================================================================
-- 0004 — Notificações internas, preferências, fila de e-mail, execuções
-- =============================================================================

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in (
                 'task_assigned', 'task_due_changed', 'task_due_soon', 'task_overdue', 'task_commented',
                 'impact_review_requested', 'impact_approved', 'impact_rejected', 'impact_changes_requested')),
  title        text not null,
  body         text not null default '',
  entity_type  text,
  entity_id    uuid,
  actor_id     uuid references public.profiles (id) on delete set null,
  dedupe_key   text unique,
  read_at      timestamptz,
  emailed_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  workspace_id uuid not null,
  user_id      uuid not null,
  type         text not null,
  in_app       boolean not null default true,
  email        boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, type),
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

-- Fila de e-mails (Fase 5). Envio real só com provedor configurado.
create table public.email_outbox (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete cascade,
  to_email     text not null,
  subject      text not null,
  body_text    text not null,
  body_html    text,
  dedupe_key   text not null unique,
  status       text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts     smallint not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index email_outbox_pending_idx on public.email_outbox (created_at) where status = 'pending';

-- Registro de execuções das automações.
create table public.automation_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  result      jsonb,
  error       text
);

create index automation_runs_job_idx on public.automation_runs (job, started_at desc);

-- -----------------------------------------------------------------------------
-- Função central de notificação
--  - não notifica o próprio autor da ação
--  - respeita preferência in_app (padrão: ligado)
--  - dedupe_key evita duplicatas em automações repetidas
-- -----------------------------------------------------------------------------

create or replace function private.notify(
  p_workspace_id uuid, p_user_id uuid, p_type text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id = auth.uid() then
    return;
  end if;
  if exists (
    select 1 from public.notification_preferences np
    where np.workspace_id = p_workspace_id and np.user_id = p_user_id
      and np.type = p_type and not np.in_app
  ) then
    return;
  end if;

  insert into public.notifications (workspace_id, user_id, type, title, body, entity_type, entity_id, actor_id, dedupe_key)
  values (p_workspace_id, p_user_id, p_type, p_title, coalesce(p_body, ''), p_entity_type, p_entity_id, auth.uid(), p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Eventos de tarefa
create or replace function private.tasks_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null then
    return null;
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform private.notify(new.workspace_id, new.assignee_id, 'task_assigned',
      'Nova tarefa atribuída a você', new.title, 'task', new.id);
  elsif tg_op = 'UPDATE' and new.due_date is distinct from old.due_date and new.assignee_id is not null then
    perform private.notify(new.workspace_id, new.assignee_id, 'task_due_changed',
      'Prazo alterado', new.title || coalesce(' — novo prazo: ' || to_char(new.due_date, 'DD/MM/YYYY'), ' — prazo removido'),
      'task', new.id);
  end if;
  return null;
end;
$$;

create trigger tasks_notify after insert or update of assignee_id, due_date on public.tasks
  for each row execute function private.tasks_notify();

-- Comentários: notifica responsável e criador da tarefa (exceto o autor).
create or replace function private.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  select id, workspace_id, title, assignee_id, created_by into t from public.tasks where id = new.task_id;
  perform private.notify(t.workspace_id, t.assignee_id, 'task_commented',
    'Novo comentário', t.title, 'task', t.id);
  if t.created_by is distinct from t.assignee_id then
    perform private.notify(t.workspace_id, t.created_by, 'task_commented',
      'Novo comentário', t.title, 'task', t.id);
  end if;
  return null;
end;
$$;

create trigger comments_notify after insert on public.comments
  for each row execute function private.comments_notify();

-- Alertas de vencimento (idempotente por tarefa + prazo).
create or replace function public.generate_due_notifications(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before from public.notifications where type in ('task_due_soon', 'task_overdue');

  insert into public.notifications (workspace_id, user_id, type, title, body, entity_type, entity_id, dedupe_key)
  select t.workspace_id, t.assignee_id,
         case when t.due_date < d.today then 'task_overdue' else 'task_due_soon' end,
         case when t.due_date < d.today then 'Tarefa atrasada' else 'Tarefa próxima do vencimento' end,
         t.title || ' — prazo: ' || to_char(t.due_date, 'DD/MM/YYYY'),
         'task', t.id,
         (case when t.due_date < d.today then 'overdue:' else 'due_soon:' end) || t.id || ':' || t.due_date
  from public.tasks t
  join public.workspaces w on w.id = t.workspace_id and w.deleted_at is null
  cross join lateral (select coalesce(p_today, (now() at time zone w.timezone)::date) as today) d
  where t.archived_at is null
    and t.status <> 'done'
    and t.assignee_id is not null
    and t.due_date is not null
    and t.due_date <= d.today + w.due_soon_days
    and not exists (
      select 1 from public.notification_preferences np
      where np.workspace_id = t.workspace_id and np.user_id = t.assignee_id
        and np.type = case when t.due_date < d.today then 'task_overdue' else 'task_due_soon' end
        and not np.in_app
    )
  on conflict (dedupe_key) do nothing;

  select count(*) into v_after from public.notifications where type in ('task_due_soon', 'task_overdue');
  return v_after - v_before;
end;
$$;

revoke execute on function public.generate_due_notifications(date) from public, anon, authenticated;

-- Execução registrada de todas as automações (usada pelo pg_cron).
create or replace function public.run_scheduled_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id    bigint;
  v_recurring integer;
  v_due       integer;
  v_result    jsonb;
begin
  insert into public.automation_runs (job) values ('scheduled_jobs') returning id into v_run_id;
  begin
    v_recurring := public.generate_recurring_tasks();
    v_due := public.generate_due_notifications();
    v_result := jsonb_build_object('recurring_tasks_created', v_recurring, 'due_notifications_created', v_due);
    update public.automation_runs set status = 'succeeded', finished_at = now(), result = v_result where id = v_run_id;
  exception when others then
    update public.automation_runs set status = 'failed', finished_at = now(), error = sqlerrm where id = v_run_id;
    v_result := jsonb_build_object('error', sqlerrm);
  end;
  return v_result;
end;
$$;

revoke execute on function public.run_scheduled_jobs() from public, anon, authenticated;

-- =============================================================================
-- 0003 — Tarefas, subtarefas, recorrências, comentários, anexos, histórico
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Histórico de atividades (genérico, preenchido por trigger)
-- -----------------------------------------------------------------------------

create table public.activity_logs (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  entity_type  text not null,
  entity_id    uuid not null,
  action       text not null,
  changes      jsonb,
  created_at   timestamptz not null default now()
);

create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id, created_at desc);
create index activity_logs_ws_idx on public.activity_logs (workspace_id, created_at desc);

-- Campos ignorados no diff (ruído) e campos cujo conteúdo não é copiado (volume).
create or replace function private.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_action  text;
  k         text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_action := 'created';
    v_changes := null;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      continue when k in ('updated_at', 'version', 'position', 'created_at');
      if v_old -> k is distinct from v_new -> k then
        if k in ('description', 'body', 'methodology', 'evidence') then
          v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('changed', true));
        else
          v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
        end if;
      end if;
    end loop;

    if v_changes = '{}'::jsonb then
      return null;
    end if;

    v_action := case
      when v_changes ? 'archived_at' and v_new ->> 'archived_at' is not null then 'archived'
      when v_changes ? 'archived_at' then 'restored'
      when v_changes ? 'deleted_at' and v_new ->> 'deleted_at' is not null then 'deleted'
      when v_changes ? 'status' and v_new ->> 'status' = 'done' then 'completed'
      when v_changes ? 'status' then 'status_changed'
      else 'updated'
    end;
  end if;

  insert into public.activity_logs (workspace_id, actor_id, entity_type, entity_id, action, changes)
  values ((v_new ->> 'workspace_id')::uuid, auth.uid(), tg_argv[0], (v_new ->> 'id')::uuid, v_action, v_changes);

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Regras de recorrência
-- -----------------------------------------------------------------------------

create table public.task_recurrences (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  -- Tarefa modelo
  title                 text not null check (char_length(title) between 1 and 300),
  description           text not null default '',
  priority              text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  project_id            uuid,
  category_id           uuid,
  assignee_id           uuid,
  weight                numeric(8, 2) not null default 1 check (weight > 0),
  -- Regra
  frequency             text not null check (frequency in ('daily', 'weekly', 'monthly', 'custom')),
  interval_unit         text not null check (interval_unit in ('day', 'week', 'month')),
  interval_count        integer not null default 1 check (interval_count between 1 and 366),
  start_date            date not null,
  end_date              date,
  lead_days             smallint not null default 3 check (lead_days between 0 and 60),
  active                boolean not null default true,
  -- Estado da automação
  occurrences_generated integer not null default 0 check (occurrences_generated >= 0),
  next_occurrence_date  date,
  last_generated_at     timestamptz,
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  version               integer not null default 1,
  unique (id, workspace_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id),
  foreign key (workspace_id, assignee_id)
    references public.workspace_members (workspace_id, user_id) on delete set null (assignee_id),
  check (end_date is null or end_date >= start_date),
  check (
    frequency = 'custom'
    or (frequency = 'daily' and interval_unit = 'day')
    or (frequency = 'weekly' and interval_unit = 'week')
    or (frequency = 'monthly' and interval_unit = 'month')
  )
);

create index task_recurrences_due_idx on public.task_recurrences (next_occurrence_date)
  where active and deleted_at is null;

-- Data da k-ésima ocorrência, sempre calculada a partir da data inicial
-- (evita deriva: 31/01 mensal → 28/02 → 31/03).
create or replace function private.recurrence_occurrence(p_start date, p_unit text, p_count integer, p_k integer)
returns date
language sql
immutable
as $$
  select case p_unit
    when 'day'   then p_start + (p_k * p_count)
    when 'week'  then p_start + (p_k * p_count * 7)
    when 'month' then (p_start + make_interval(months => p_k * p_count))::date
  end;
$$;

create or replace function private.recurrences_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.start_date is distinct from old.start_date
     or new.interval_unit is distinct from old.interval_unit
     or new.interval_count is distinct from old.interval_count then
    -- Nova âncora: a geração pula datas já geradas (unique recurrence_id+occurrence_date).
    new.occurrences_generated := 0;
  end if;
  new.next_occurrence_date := private.recurrence_occurrence(
    new.start_date, new.interval_unit, new.interval_count, new.occurrences_generated);
  if new.end_date is not null and new.next_occurrence_date > new.end_date then
    new.next_occurrence_date := null;
  end if;
  return new;
end;
$$;

create trigger task_recurrences_before_write before insert or update on public.task_recurrences
  for each row execute function private.recurrences_before_write();
create trigger task_recurrences_touch before update on public.task_recurrences
  for each row execute function private.touch_row();
create trigger task_recurrences_version before update on public.task_recurrences
  for each row execute function private.bump_version();
create trigger task_recurrences_ws before update on public.task_recurrences
  for each row execute function private.prevent_workspace_change();

-- -----------------------------------------------------------------------------
-- Tarefas (níveis 4 e 5 — subtarefas em profundidade livre)
-- -----------------------------------------------------------------------------

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  parent_task_id  uuid,
  project_id      uuid,
  category_id     uuid,
  recurrence_id   uuid,
  occurrence_date date,
  title           text not null check (char_length(title) between 1 and 300),
  description     text not null default '' check (char_length(description) <= 20000),
  -- Classificação (não confundir com hierarquia): pontual, recorrente ou de projeto
  type            text not null default 'one_off' check (type in ('one_off', 'recurring', 'project')),
  status          text not null default 'todo'
                    check (status in ('todo', 'in_progress', 'blocked', 'in_review', 'done')),
  priority        text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id     uuid,
  start_date      date,
  due_date        date,
  weight          numeric(8, 2) not null default 1 check (weight > 0 and weight <= 1000),
  position        double precision not null default extract(epoch from clock_timestamp()),
  completed_at    timestamptz,
  completed_by    uuid references public.profiles (id) on delete set null,
  archived_at     timestamptz,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         integer not null default 1,
  unique (id, workspace_id),
  foreign key (parent_task_id, workspace_id) references public.tasks (id, workspace_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id),
  foreign key (recurrence_id, workspace_id) references public.task_recurrences (id, workspace_id),
  foreign key (workspace_id, assignee_id)
    references public.workspace_members (workspace_id, user_id) on delete set null (assignee_id),
  check (parent_task_id is null or parent_task_id <> id),
  check (due_date is null or start_date is null or due_date >= start_date),
  check ((recurrence_id is null) = (occurrence_date is null))
);

create index tasks_board_idx on public.tasks (workspace_id, status, position) where archived_at is null;
create index tasks_due_idx on public.tasks (workspace_id, due_date) where archived_at is null and status <> 'done';
create index tasks_assignee_idx on public.tasks (assignee_id) where archived_at is null;
create index tasks_project_idx on public.tasks (project_id) where archived_at is null;
create index tasks_parent_idx on public.tasks (parent_task_id);
create unique index tasks_recurrence_occurrence_uq on public.tasks (recurrence_id, occurrence_date)
  where recurrence_id is not null;

-- Profundidade máxima da árvore (proteção contra abuso; ajuste aqui se necessário).
create or replace function private.max_task_depth() returns integer language sql immutable as $$ select 8 $$;

-- Hierarquia: sem ciclos, profundidade limitada, subtarefa herda projeto do pai.
create or replace function private.tasks_check_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle    boolean;
  v_depth    integer;
  v_height   integer;
  v_project  uuid;
begin
  if new.parent_task_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.parent_task_id is distinct from old.parent_task_id then
    with recursive ancestors as (
      select t.id, t.parent_task_id, 1 as depth
      from public.tasks t
      where t.id = new.parent_task_id
      union all
      select t.id, t.parent_task_id, a.depth + 1
      from public.tasks t
      join ancestors a on t.id = a.parent_task_id
      where a.depth <= private.max_task_depth() + 1
    )
    select bool_or(id = new.id), max(depth) into v_cycle, v_depth from ancestors;

    if v_cycle then
      raise exception 'hierarquia circular: a tarefa não pode ser subtarefa de si mesma ou de um descendente'
        using errcode = 'check_violation';
    end if;

    -- Altura da subárvore que está sendo movida
    with recursive descendants as (
      select t.id, 1 as h from public.tasks t where t.parent_task_id = new.id
      union all
      select t.id, d.h + 1 from public.tasks t join descendants d on t.parent_task_id = d.id
      where d.h <= private.max_task_depth()
    )
    select coalesce(max(h), 0) into v_height from descendants;

    if v_depth + 1 + v_height > private.max_task_depth() then
      raise exception 'profundidade máxima de subtarefas (%) excedida', private.max_task_depth()
        using errcode = 'check_violation';
    end if;
  end if;

  select t.project_id into v_project from public.tasks t where t.id = new.parent_task_id;
  new.project_id := v_project;
  return new;
end;
$$;

create trigger tasks_hierarchy before insert or update of parent_task_id, project_id on public.tasks
  for each row execute function private.tasks_check_hierarchy();

-- Conclusão e campos derivados.
create or replace function private.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  if new.recurrence_id is not null then
    new.type := 'recurring';
  end if;
  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function private.tasks_before_write();
create trigger tasks_touch before update on public.tasks for each row execute function private.touch_row();
create trigger tasks_version before update on public.tasks for each row execute function private.bump_version();
create trigger tasks_ws before update on public.tasks for each row execute function private.prevent_workspace_change();

-- Propaga projeto e arquivamento para a subárvore.
create or replace function private.tasks_propagate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    update public.tasks set project_id = new.project_id
     where parent_task_id = new.id and project_id is distinct from new.project_id;
  end if;

  if new.archived_at is distinct from old.archived_at then
    if new.archived_at is not null then
      update public.tasks set archived_at = new.archived_at
       where parent_task_id = new.id and archived_at is null;
    else
      -- Restaura apenas filhos arquivados junto com o pai
      update public.tasks set archived_at = null
       where parent_task_id = new.id and archived_at = old.archived_at;
    end if;
  end if;
  return null;
end;
$$;

create trigger tasks_propagate after update of project_id, archived_at on public.tasks
  for each row execute function private.tasks_propagate();

create trigger tasks_log after insert or update on public.tasks
  for each row execute function private.log_activity('task');

-- -----------------------------------------------------------------------------
-- Geração de ocorrências recorrentes (idempotente)
-- -----------------------------------------------------------------------------

create or replace function public.generate_recurring_tasks(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          record;
  v_today    date;
  v_date     date;
  v_k        integer;
  v_created  integer := 0;
  v_rows     integer;
  v_guard    integer;
begin
  for r in
    select rec.*, w.timezone
    from public.task_recurrences rec
    join public.workspaces w on w.id = rec.workspace_id and w.deleted_at is null
    where rec.active and rec.deleted_at is null and rec.next_occurrence_date is not null
    for update of rec skip locked
  loop
    v_today := coalesce(p_today, (now() at time zone r.timezone)::date);
    v_k := r.occurrences_generated;
    v_guard := 0;

    loop
      v_date := private.recurrence_occurrence(r.start_date, r.interval_unit, r.interval_count, v_k);
      exit when v_date - r.lead_days > v_today;
      exit when r.end_date is not null and v_date > r.end_date;
      v_guard := v_guard + 1;
      exit when v_guard > 400;

      -- Ocorrências anteriores à criação da regra não são retroativamente geradas.
      if v_date >= (r.created_at at time zone r.timezone)::date then
        insert into public.tasks (
          workspace_id, recurrence_id, occurrence_date, title, description, type, priority,
          project_id, category_id, assignee_id, weight, due_date, created_by
        ) values (
          r.workspace_id, r.id, v_date, r.title, r.description, 'recurring', r.priority,
          r.project_id, r.category_id, r.assignee_id, r.weight, v_date, r.created_by
        )
        on conflict (recurrence_id, occurrence_date) where recurrence_id is not null do nothing;
        get diagnostics v_rows = row_count;
        v_created := v_created + v_rows;
      end if;

      v_k := v_k + 1;
    end loop;

    if v_k <> r.occurrences_generated then
      update public.task_recurrences
         set occurrences_generated = v_k, last_generated_at = now()
       where id = r.id;
    end if;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.generate_recurring_tasks(date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Comentários
-- -----------------------------------------------------------------------------

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id      uuid not null,
  author_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body         text not null check (char_length(trim(body)) between 1 and 10000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz,
  foreign key (task_id, workspace_id) references public.tasks (id, workspace_id) on delete cascade
);

create index comments_task_idx on public.comments (task_id, created_at);

create or replace function private.comments_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  if new.author_id is distinct from old.author_id or new.task_id is distinct from old.task_id then
    raise exception 'autor e tarefa do comentário são imutáveis' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger comments_before_update before update on public.comments
  for each row execute function private.comments_before_update();
create trigger comments_touch before update on public.comments for each row execute function private.touch_row();
create trigger comments_ws before update on public.comments for each row execute function private.prevent_workspace_change();

-- -----------------------------------------------------------------------------
-- Anexos (metadados; o arquivo fica no bucket privado "attachments")
-- Caminho obrigatório: {workspace_id}/{task_id}/{arquivo}
-- -----------------------------------------------------------------------------

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id      uuid not null,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text not null default 'application/octet-stream',
  size_bytes   bigint not null check (size_bytes between 0 and 26214400), -- 25 MB
  uploaded_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  foreign key (task_id, workspace_id) references public.tasks (id, workspace_id) on delete cascade,
  check (storage_path like workspace_id::text || '/' || task_id::text || '/%')
);

create index attachments_task_idx on public.attachments (task_id) where deleted_at is null;

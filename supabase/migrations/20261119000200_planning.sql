-- =============================================================================
-- 0002 — Planejamento: objetivos, metas, indicadores, projetos
-- =============================================================================

-- Valida que um usuário é membro do workspace (para responsáveis/donos).
create or replace function private.assert_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is not null and not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id
  ) then
    raise exception 'usuário % não pertence ao workspace', p_user_id using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function private.check_owner_member()
returns trigger
language plpgsql
as $$
begin
  perform private.assert_member(new.workspace_id, new.owner_id);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Objetivos estratégicos (nível 1)
-- -----------------------------------------------------------------------------

create table public.objectives (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  description  text not null default '',
  owner_id     uuid references public.profiles (id) on delete set null,
  status       text not null default 'active' check (status in ('draft', 'active', 'achieved', 'cancelled')),
  start_date   date,
  end_date     date,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      integer not null default 1,
  unique (id, workspace_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index objectives_ws_idx on public.objectives (workspace_id) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Metas (nível 2) — resultado mensurável
-- -----------------------------------------------------------------------------

create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  objective_id uuid,
  title        text not null check (char_length(title) between 1 and 200),
  description  text not null default '',
  owner_id     uuid references public.profiles (id) on delete set null,
  status       text not null default 'on_track'
                 check (status in ('not_started', 'on_track', 'at_risk', 'off_track', 'achieved', 'cancelled')),
  start_date   date,
  end_date     date,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      integer not null default 1,
  unique (id, workspace_id),
  foreign key (objective_id, workspace_id) references public.objectives (id, workspace_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index goals_ws_idx on public.goals (workspace_id) where deleted_at is null;
create index goals_objective_idx on public.goals (objective_id);

-- Indicadores da meta. Direção: increase | decrease | range.
create table public.goal_metrics (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null,
  goal_id        uuid not null,
  name           text not null check (char_length(name) between 1 and 200),
  unit           text not null default '' check (char_length(unit) <= 30),
  direction      text not null check (direction in ('increase', 'decrease', 'range')),
  baseline_value numeric,
  current_value  numeric,
  target_value   numeric,
  range_min      numeric,
  range_max      numeric,
  weight         numeric(8, 2) not null default 1 check (weight > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  unique (id, workspace_id),
  foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete cascade,
  -- Coerência entre direção e valores
  check (
    (direction = 'increase' and baseline_value is not null and target_value is not null and target_value > baseline_value)
    or (direction = 'decrease' and baseline_value is not null and target_value is not null and target_value < baseline_value)
    or (direction = 'range' and range_min is not null and range_max is not null and range_max >= range_min)
  )
);

create index goal_metrics_goal_idx on public.goal_metrics (goal_id);

-- Histórico de medições do indicador.
create table public.goal_metric_history (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  metric_id    uuid not null,
  value        numeric not null,
  measured_at  date not null default current_date,
  note         text not null default '',
  recorded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (metric_id, workspace_id) references public.goal_metrics (id, workspace_id) on delete cascade
);

create index goal_metric_history_metric_idx on public.goal_metric_history (metric_id, measured_at desc);

-- Ao registrar medição, atualiza o valor atual do indicador.
create or replace function private.metric_history_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.goal_metrics m
     set current_value = new.value
   where m.id = new.metric_id
     and not exists (
       select 1 from public.goal_metric_history h
       where h.metric_id = new.metric_id and h.id <> new.id and h.measured_at > new.measured_at
     );
  return new;
end;
$$;

create trigger goal_metric_history_apply after insert on public.goal_metric_history
  for each row execute function private.metric_history_apply();

-- Progresso de resultado: 0..1. Documentado em docs/ARCHITECTURE.md §5.2.
create or replace function public.metric_progress(
  p_direction text, p_baseline numeric, p_current numeric, p_target numeric,
  p_min numeric, p_max numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_current is null then null
    when p_direction in ('increase', 'decrease') then
      case when p_target = p_baseline then null
           else greatest(0, least(1, (p_current - p_baseline) / (p_target - p_baseline)))
      end
    when p_direction = 'range' then
      case when p_current between p_min and p_max then 1 else 0 end
  end;
$$;

-- -----------------------------------------------------------------------------
-- Projetos (nível 3)
-- -----------------------------------------------------------------------------

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  description  text not null default '',
  owner_id     uuid references public.profiles (id) on delete set null,
  status       text not null default 'active'
                 check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  priority     text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  start_date   date,
  due_date     date,
  color        text not null default 'blue'
                 check (color in ('slate', 'blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink')),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      integer not null default 1,
  unique (id, workspace_id),
  check (due_date is null or start_date is null or due_date >= start_date)
);

create index projects_ws_idx on public.projects (workspace_id, status) where deleted_at is null;

create table public.project_members (
  workspace_id uuid not null,
  project_id   uuid not null,
  user_id      uuid not null,
  created_at   timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (workspace_id, user_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);

-- Projeto N:N metas
create table public.project_goals (
  workspace_id uuid not null,
  project_id   uuid not null,
  goal_id      uuid not null,
  created_at   timestamptz not null default now(),
  primary key (project_id, goal_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete cascade
);

create index project_goals_goal_idx on public.project_goals (goal_id);

-- -----------------------------------------------------------------------------
-- Triggers comuns
-- -----------------------------------------------------------------------------

create trigger objectives_touch before update on public.objectives for each row execute function private.touch_row();
create trigger objectives_version before update on public.objectives for each row execute function private.bump_version();
create trigger objectives_ws before update on public.objectives for each row execute function private.prevent_workspace_change();
create trigger objectives_owner before insert or update of owner_id on public.objectives for each row execute function private.check_owner_member();

create trigger goals_touch before update on public.goals for each row execute function private.touch_row();
create trigger goals_version before update on public.goals for each row execute function private.bump_version();
create trigger goals_ws before update on public.goals for each row execute function private.prevent_workspace_change();
create trigger goals_owner before insert or update of owner_id on public.goals for each row execute function private.check_owner_member();

create trigger goal_metrics_touch before update on public.goal_metrics for each row execute function private.touch_row();
create trigger goal_metrics_version before update on public.goal_metrics for each row execute function private.bump_version();
create trigger goal_metrics_ws before update on public.goal_metrics for each row execute function private.prevent_workspace_change();

create trigger projects_touch before update on public.projects for each row execute function private.touch_row();
create trigger projects_version before update on public.projects for each row execute function private.bump_version();
create trigger projects_ws before update on public.projects for each row execute function private.prevent_workspace_change();
create trigger projects_owner before insert or update of owner_id on public.projects for each row execute function private.check_owner_member();

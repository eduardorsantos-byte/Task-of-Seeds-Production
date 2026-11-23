-- =============================================================================
-- 0005 — Ganhos do Negócio + fluxo de validação
-- Regras de agregação: docs/ARCHITECTURE.md §6
-- =============================================================================

create table public.business_impacts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  description     text not null default '',
  category        text not null check (category in (
                    'financial_savings', 'cost_avoidance', 'hours_saved', 'productivity_increase',
                    'rework_reduction', 'quality_improvement', 'risk_reduction', 'process_improvement',
                    'qualitative_other')),
  project_id      uuid,
  task_id         uuid,
  registered_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  methodology     text not null default '',
  unit            text not null check (unit in ('BRL', 'USD', 'hours', 'percent', 'count', 'none')),
  estimated_value numeric(16, 2) check (estimated_value >= 0),
  realized_value  numeric(16, 2) check (realized_value >= 0),
  periodicity     text not null default 'one_time'
                    check (periodicity in ('one_time', 'weekly', 'monthly', 'quarterly', 'annual')),
  reference_start date,
  reference_end   date,
  evidence        text not null default '',
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'changes_requested')),
  validator_id    uuid references public.profiles (id) on delete set null,
  validated_at    timestamptz,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  version         integer not null default 1,
  unique (id, workspace_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id),
  foreign key (task_id, workspace_id) references public.tasks (id, workspace_id),
  check (num_nonnulls(project_id, task_id) <= 1),
  check (reference_end is null or reference_start is null or reference_end >= reference_start),
  -- Benefício qualitativo não tem valor numérico; os demais exigem unidade numérica
  check ((unit = 'none') = (category = 'qualitative_other')),
  check (unit <> 'none' or (estimated_value is null and realized_value is null))
);

create index business_impacts_ws_idx on public.business_impacts (workspace_id, status) where deleted_at is null;
create index business_impacts_project_idx on public.business_impacts (project_id);
create index business_impacts_task_idx on public.business_impacts (task_id);

-- Histórico de decisões
create table public.business_impact_reviews (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  impact_id    uuid not null,
  reviewer_id  uuid references public.profiles (id) on delete set null,
  decision     text not null check (decision in ('approved', 'rejected', 'changes_requested', 'reopened', 'resubmitted')),
  note         text,
  self_review  boolean not null default false,
  created_at   timestamptz not null default now(),
  foreign key (impact_id, workspace_id) references public.business_impacts (id, workspace_id) on delete cascade
);

create index business_impact_reviews_impact_idx on public.business_impact_reviews (impact_id, created_at);

-- -----------------------------------------------------------------------------
-- Guarda: status/validação só mudam pela RPC review_business_impact.
-- Edição de conteúdo após "ajustes solicitados"/"rejeitado" reenvia para validação.
-- Registro aprovado é imutável (validador pode reabrir).
-- -----------------------------------------------------------------------------

create or replace function private.business_impacts_guard()
returns trigger
language plpgsql
as $$
declare
  v_reviewing boolean := coalesce(current_setting('app.reviewing_impact', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.validator_id := null;
    new.validated_at := null;
    new.review_note := null;
    new.registered_by := coalesce(auth.uid(), new.registered_by);
    return new;
  end if;

  if v_reviewing then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.validator_id is distinct from old.validator_id
     or new.validated_at is distinct from old.validated_at
     or new.review_note is distinct from old.review_note
     or new.registered_by is distinct from old.registered_by then
    raise exception 'status e validação só podem ser alterados pelo fluxo de validação'
      using errcode = '42501';
  end if;

  if old.status = 'approved' and old.deleted_at is null then
    raise exception 'ganho aprovado não pode ser editado; peça ao validador para reabrir'
      using errcode = '42501';
  end if;

  if old.status in ('changes_requested', 'rejected') and new.deleted_at is null then
    new.status := 'pending';
    new.validator_id := null;
    new.validated_at := null;
  end if;

  return new;
end;
$$;

create trigger business_impacts_guard before insert or update on public.business_impacts
  for each row execute function private.business_impacts_guard();
create trigger business_impacts_touch before update on public.business_impacts for each row execute function private.touch_row();
create trigger business_impacts_version before update on public.business_impacts for each row execute function private.bump_version();
create trigger business_impacts_ws before update on public.business_impacts for each row execute function private.prevent_workspace_change();
create trigger business_impacts_log after insert or update on public.business_impacts
  for each row execute function private.log_activity('business_impact');

-- Notifica validadores quando há registro pendente; registra reenvio no histórico.
create or replace function private.business_impacts_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_validator uuid;
begin
  if new.status = 'pending' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status <> 'pending') then
    if tg_op = 'UPDATE' and old.status in ('changes_requested', 'rejected')
       and coalesce(current_setting('app.reviewing_impact', true), '') <> 'on' then
      insert into public.business_impact_reviews (workspace_id, impact_id, reviewer_id, decision)
      values (new.workspace_id, new.id, auth.uid(), 'resubmitted');
    end if;
    for v_validator in
      select p.user_id from public.workspace_member_permissions p
      where p.workspace_id = new.workspace_id and p.permission = 'impacts.validate'
    loop
      perform private.notify(new.workspace_id, v_validator, 'impact_review_requested',
        'Ganho aguardando validação', new.title, 'business_impact', new.id);
    end loop;
  end if;
  return null;
end;
$$;

-- Sem "update of status": o status pode mudar dentro do trigger BEFORE (reenvio),
-- e triggers por coluna só observam as colunas citadas no SET.
create trigger business_impacts_after after insert or update on public.business_impacts
  for each row execute function private.business_impacts_after();

-- -----------------------------------------------------------------------------
-- RPC de validação
-- -----------------------------------------------------------------------------

create or replace function public.review_business_impact(
  p_impact_id uuid, p_decision text, p_note text default null, p_expected_version integer default null
)
returns public.business_impacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_row    public.business_impacts;
  v_status text;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  select * into v_row from public.business_impacts where id = p_impact_id and deleted_at is null for update;
  if not found then
    raise exception 'ganho não encontrado' using errcode = 'no_data_found';
  end if;

  if not private.has_permission(v_row.workspace_id, 'impacts.validate') then
    raise exception 'sem permissão para validar ganhos' using errcode = '42501';
  end if;

  if p_expected_version is not null and v_row.version <> p_expected_version then
    raise exception 'o registro foi alterado por outra pessoa; recarregue' using errcode = '40001';
  end if;

  if p_decision in ('rejected', 'changes_requested') and coalesce(trim(p_note), '') = '' then
    raise exception 'informe o motivo' using errcode = 'check_violation';
  end if;

  v_status := case p_decision
    when 'approved' then 'approved'
    when 'rejected' then 'rejected'
    when 'changes_requested' then 'changes_requested'
    when 'reopened' then 'pending'
    else null
  end;
  if v_status is null then
    raise exception 'decisão inválida: %', p_decision using errcode = 'check_violation';
  end if;

  if p_decision = 'reopened' and v_row.status = 'pending' then
    raise exception 'o ganho já está pendente' using errcode = 'check_violation';
  end if;
  if p_decision <> 'reopened' and v_row.status <> 'pending' then
    raise exception 'somente ganhos pendentes podem ser decididos (status atual: %)', v_row.status
      using errcode = 'check_violation';
  end if;
  if p_decision = 'approved' and v_row.category <> 'qualitative_other' and v_row.realized_value is null then
    raise exception 'informe o valor realizado antes de aprovar' using errcode = 'check_violation';
  end if;

  perform set_config('app.reviewing_impact', 'on', true);

  update public.business_impacts
     set status = v_status,
         validator_id = case when v_status = 'pending' then null else v_uid end,
         validated_at = case when v_status = 'pending' then null else now() end,
         review_note = p_note
   where id = p_impact_id
  returning * into v_row;

  perform set_config('app.reviewing_impact', 'off', true);

  insert into public.business_impact_reviews (workspace_id, impact_id, reviewer_id, decision, note, self_review)
  values (v_row.workspace_id, v_row.id, v_uid, p_decision, p_note, v_row.registered_by = v_uid);

  if v_status <> 'pending' then
    perform private.notify(v_row.workspace_id, v_row.registered_by,
      case v_status when 'approved' then 'impact_approved'
                    when 'rejected' then 'impact_rejected'
                    else 'impact_changes_requested' end,
      case v_status when 'approved' then 'Ganho aprovado'
                    when 'rejected' then 'Ganho rejeitado'
                    else 'Ajustes solicitados no ganho' end,
      v_row.title, 'business_impact', v_row.id);
  end if;

  return v_row;
end;
$$;

-- =============================================================================
-- 0001 — Fundação: schemas, utilitários, perfis, workspaces, membros, permissões
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Utilitários genéricos
-- -----------------------------------------------------------------------------

-- Mantém updated_at.
create or replace function private.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Incrementa version a cada UPDATE (controle de concorrência otimista).
-- O cliente envia a versão que leu; o UPDATE filtra por ela.
create or replace function private.bump_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

-- Impede mover um registro para outro workspace.
create or replace function private.prevent_workspace_change()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id é imutável' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  avatar_url  text,
  theme       text not null default 'light' check (theme in ('light', 'dark', 'system')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_row();

-- E-mail é controlado pelo Auth; usuários não podem alterá-lo pelo perfil.
create or replace function private.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if new.email is distinct from old.email and current_user = 'authenticated' then
    raise exception 'e-mail não pode ser alterado pelo perfil' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- -----------------------------------------------------------------------------
-- Workspaces
-- -----------------------------------------------------------------------------

create table public.workspaces (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 1 and 80),
  timezone              text not null default 'America/Sao_Paulo',
  weekly_digest_enabled boolean not null default true,
  weekly_digest_dow     smallint not null default 1 check (weekly_digest_dow between 0 and 6), -- 0 = domingo
  weekly_digest_hour    smallint not null default 8 check (weekly_digest_hour between 0 and 23),
  due_soon_days         smallint not null default 2 check (due_soon_days between 0 and 30),
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create trigger workspaces_touch before update on public.workspaces
  for each row execute function private.touch_row();

-- Valida fuso horário (rejeita nomes inexistentes).
create or replace function private.workspaces_validate_tz()
returns trigger
language plpgsql
as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception when others then
  raise exception 'fuso horário inválido: %', new.timezone using errcode = 'check_violation';
end;
$$;

create trigger workspaces_validate_tz before insert or update of timezone on public.workspaces
  for each row execute function private.workspaces_validate_tz();

-- -----------------------------------------------------------------------------
-- Membros e permissões
-- -----------------------------------------------------------------------------

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

-- Permissões atômicas. Novas permissões = novo valor no check, sem mudar código.
create table public.workspace_member_permissions (
  workspace_id uuid not null,
  user_id      uuid not null,
  permission   text not null check (permission in ('impacts.validate', 'members.manage', 'workspace.manage')),
  granted_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, permission),
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

-- Helpers de autorização (security definer: evitam recursão de RLS).
create or replace function private.is_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id and w.deleted_at is null
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_permission(p_workspace_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_member_permissions p
    where p.workspace_id = p_workspace_id
      and p.user_id = (select auth.uid())
      and p.permission = p_permission
  );
$$;

create or replace function private.shares_workspace_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid())
      and b.user_id = p_user_id
  );
$$;

grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.shares_workspace_with(uuid) to authenticated;

-- Impede remover o último membro com members.manage (workspace ficaria órfão).
create or replace function private.protect_last_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.permission = 'members.manage'
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     and not exists (
       select 1 from public.workspace_member_permissions p
       where p.workspace_id = old.workspace_id
         and p.permission = 'members.manage'
         and p.user_id <> old.user_id
     ) then
    raise exception 'o workspace precisa de ao menos um administrador de membros'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger workspace_member_permissions_protect
  before delete on public.workspace_member_permissions
  for each row execute function private.protect_last_manager();

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------

create table public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (email = lower(email) and position('@' in email) > 1),
  permissions  text[] not null default '{}'
                 check (permissions <@ array['impacts.validate', 'members.manage', 'workspace.manage']::text[]),
  invited_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id) on delete set null,
  revoked_at   timestamptz
);

create unique index workspace_invitations_pending_uq
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

-- Aceita convites pendentes e válidos para um usuário (pelo e-mail).
create or replace function private.accept_invitations_for(p_user_id uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  n integer := 0;
begin
  for inv in
    select * from public.workspace_invitations i
    where i.email = lower(p_email)
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
    for update
  loop
    insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, p_user_id, 'member')
    on conflict do nothing;

    insert into public.workspace_member_permissions (workspace_id, user_id, permission, granted_by)
    select inv.workspace_id, p_user_id, unnest(inv.permissions), inv.invited_by
    on conflict do nothing;

    update public.workspace_invitations
       set accepted_at = now(), accepted_by = p_user_id
     where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Novo usuário no Auth → cria perfil e aceita convites.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  perform private.accept_invitations_for(new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- RPC: usuário já existente aceita convites recebidos depois do cadastro.
create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  return private.accept_invitations_for(auth.uid(), v_email);
end;
$$;

-- RPC: cria workspace; o criador recebe todas as permissões.
create or replace function public.create_workspace(p_name text, p_timezone text default 'America/Sao_Paulo')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  insert into public.workspaces (name, timezone, created_by)
  values (trim(p_name), coalesce(p_timezone, 'America/Sao_Paulo'), v_uid)
  returning id into v_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_id, v_uid, 'owner');

  insert into public.workspace_member_permissions (workspace_id, user_id, permission, granted_by)
  values (v_id, v_uid, 'impacts.validate', v_uid),
         (v_id, v_uid, 'members.manage', v_uid),
         (v_id, v_uid, 'workspace.manage', v_uid);

  insert into public.categories (workspace_id, name, color)
  values (v_id, 'Geral', 'slate');

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Categorias de tarefa (configuráveis pelo usuário)
-- -----------------------------------------------------------------------------

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  color        text not null default 'slate'
                 check (color in ('slate', 'blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink')),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, workspace_id)
);

create unique index categories_name_uq on public.categories (workspace_id, lower(name)) where archived_at is null;

create trigger categories_touch before update on public.categories
  for each row execute function private.touch_row();
create trigger categories_ws_immutable before update on public.categories
  for each row execute function private.prevent_workspace_change();

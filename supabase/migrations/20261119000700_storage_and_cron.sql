-- =============================================================================
-- 0007 — Storage privado de anexos e agendamentos (pg_cron)
-- =============================================================================

create or replace function private.try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Bucket privado: downloads apenas por URL assinada de curta duração.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Caminho: {workspace_id}/{task_id}/{arquivo}
create policy attachments_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
  );

create policy attachments_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
    and exists (
      select 1 from public.tasks t
      where t.id = private.try_uuid((storage.foldername(name))[2])
        and t.workspace_id = private.try_uuid((storage.foldername(name))[1])
    )
  );

create policy attachments_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
  );

-- -----------------------------------------------------------------------------
-- Agendamento horário das automações (idempotentes).
-- pg_cron está disponível no plano gratuito do Supabase. Em ambientes sem a
-- extensão (ex.: CI), este bloco é ignorado.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('safra-adm-jobs', '5 * * * *', 'select public.run_scheduled_jobs()');
  end if;
end;
$$;

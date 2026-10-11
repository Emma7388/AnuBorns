-- Etapa 2A: control administrativo de cuentas sin eliminarlas.
-- Idempotente. Ejecutar una vez en Supabase SQL Editor antes de usar
-- los botones de rol y suspension del panel /admin/usuarios.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.admin_users
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create table if not exists public.admin_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  reason text not null default '',
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_user_controls_reason_length_check'
      and conrelid = 'public.admin_user_controls'::regclass
  ) then
    alter table public.admin_user_controls
      add constraint admin_user_controls_reason_length_check
      check (char_length(reason) <= 240);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_user_controls_suspension_data_check'
      and conrelid = 'public.admin_user_controls'::regclass
  ) then
    alter table public.admin_user_controls
      add constraint admin_user_controls_suspension_data_check
      check (
        status <> 'suspended'
        or (
          char_length(btrim(reason)) >= 6
          and suspended_at is not null
          and suspended_by is not null
        )
      );
  end if;
end;
$$;

create index if not exists admin_user_controls_status_idx
  on public.admin_user_controls (status, updated_at desc);

create or replace function public.set_admin_user_role_controlled(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_grant boolean
)
returns table(user_id uuid, is_admin boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_admin_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('anuborns_admin_roles', 0));

  if p_grant then
    if exists (
      select 1
      from public.admin_user_controls
      where admin_user_controls.user_id = p_target_user_id
        and admin_user_controls.status = 'suspended'
    ) then
      raise exception using errcode = 'P0001', message = 'suspended_admin_grant_forbidden';
    end if;

    insert into public.admin_users (user_id, created_by)
    values (p_target_user_id, p_actor_user_id)
    on conflict (user_id) do nothing;
  else
    if p_target_user_id = p_actor_user_id then
      raise exception using errcode = 'P0001', message = 'admin_self_revoke_forbidden';
    end if;

    select count(*) into current_admin_count from public.admin_users;
    if current_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'last_admin_revoke_forbidden';
    end if;

    delete from public.admin_users where admin_users.user_id = p_target_user_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'admin_role_not_found';
    end if;
  end if;

  return query select p_target_user_id, p_grant;
end;
$$;

create or replace function public.set_admin_user_suspension_controlled(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_suspended boolean,
  p_reason text
)
returns table(user_id uuid, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := left(regexp_replace(coalesce(p_reason, ''), '[[:cntrl:]]+', ' ', 'g'), 240);
  next_status text := case when p_suspended then 'suspended' else 'active' end;
begin
  perform pg_advisory_xact_lock(hashtextextended('anuborns_admin_roles', 0));

  if char_length(btrim(clean_reason)) < 6 then
    raise exception using errcode = 'P0001', message = 'admin_reason_too_short';
  end if;

  if p_suspended then
    if p_target_user_id = p_actor_user_id then
      raise exception using errcode = 'P0001', message = 'admin_self_suspend_forbidden';
    end if;
    if exists (
      select 1 from public.admin_users where admin_users.user_id = p_target_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'admin_suspend_forbidden';
    end if;
  end if;

  insert into public.admin_user_controls (
    user_id,
    status,
    reason,
    suspended_at,
    suspended_by,
    updated_by
  ) values (
    p_target_user_id,
    next_status,
    btrim(clean_reason),
    case when p_suspended then now() else null end,
    case when p_suspended then p_actor_user_id else null end,
    p_actor_user_id
  )
  on conflict (user_id) do update set
    status = excluded.status,
    reason = excluded.reason,
    suspended_at = excluded.suspended_at,
    suspended_by = excluded.suspended_by,
    updated_by = excluded.updated_by;

  return query select p_target_user_id, next_status;
end;
$$;

create or replace function public.set_admin_user_controls_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_user_controls_set_updated_at on public.admin_user_controls;
create trigger admin_user_controls_set_updated_at
before update on public.admin_user_controls
for each row
execute function public.set_admin_user_controls_updated_at();

alter table public.admin_user_controls enable row level security;
alter table public.admin_users enable row level security;

revoke all on table public.admin_user_controls from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_user_controls to service_role;

revoke all on table public.admin_users from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;

revoke all on function public.set_admin_user_role_controlled(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_admin_user_role_controlled(uuid, uuid, boolean) to service_role;
revoke all on function public.set_admin_user_suspension_controlled(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_admin_user_suspension_controlled(uuid, uuid, boolean, text) to service_role;

select jsonb_build_object(
  'admin_users', (select count(*) from public.admin_users),
  'suspended_users', (
    select count(*) from public.admin_user_controls where status = 'suspended'
  ),
  'invalid_suspensions', (
    select count(*)
    from public.admin_user_controls
    where status = 'suspended'
      and (
        char_length(btrim(reason)) < 6
        or suspended_at is null
        or suspended_by is null
      )
  ),
  'controls_rls', (
    select relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'admin_user_controls'
  ),
  'authenticated_controls_privileges', (
    select coalesce(jsonb_agg(privilege_type order by privilege_type), '[]'::jsonb)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_user_controls'
      and grantee = 'authenticated'
  ),
  'authenticated_admin_privileges', (
    select coalesce(jsonb_agg(privilege_type order by privilege_type), '[]'::jsonb)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'authenticated'
  ),
  'role_rpc_service_role_execute', has_function_privilege(
    'service_role',
    'public.set_admin_user_role_controlled(uuid,uuid,boolean)',
    'EXECUTE'
  ),
  'role_rpc_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.set_admin_user_role_controlled(uuid,uuid,boolean)',
    'EXECUTE'
  ),
  'suspension_rpc_service_role_execute', has_function_privilege(
    'service_role',
    'public.set_admin_user_suspension_controlled(uuid,uuid,boolean,text)',
    'EXECUTE'
  ),
  'suspension_rpc_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.set_admin_user_suspension_controlled(uuid,uuid,boolean,text)',
    'EXECUTE'
  )
) as admin_control_audit;

-- Hardening puntual para public.set_profiles_updated_at().
-- Seguro para reejecutar: no modifica perfiles ni datos de usuarios.

begin;

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

commit;

-- Auditoria de instalacion. Debe devolver function_exists,
-- search_path_fixed y trigger_attached en true.
with target_function as (
  select
    p.oid,
    p.proconfig
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'set_profiles_updated_at'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
)
select pg_catalog.jsonb_build_object(
  'function_exists', exists (
    select 1
    from target_function
  ),
  'search_path_fixed', exists (
    select 1
    from target_function target
    cross join lateral pg_catalog.unnest(
      coalesce(target.proconfig, array[]::text[])
    ) as setting(value)
    where setting.value like 'search_path=%'
  ),
  'search_path_config', coalesce(
    (select pg_catalog.to_jsonb(target.proconfig) from target_function target),
    '[]'::jsonb
  ),
  'trigger_attached', exists (
    select 1
    from pg_catalog.pg_trigger trigger_state
    join pg_catalog.pg_class table_state
      on table_state.oid = trigger_state.tgrelid
    join pg_catalog.pg_namespace table_schema
      on table_schema.oid = table_state.relnamespace
    where table_schema.nspname = 'public'
      and table_state.relname = 'profiles'
      and trigger_state.tgname = 'profiles_set_updated_at'
      and not trigger_state.tgisinternal
  )
) as profiles_search_path_hardening_audit;

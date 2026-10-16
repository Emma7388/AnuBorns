-- Rate limit atomico y compartido para todas las instancias serverless.
-- Ejecutar en Supabase SQL Editor antes de desplegar el codigo compatible.
--
-- No guarda IP, email, token ni ruta en texto plano. El backend envia una
-- clave HMAC/SHA-256 irreversible y la RPC incrementa su ventana de forma
-- atomica. anon y authenticated no pueden leer ni ejecutar esta estructura.

create extension if not exists pg_cron with schema pg_catalog;

begin;

create table if not exists public.api_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default pg_catalog.now(),
  request_count integer not null default 1,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint api_rate_limits_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_rate_limits_request_count_check
    check (request_count >= 1)
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits (updated_at);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits
from public, anon, authenticated;
grant select on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer,
  current_count integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_time timestamptz := pg_catalog.now();
  current_window_started_at timestamptz;
  current_request_count integer;
  window_interval interval;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_key';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_max';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_window';
  end if;

  window_interval := pg_catalog.make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits as bucket (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_key_hash,
    current_time,
    1,
    current_time
  )
  on conflict (key_hash) do update
  set
    window_started_at = case
      when bucket.window_started_at + window_interval <= current_time then current_time
      else bucket.window_started_at
    end,
    request_count = case
      when bucket.window_started_at + window_interval <= current_time then 1
      else least(bucket.request_count + 1, p_limit + 1)
    end,
    updated_at = current_time
  returning bucket.window_started_at, bucket.request_count
  into current_window_started_at, current_request_count;

  allowed := current_request_count <= p_limit;
  remaining := greatest(p_limit - current_request_count, 0);
  current_count := current_request_count;
  reset_at := current_window_started_at + window_interval;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (reset_at - current_time)))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
to service_role;

create or replace function public.cleanup_api_rate_limits(
  p_older_than interval default interval '2 days'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected_rows integer;
begin
  if p_older_than is null or p_older_than < interval '1 hour' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_cleanup_interval';
  end if;

  delete from public.api_rate_limits
  where updated_at < pg_catalog.now() - p_older_than;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.cleanup_api_rate_limits(interval)
from public, anon, authenticated;
grant execute on function public.cleanup_api_rate_limits(interval)
to service_role;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'anuborns_cleanup_api_rate_limits'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'anuborns_cleanup_api_rate_limits',
  '37 3 * * *',
  $cron$select public.cleanup_api_rate_limits(interval '2 days');$cron$
);

commit;

select jsonb_build_object(
  'table_exists', to_regclass('public.api_rate_limits') is not null,
  'rls_enabled', coalesce((
    select relrowsecurity
    from pg_class
    where oid = 'public.api_rate_limits'::regclass
  ), false),
  'rpc_service_role_execute', has_function_privilege(
    'service_role',
    'public.consume_api_rate_limit(text, integer, integer)',
    'EXECUTE'
  ),
  'rpc_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.consume_api_rate_limit(text, integer, integer)',
    'EXECUTE'
  ),
  'rpc_anon_execute', has_function_privilege(
    'anon',
    'public.consume_api_rate_limit(text, integer, integer)',
    'EXECUTE'
  ),
  'cron_job', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'jobid', jobid,
          'schedule', schedule,
          'active', active
        )
        order by jobid
      ),
      '[]'::jsonb
    )
    from cron.job
    where jobname = 'anuborns_cleanup_api_rate_limits'
  )
) as distributed_rate_limit_audit;

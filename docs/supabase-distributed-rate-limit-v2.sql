-- Migracion incremental del rate limit distribuido ya instalado.
--
-- Corrige la RPC sin recrear la tabla ni reprogramar el cron. La version
-- inicial usaba `current_time` como variable PL/pgSQL; PostgreSQL resolvia ese
-- identificador como la expresion SQL CURRENT_TIME (timetz). El prefijo `v_`
-- evita la colision y mantiene todos los calculos en timestamptz.

begin;

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
  v_now timestamptz := pg_catalog.now();
  v_window_started_at timestamptz;
  v_request_count integer;
  v_window_interval interval;
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

  v_window_interval := pg_catalog.make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits as bucket (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_key_hash,
    v_now,
    1,
    v_now
  )
  on conflict (key_hash) do update
  set
    window_started_at = case
      when bucket.window_started_at + v_window_interval <= v_now then v_now
      else bucket.window_started_at
    end,
    request_count = case
      when bucket.window_started_at + v_window_interval <= v_now then 1
      else least(bucket.request_count + 1, p_limit + 1)
    end,
    updated_at = v_now
  returning bucket.window_started_at, bucket.request_count
  into v_window_started_at, v_request_count;

  allowed := v_request_count <= p_limit;
  remaining := greatest(p_limit - v_request_count, 0);
  current_count := v_request_count;
  reset_at := v_window_started_at + v_window_interval;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (reset_at - v_now)))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
to service_role;

-- Prueba funcional dentro de la misma transaccion. La clave reservada se
-- elimina antes del commit y no deja una ventana ficticia en produccion.
set local role service_role;
select *
from public.consume_api_rate_limit(repeat('0', 64), 60, 60);
reset role;

delete from public.api_rate_limits
where key_hash = repeat('0', 64);

commit;

select pg_notify('pgrst', 'reload schema');

select jsonb_build_object(
  'rpc_exists', to_regprocedure(
    'public.consume_api_rate_limit(text,integer,integer)'
  ) is not null,
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
  'search_path_fixed', coalesce((
    select proconfig @> array['search_path=pg_catalog']
    from pg_proc
    where oid = 'public.consume_api_rate_limit(text,integer,integer)'::regprocedure
  ), false)
) as distributed_rate_limit_v2_audit;

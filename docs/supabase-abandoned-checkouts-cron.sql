-- Regulariza y automatiza la cancelacion de checkouts abandonados.
-- Ejecutar una sola vez en Supabase SQL Editor.
--
-- No borra ordenes: conserva la trazabilidad y cambia a cancelled las ordenes
-- pending sin payment_id que superaron el TTL. El trigger
-- orders_sync_product_reservations libera automaticamente stock y reservas.
-- Mantener el intervalo alineado con CHECKOUT_PENDING_ORDER_TTL_MINUTES=1440.

create extension if not exists pg_cron with schema pg_catalog;

begin;

create or replace function public.cancel_abandoned_checkout_orders(
  p_older_than interval default interval '24 hours'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected_rows integer;
begin
  if p_older_than is null or p_older_than <= interval '0 seconds' then
    raise exception using
      errcode = '22023',
      message = 'invalid_checkout_cleanup_interval';
  end if;

  update public.orders
  set
    status = 'cancelled',
    payment_status = 'cancelled',
    payment_detail = 'checkout_abandoned'
  where status = 'pending'
    and payment_id is null
    and created_at < now() - p_older_than;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.cancel_abandoned_checkout_orders(interval)
from public, anon, authenticated;
grant execute on function public.cancel_abandoned_checkout_orders(interval)
to service_role;

-- Reemplaza de forma idempotente cualquier job previo con el mismo nombre.
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'anuborns_cleanup_abandoned_checkouts'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'anuborns_cleanup_abandoned_checkouts',
  '17 * * * *',
  $cron$select public.cancel_abandoned_checkout_orders(interval '24 hours');$cron$
);

commit;

-- Regulariza ahora mismo cualquier intento viejo que todavia figure pending.
-- Se usan dos sentencias dentro de una transaccion para que la auditoria lea
-- una fotografia posterior al UPDATE ejecutado por la funcion.
begin;

create temporary table abandoned_checkout_cleanup_result
on commit drop
as
select public.cancel_abandoned_checkout_orders(interval '24 hours') as cancelled_now;

select jsonb_build_object(
  'cancelled_now', cleanup.cancelled_now,
  'stale_pending_remaining', (
    select count(*)
    from public.orders
    where status = 'pending'
      and payment_id is null
      and created_at < now() - interval '24 hours'
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
    where jobname = 'anuborns_cleanup_abandoned_checkouts'
  ),
  'rpc_service_role_execute', has_function_privilege(
    'service_role',
    'public.cancel_abandoned_checkout_orders(interval)',
    'EXECUTE'
  ),
  'rpc_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.cancel_abandoned_checkout_orders(interval)',
    'EXECUTE'
  ),
  'rpc_anon_execute', has_function_privilege(
    'anon',
    'public.cancel_abandoned_checkout_orders(interval)',
    'EXECUTE'
  )
) as abandoned_checkout_cleanup_audit
from abandoned_checkout_cleanup_result as cleanup;

commit;

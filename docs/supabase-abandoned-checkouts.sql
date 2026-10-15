-- Limpieza manual de respaldo para checkouts abandonados.
-- La automatizacion permanente vive en supabase-abandoned-checkouts-cron.sql.
-- No borra ordenes: conserva trazabilidad y libera reservas mediante el trigger.

update public.orders
set
  status = 'cancelled',
  payment_status = 'cancelled',
  payment_detail = 'checkout_abandoned'
where status = 'pending'
  and payment_id is null
  and created_at < now() - interval '24 hours';

-- Verificacion rapida:
select
  id,
  status,
  payment_status,
  payment_detail,
  preference_id,
  total_amount,
  created_at
from public.orders
order by created_at desc
limit 10;

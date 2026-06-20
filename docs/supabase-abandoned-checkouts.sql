-- Limpieza manual de preferencias de Mercado Pago abandonadas.
-- Marca como canceladas las ordenes pendientes sin payment_id.
-- Ajusta el intervalo si queres limpiar una ventana distinta.

update public.orders
set
  status = 'cancelled',
  payment_status = 'cancelled',
  payment_detail = 'checkout_abandoned'
where status = 'pending'
  and payment_id is null
  and created_at < now() - interval '2 hours';

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

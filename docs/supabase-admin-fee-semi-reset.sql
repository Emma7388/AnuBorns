-- Nombre: supabase-admin-fee-semi-reset.sql
-- Detalle: semi reset del conteo del panel /admin/administracion.
--
-- Objetivo:
-- - Conservar la ultima orden aprobada con marketplace_fee mayor a cero.
-- - Llevar a cero el marketplace_fee local de las ordenes anteriores.
-- - No borrar ordenes, pagos, preference_id, payment_id ni estados.
-- - Dejar trazabilidad en payment_detail con el fee anterior y fecha del reset.
--
-- Forma de uso:
-- 1) Ejecutar primero el bloque "AUDITORIA PREVIA".
-- 2) Revisar keep_order y orders_to_reset.
-- 3) Si coincide con lo esperado, ejecutar el bloque "APLICAR SEMI RESET".
-- 4) Ejecutar "VERIFICACION POSTERIOR".
--
-- Seguro para re-ejecutar despues de aplicado: las ordenes reseteadas quedan con
-- marketplace_fee:0 y ya no vuelven a entrar en el conteo del panel.

-- ============================================================================
-- AUDITORIA PREVIA - no modifica datos
-- ============================================================================

with fee_orders as (
  select
    orders.id,
    upper(left(orders.id::text, 8)) as compra_ref,
    orders.created_at,
    orders.status,
    orders.payment_status,
    orders.payment_id,
    orders.preference_id,
    orders.total_amount,
    orders.currency,
    orders.payment_detail,
    substring(coalesce(orders.payment_detail, '') from 'marketplace_fee:([^|]+)') as marketplace_fee_raw
  from public.orders as orders
  where coalesce(orders.payment_detail, '') like 'mp_preference|%'
), classified as (
  select
    fee_orders.*,
    case
      when fee_orders.marketplace_fee_raw ~ '^[0-9]+(\.[0-9]+)?$'
        then fee_orders.marketplace_fee_raw::numeric
      else 0
    end as marketplace_fee,
    (
      lower(coalesce(fee_orders.status, '')) = 'approved'
      or lower(coalesce(fee_orders.payment_status, '')) = 'approved'
    ) as is_approved
  from fee_orders
), keep_order as (
  select *
  from classified
  where marketplace_fee > 0
    and is_approved
  order by created_at desc, id desc
  limit 1
), orders_to_reset as (
  select classified.*
  from classified
  where classified.marketplace_fee > 0
    and classified.id is distinct from (select keep_order.id from keep_order)
)
select jsonb_build_object(
  'resumen_actual', jsonb_build_object(
    'ordenes_con_fee', (select count(*) from classified where marketplace_fee > 0),
    'fee_total_registrado', (select coalesce(sum(marketplace_fee), 0) from classified where marketplace_fee > 0),
    'ordenes_aprobadas_con_fee', (select count(*) from classified where marketplace_fee > 0 and is_approved),
    'fee_aprobado_total', (select coalesce(sum(marketplace_fee), 0) from classified where marketplace_fee > 0 and is_approved)
  ),
  'keep_order', (select to_jsonb(keep_order) - 'payment_detail' from keep_order),
  'orders_to_reset_count', (select count(*) from orders_to_reset),
  'orders_to_reset_fee_total', (select coalesce(sum(marketplace_fee), 0) from orders_to_reset),
  'orders_to_reset', coalesce(
    (select jsonb_agg(to_jsonb(orders_to_reset) - 'payment_detail' order by created_at desc) from orders_to_reset),
    '[]'::jsonb
  )
) as auditoria_previa;

-- ============================================================================
-- APLICAR SEMI RESET - modifica solo public.orders.payment_detail
-- ============================================================================

begin;

with fee_orders as (
  select
    orders.id,
    orders.created_at,
    orders.status,
    orders.payment_status,
    orders.payment_detail,
    substring(coalesce(orders.payment_detail, '') from 'marketplace_fee:([^|]+)') as marketplace_fee_raw
  from public.orders as orders
  where coalesce(orders.payment_detail, '') like 'mp_preference|%'
), classified as (
  select
    fee_orders.*,
    case
      when fee_orders.marketplace_fee_raw ~ '^[0-9]+(\.[0-9]+)?$'
        then fee_orders.marketplace_fee_raw::numeric
      else 0
    end as marketplace_fee,
    (
      lower(coalesce(fee_orders.status, '')) = 'approved'
      or lower(coalesce(fee_orders.payment_status, '')) = 'approved'
    ) as is_approved
  from fee_orders
), keep_order as (
  select *
  from classified
  where marketplace_fee > 0
    and is_approved
  order by created_at desc, id desc
  limit 1
), orders_to_reset as (
  select classified.*
  from classified
  where classified.marketplace_fee > 0
    and classified.id is distinct from (select keep_order.id from keep_order)
), updated_orders as (
  update public.orders as orders
  set payment_detail =
    regexp_replace(orders.payment_detail, '(^|\|)marketplace_fee:[^|]*', '\1marketplace_fee:0')
    || '|admin_fee_reset_from:' || orders_to_reset.marketplace_fee::text
    || '|admin_fee_reset_at:' || now()::text
  from orders_to_reset
  where orders.id = orders_to_reset.id
    and exists (select 1 from keep_order)
  returning
    orders.id,
    upper(left(orders.id::text, 8)) as compra_ref,
    orders.created_at,
    orders.status,
    orders.payment_status,
    orders.payment_detail
)
select
  count(*) as ordenes_actualizadas,
  coalesce(jsonb_agg(to_jsonb(updated_orders) - 'payment_detail' order by created_at desc), '[]'::jsonb) as actualizadas
from updated_orders;

commit;

-- ============================================================================
-- VERIFICACION POSTERIOR - no modifica datos
-- ============================================================================

with fee_orders as (
  select
    orders.id,
    upper(left(orders.id::text, 8)) as compra_ref,
    orders.created_at,
    orders.status,
    orders.payment_status,
    orders.payment_id,
    orders.preference_id,
    orders.total_amount,
    orders.currency,
    orders.payment_detail,
    substring(coalesce(orders.payment_detail, '') from 'marketplace_fee:([^|]+)') as marketplace_fee_raw,
    substring(coalesce(orders.payment_detail, '') from 'admin_fee_reset_from:([^|]+)') as admin_fee_reset_from,
    substring(coalesce(orders.payment_detail, '') from 'admin_fee_reset_at:([^|]+)') as admin_fee_reset_at
  from public.orders as orders
  where coalesce(orders.payment_detail, '') like 'mp_preference|%'
), classified as (
  select
    fee_orders.*,
    case
      when fee_orders.marketplace_fee_raw ~ '^[0-9]+(\.[0-9]+)?$'
        then fee_orders.marketplace_fee_raw::numeric
      else 0
    end as marketplace_fee,
    (
      lower(coalesce(fee_orders.status, '')) = 'approved'
      or lower(coalesce(fee_orders.payment_status, '')) = 'approved'
    ) as is_approved
  from fee_orders
)
select jsonb_build_object(
  'panel_esperado', jsonb_build_object(
    'ordenes_con_fee', count(*) filter (where marketplace_fee > 0),
    'fee_total_registrado', coalesce(sum(marketplace_fee) filter (where marketplace_fee > 0), 0),
    'ordenes_aprobadas_con_fee', count(*) filter (where marketplace_fee > 0 and is_approved),
    'fee_aprobado_total', coalesce(sum(marketplace_fee) filter (where marketplace_fee > 0 and is_approved), 0)
  ),
  'ordenes_reseteadas', count(*) filter (where admin_fee_reset_from is not null),
  'ordenes_con_fee_actual', coalesce(
    jsonb_agg(to_jsonb(classified) - 'payment_detail' order by created_at desc)
      filter (where marketplace_fee > 0),
    '[]'::jsonb
  ),
  'ultimas_reseteadas', coalesce(
    jsonb_agg(to_jsonb(classified) - 'payment_detail' order by created_at desc)
      filter (where admin_fee_reset_from is not null),
    '[]'::jsonb
  )
) as verificacion_posterior
from classified;

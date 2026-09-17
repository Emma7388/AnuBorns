-- Nombre: supabase-mercadopago-split-audit.sql
-- Detalle: auditoria de solo lectura del estado local del split de Mercado Pago.
-- No valida acreditacion real ni comisiones en Mercado Pago: eso debe confirmarse
-- en el pago/reporte de Mercado Pago o con soporte. Este SQL muestra que quedo
-- guardado en Supabase al crear y sincronizar ordenes.
--
-- Seguro para ejecutar varias veces en Supabase SQL Editor.
-- No cambia datos, indices, funciones, permisos ni politicas.

with mp_orders as (
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
    substring(coalesce(orders.payment_detail, '') from 'marketplace:([^|]+)') as marketplace_field,
    substring(coalesce(orders.payment_detail, '') from 'oauth_seller:([^|]+)') as oauth_seller,
    substring(coalesce(orders.payment_detail, '') from 'mp_status_detail:([^|]+)') as mp_status_detail
  from public.orders as orders
  where orders.preference_id is not null
     or orders.payment_id is not null
     or coalesce(orders.payment_detail, '') like 'mp_preference|%'
), classified_orders as (
  select
    mp_orders.*,
    case
      when mp_orders.marketplace_fee_raw ~ '^[0-9]+(\.[0-9]+)?$'
        then mp_orders.marketplace_fee_raw::numeric
      else null
    end as marketplace_fee,
    case
      when mp_orders.payment_detail is null then 'sin_traza_mp'
      when mp_orders.payment_detail not like 'mp_preference|%' then 'sin_traza_split_local'
      when mp_orders.oauth_seller is null then 'revisar_traza_sin_oauth_seller'
      when coalesce(
        case
          when mp_orders.marketplace_fee_raw ~ '^[0-9]+(\.[0-9]+)?$'
            then mp_orders.marketplace_fee_raw::numeric
          else null
        end,
        0
      ) > 0 then 'preferencia_con_oauth_y_marketplace_fee'
      else 'preferencia_con_oauth_sin_comision'
    end as estado_split_local
  from mp_orders
), split_summary as (
  select
    count(*) as ordenes_mp_revisadas,
    count(*) filter (where preference_id is not null) as con_preference_id,
    count(*) filter (where payment_id is not null) as con_payment_id,
    count(*) filter (where payment_detail like 'mp_preference|%') as con_traza_split_local,
    count(*) filter (where oauth_seller is not null) as con_oauth_seller_en_traza,
    count(*) filter (where marketplace_fee > 0) as con_marketplace_fee_mayor_a_cero,
    count(*) filter (where marketplace_fee = 0) as con_marketplace_fee_cero,
    coalesce(sum(marketplace_fee) filter (where marketplace_fee > 0), 0) as marketplace_fee_total_registrada,
    count(*) filter (
      where marketplace_field is not null
        and marketplace_field not in ('omitted', 'none')
    ) as con_marketplace_field_enviado,
    count(*) filter (where marketplace_field = 'omitted') as con_marketplace_field_omitido,
    count(*) filter (where status = 'approved' or payment_status = 'approved') as pagos_aprobados,
    count(*) filter (where status = 'pending' or payment_status = 'pending') as pagos_pendientes,
    count(*) filter (where status in ('rejected', 'cancelled', 'canceled') or payment_status in ('rejected', 'cancelled', 'canceled')) as pagos_no_aprobados,
    count(*) filter (where mp_status_detail is not null) as con_detalle_mp_sincronizado
  from classified_orders
), split_by_state as (
  select
    estado_split_local,
    count(*) as cantidad_ordenes,
    count(*) filter (where status = 'approved' or payment_status = 'approved') as aprobadas,
    min(created_at) as primera_orden,
    max(created_at) as ultima_orden
  from classified_orders
  group by estado_split_local
), oauth_summary as (
  select
    count(*) as vendedores_oauth_conectados,
    count(*) filter (where mp_user_id is not null) as vendedores_con_mp_user_id,
    count(*) filter (where live_mode is true) as vendedores_live_mode_true,
    count(*) filter (where live_mode is false) as vendedores_live_mode_false,
    count(*) filter (where expires_at is null or expires_at > now()) as conexiones_no_vencidas_o_sin_expiracion,
    max(connected_at) as ultima_conexion
  from public.seller_mercadopago_accounts
), recent_orders as (
  select
    compra_ref,
    created_at,
    status,
    payment_status,
    payment_id,
    preference_id,
    total_amount,
    currency,
    estado_split_local,
    marketplace_fee,
    marketplace_field,
    oauth_seller,
    mp_status_detail
  from classified_orders
  order by created_at desc
  limit 20
)
select jsonb_build_object(
  'resumen_split_local', (select to_jsonb(split_summary) from split_summary),
  'resumen_vendedores_oauth', (select to_jsonb(oauth_summary) from oauth_summary),
  'ordenes_por_estado_split_local', coalesce(
    (select jsonb_agg(to_jsonb(split_by_state) order by ultima_orden desc nulls last) from split_by_state),
    '[]'::jsonb
  ),
  'muestra_maxima_20_ordenes_recientes', coalesce(
    (select jsonb_agg(to_jsonb(recent_orders)) from recent_orders),
    '[]'::jsonb
  ),
  'interpretacion', jsonb_build_object(
    'preferencia_con_oauth_y_marketplace_fee',
      'Supabase registra que la preferencia se creo con vendedor OAuth y marketplace_fee mayor a cero. No prueba acreditacion real de la comision en Mercado Pago.',
    'preferencia_con_oauth_sin_comision',
      'La preferencia quedo asociada a vendedor OAuth, pero la comision local registrada fue cero.',
    'marketplace_field_omitido',
      'marketplace:omitted es esperado si MERCADOPAGO_SEND_MARKETPLACE_FIELD=false. El split/comision depende de marketplace_fee y de la habilitacion/configuracion de Mercado Pago.',
    'validacion_pendiente',
      'Para dar el split por validado falta revisar pago aprobado, comision acreditada y reportes/notificacion de Mercado Pago.'
  )
) as auditoria;

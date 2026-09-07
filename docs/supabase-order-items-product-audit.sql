-- Auditoría de integridad entre order_items.product_id y products.id.
-- SÓLO LECTURA: no cambia datos, tipos, índices, relaciones ni políticas.
--
-- product_id sigue siendo text de forma intencional: las ventas históricas
-- guardan una referencia/snapshot y convertirlo directamente a uuid podría
-- romper registros válidos antiguos.

with normalized_items as (
  select
    items.id,
    items.order_id,
    items.created_at,
    items.product_id as product_id_original,
    nullif(btrim(items.product_id), '') as product_id_normalized
  from public.order_items as items
), classified_items as (
  select
    items.*,
    products.id as current_product_id,
    case
      when items.product_id_normalized is null then 'sin_product_id'
      when products.id is not null then 'producto_actual_encontrado'
      when items.product_id_normalized ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then 'uuid_sin_producto_actual'
      else 'identificador_historico_o_no_uuid'
    end as estado
  from normalized_items as items
  left join public.products as products
    on products.id::text = items.product_id_normalized
), summary as (
  select
    count(*) as total_items,
    count(*) filter (where estado = 'producto_actual_encontrado') as productos_vinculables,
    count(*) filter (where estado = 'sin_product_id') as sin_product_id,
    count(*) filter (where estado = 'uuid_sin_producto_actual') as uuid_sin_producto_actual,
    count(*) filter (where estado = 'identificador_historico_o_no_uuid') as identificadores_historicos_o_no_uuid,
    count(*) filter (where product_id_original is distinct from product_id_normalized) as ids_con_espacios_o_vacios
  from classified_items
), pending_samples as (
  select
    estado,
    product_id_original,
    count(*) as cantidad_items,
    min(created_at) as primera_venta,
    max(created_at) as ultima_venta
  from classified_items
  where estado <> 'producto_actual_encontrado'
  group by estado, product_id_original
  order by ultima_venta desc nulls last
  limit 20
)
select jsonb_build_object(
  'resumen', (select to_jsonb(summary) from summary),
  'muestra_maxima_20_pendientes', (
    select coalesce(jsonb_agg(to_jsonb(pending_samples)), '[]'::jsonb)
    from pending_samples
  ),
  'interpretacion', jsonb_build_object(
    'producto_actual_encontrado', 'Se podría vincular en una futura migración, después de respaldo y revisión.',
    'sin_product_id', 'Venta histórica sin referencia: no se debe inventar ni completar automáticamente.',
    'uuid_sin_producto_actual', 'Tenía formato UUID, pero el producto ya no existe o no está disponible.',
    'identificador_historico_o_no_uuid', 'Referencia antigua/no compatible: conservar como texto y resolver manualmente si hiciera falta.'
  )
) as auditoria;

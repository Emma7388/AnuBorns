-- Indices de performance para consultas reales del marketplace.
-- Ejecutar en Supabase SQL editor despues de los schemas/migraciones base.
--
-- No cambia datos ni policies. Si la base ya tiene alguno de estos indices,
-- create index if not exists lo deja intacto.

-- Productos por vendedor y fecha: /mis-ventas, perfil publico del proveedor.
create index if not exists products_user_created_at_idx
  on public.products (user_id, created_at desc);

-- Productos por categoria y fecha: /comprar/productos/[categoria].
create index if not exists products_category_created_at_idx
  on public.products (category_id, created_at desc);

-- Productos recientes: destacados y listados generales.
create index if not exists products_created_at_idx
  on public.products (created_at desc);

-- Historial de compras del comprador: /mis-compras.
create index if not exists orders_user_created_at_idx
  on public.orders (user_id, created_at desc);

-- Limpieza de checkouts pendientes abandonados.
create index if not exists orders_pending_checkout_cleanup_idx
  on public.orders (user_id, created_at)
  where status = 'pending'
    and payment_id is null;

-- Joins de ventas por estado de orden: destacados, validacion de vendido,
-- y endpoints de ventas.
create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc, id);

-- Items por producto y orden: validacion de disponibilidad y ventas.
create index if not exists order_items_product_order_idx
  on public.order_items (product_id, order_id);

-- Items por orden y producto: historial de compra, entrega y validaciones.
create index if not exists order_items_order_product_idx
  on public.order_items (order_id, product_id);

-- Variante nueva cuando order_items.product_uuid ya esta disponible.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_items'
      and column_name = 'product_uuid'
  ) then
    execute 'create index if not exists order_items_product_uuid_order_idx
      on public.order_items (product_uuid, order_id)
      where product_uuid is not null';
  end if;
end $$;

-- Estados de despacho por orden/producto para el comprador y confirmaciones.
create index if not exists sale_dispatches_order_product_idx
  on public.sale_dispatches (order_id, product_id);

-- Estados de despacho del vendedor: panel operativo y realtime.
create index if not exists sale_dispatches_seller_status_updated_idx
  on public.sale_dispatches (seller_id, fulfillment_status, status_updated_at desc);

-- Carrito por usuario con orden estable.
create index if not exists carts_user_created_at_idx
  on public.carts (user_id, created_at);

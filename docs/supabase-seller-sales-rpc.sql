-- RPC paginada para el panel "Mis ventas".
-- Ejecutar en Supabase SQL editor.
--
-- Mueve filtro, conteo y paginacion a Postgres para evitar traer todas las
-- ventas del vendedor y paginar en JS.

create or replace function public.get_seller_sales_page(
  p_seller_id uuid,
  p_statuses text[],
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_pending_only boolean default false,
  p_limit integer default 3,
  p_offset integer default 0
)
returns table (
  product_id text,
  item_name text,
  unit_price numeric,
  provider text,
  product_title text,
  product_currency text,
  product_image_url text,
  product_seller_name text,
  order_id uuid,
  buyer_user_id uuid,
  order_created_at timestamptz,
  order_status text,
  payment_status text,
  payment_id text,
  payment_detail text,
  shipping_full_name text,
  shipping_address text,
  shipping_city text,
  shipping_phone text,
  shipping_requested boolean,
  shipping_cost numeric,
  fulfillment_status text,
  dispatched_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      order_items.product_id,
      order_items.name as item_name,
      order_items.unit_price,
      order_items.provider,
      products.title as product_title,
      products.currency as product_currency,
      products.image_url as product_image_url,
      products.seller_name as product_seller_name,
      orders.id as order_id,
      orders.user_id as buyer_user_id,
      orders.created_at as order_created_at,
      orders.status as order_status,
      orders.payment_status,
      orders.payment_id,
      orders.payment_detail,
      orders.shipping_full_name,
      orders.shipping_address,
      orders.shipping_city,
      orders.shipping_phone,
      orders.shipping_requested,
      orders.shipping_cost,
      sale_dispatches.fulfillment_status,
      sale_dispatches.dispatched_at
    from public.order_items
    inner join public.products
      on products.id::text = nullif(btrim(order_items.product_id), '')
     and products.user_id = p_seller_id
    inner join public.orders
      on orders.id = order_items.order_id
    left join public.sale_dispatches
      on sale_dispatches.seller_id = p_seller_id
     and sale_dispatches.order_id = orders.id
     and sale_dispatches.product_id = order_items.product_id
    where orders.status = any(p_statuses)
      and (p_from is null or orders.created_at >= p_from)
      and (p_to is null or orders.created_at <= p_to)
      and (
        not p_pending_only
        or (
          lower(coalesce(orders.status, '')) = 'approved'
          and coalesce(
            nullif(sale_dispatches.fulfillment_status, ''),
            case when orders.shipping_requested then 'requested' else 'pickup_pending' end
          ) <> all(array['completed', 'shipped', 'ready_for_pickup'])
        )
      )
  )
  select
    base.product_id,
    base.item_name,
    base.unit_price,
    base.provider,
    base.product_title,
    base.product_currency,
    base.product_image_url,
    base.product_seller_name,
    base.order_id,
    base.buyer_user_id,
    base.order_created_at,
    base.order_status,
    base.payment_status,
    base.payment_id,
    base.payment_detail,
    base.shipping_full_name,
    base.shipping_address,
    base.shipping_city,
    base.shipping_phone,
    base.shipping_requested,
    base.shipping_cost,
    base.fulfillment_status,
    base.dispatched_at,
    count(*) over()::bigint as total_count
  from base
  order by base.order_created_at desc, base.order_id desc, base.product_id
  limit least(greatest(coalesce(p_limit, 3), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_seller_sales_page(uuid, text[], timestamptz, timestamptz, boolean, integer, integer)
  from public;

grant execute on function public.get_seller_sales_page(uuid, text[], timestamptz, timestamptz, boolean, integer, integer)
  to service_role;

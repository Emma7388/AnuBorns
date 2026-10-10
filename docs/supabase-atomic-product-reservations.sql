-- Reserva atomica de productos para checkout.
--
-- Ejecutar una sola vez en Supabase SQL Editor antes de desplegar el codigo
-- que llama a create_checkout_order_atomic(...).
-- No borra productos ni ordenes. Si detecta dos ordenes activas para el mismo
-- producto, aborta toda la migracion para que el conflicto se revise primero.

begin;

-- Dependencia usada por las compras nuevas. Es idempotente y conserva
-- product_id como snapshot historico de texto.
alter table public.order_items
  add column if not exists product_uuid uuid
    references public.products (id) on delete set null;

create index if not exists order_items_product_uuid_idx
  on public.order_items (product_uuid)
  where product_uuid is not null;

create table if not exists public.product_checkout_reservations (
  product_id text primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists product_checkout_reservations_order_idx
  on public.product_checkout_reservations (order_id);

alter table public.product_checkout_reservations enable row level security;

-- La reserva se administra exclusivamente mediante triggers y RPC server-side.
revoke all on table public.product_checkout_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.product_checkout_reservations to service_role;

create or replace function public.sync_order_product_reservations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  reservation_owner uuid;
begin
  if new.status = any (array['pending', 'approved', 'partially_refunded', 'refund_pending']::text[]) then
    if exists (
      select 1
      from public.order_items
      where order_id = new.id
        and nullif(btrim(product_id), '') is null
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_order_product';
    end if;

    insert into public.product_checkout_reservations (product_id, order_id)
    select distinct btrim(product_id), new.id
    from public.order_items
    where order_id = new.id
      and nullif(btrim(product_id), '') is not null
    on conflict (product_id) do nothing;

    select reservations.order_id
    into reservation_owner
    from public.order_items as items
    join public.product_checkout_reservations as reservations
      on reservations.product_id = btrim(items.product_id)
    where items.order_id = new.id
      and reservations.order_id <> new.id
    limit 1;

    if reservation_owner is not null then
      raise exception using
        errcode = 'P0001',
        message = 'product_unavailable';
    end if;
  else
    delete from public.product_checkout_reservations
    where order_id = new.id;
  end if;

  return new;
end;
$$;

create or replace function public.sync_order_item_product_reservation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  order_status text;
  reservation_owner uuid;
  normalized_product_id text;
begin
  if tg_op = 'DELETE' then
    delete from public.product_checkout_reservations
    where product_id = btrim(old.product_id)
      and order_id = old.order_id;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.order_id is distinct from new.order_id or old.product_id is distinct from new.product_id) then
    delete from public.product_checkout_reservations
    where product_id = btrim(old.product_id)
      and order_id = old.order_id;
  end if;

  normalized_product_id := nullif(btrim(new.product_id), '');
  select orders.status
  into order_status
  from public.orders
  where orders.id = new.order_id;

  if order_status = any (array['pending', 'approved', 'partially_refunded', 'refund_pending']::text[]) then
    if normalized_product_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_order_product';
    end if;

    insert into public.product_checkout_reservations (product_id, order_id)
    values (normalized_product_id, new.order_id)
    on conflict (product_id) do nothing;

    select reservations.order_id
    into reservation_owner
    from public.product_checkout_reservations as reservations
    where reservations.product_id = normalized_product_id;

    if reservation_owner is distinct from new.order_id then
      raise exception using
        errcode = 'P0001',
        message = 'product_unavailable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_sync_product_reservations on public.orders;
create trigger orders_sync_product_reservations
after insert or update on public.orders
for each row execute function public.sync_order_product_reservations();

drop trigger if exists order_items_sync_product_reservation on public.order_items;
create trigger order_items_sync_product_reservation
after insert or update or delete on public.order_items
for each row execute function public.sync_order_item_product_reservation();

-- Antes del backfill, aborta si el historial activo ya viola producto unico.
do $$
declare
  conflicting_products integer;
begin
  select count(*)
  into conflicting_products
  from (
    select btrim(items.product_id)
    from public.order_items as items
    join public.orders as orders on orders.id = items.order_id
    where orders.status = any (array['pending', 'approved', 'partially_refunded', 'refund_pending']::text[])
      and nullif(btrim(items.product_id), '') is not null
    group by btrim(items.product_id)
    having count(distinct orders.id) > 1
  ) as conflicts;

  if conflicting_products > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'active_product_conflicts_found',
      detail = conflicting_products::text;
  end if;
end;
$$;

insert into public.product_checkout_reservations (product_id, order_id)
select distinct btrim(items.product_id), orders.id
from public.order_items as items
join public.orders as orders on orders.id = items.order_id
where orders.status = any (array['pending', 'approved', 'partially_refunded', 'refund_pending']::text[])
  and nullif(btrim(items.product_id), '') is not null
on conflict (product_id) do update
set order_id = excluded.order_id;

create or replace function public.create_checkout_order_atomic(
  p_user_id uuid,
  p_status text,
  p_total_amount numeric,
  p_currency text,
  p_shipping_full_name text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_phone text,
  p_shipping_requested boolean,
  p_shipping_cost numeric,
  p_shipping_status text,
  p_payment_status text,
  p_payment_detail text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requested_count integer;
  distinct_count integer;
  locked_count integer;
  mismatch_count integer;
  product_total numeric;
  product_currencies integer;
  product_currency text;
  product_ids uuid[];
  product_id uuid;
  conflict_ids text[];
  created_order public.orders%rowtype;
begin
  if p_user_id is null
     or p_status is null
     or p_status <> all (array['pending', 'approved']::text[])
     or p_total_amount is null
     or p_total_amount < 0
     or p_shipping_cost is null
     or p_shipping_cost < 0
     or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select
    count(*),
    count(distinct requested.product_id),
    array_agg(distinct requested.product_id order by requested.product_id)
  into requested_count, distinct_count, product_ids
  from (
    select (value ->> 'product_id')::uuid as product_id
    from jsonb_array_elements(p_items)
  ) as requested;

  if requested_count <> distinct_count then
    return jsonb_build_object('ok', false, 'code', 'duplicate_products');
  end if;

  -- Advisory locks serializan reservas y aprobaciones por id aun si una
  -- publicacion se elimina. El orden estable evita deadlocks multiproducto.
  foreach product_id in array product_ids loop
    perform pg_advisory_xact_lock(hashtextextended(product_id::text, 0));
  end loop;

  -- El row lock evita que precio, moneda o vendedor cambien durante la RPC.
  perform products.id
  from public.products as products
  where products.id = any (product_ids)
  order by products.id
  for update;
  get diagnostics locked_count = row_count;

  if locked_count <> requested_count then
    return jsonb_build_object('ok', false, 'code', 'products_invalid');
  end if;

  select array_agg(reservations.product_id order by reservations.product_id)
  into conflict_ids
  from public.product_checkout_reservations as reservations
  where reservations.product_id = any (product_ids::text[]);

  if coalesce(array_length(conflict_ids, 1), 0) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'product_unavailable',
      'sold_product_ids', to_jsonb(conflict_ids)
    );
  end if;

  select count(*)
  into mismatch_count
  from jsonb_to_recordset(p_items) as requested(
    product_id text,
    qty integer,
    unit_price numeric,
    currency text,
    provider_user_id uuid
  )
  join public.products as products on products.id = requested.product_id::uuid
  where requested.qty is distinct from 1
     or products.price is distinct from requested.unit_price
     or upper(products.currency) is distinct from upper(requested.currency)
     or products.user_id is distinct from requested.provider_user_id
     or products.user_id = p_user_id;

  if mismatch_count > 0 then
    return jsonb_build_object('ok', false, 'code', 'products_changed');
  end if;

  select
    coalesce(sum(products.price), 0),
    count(distinct upper(products.currency)),
    min(upper(products.currency))
  into product_total, product_currencies, product_currency
  from public.products as products
  where products.id = any (product_ids);

  if product_currencies <> 1
     or product_currency is distinct from upper(p_currency)
     or product_total + p_shipping_cost is distinct from p_total_amount then
    return jsonb_build_object('ok', false, 'code', 'products_changed');
  end if;

  insert into public.orders (
    user_id,
    status,
    total_amount,
    currency,
    shipping_full_name,
    shipping_address,
    shipping_city,
    shipping_phone,
    shipping_requested,
    shipping_cost,
    shipping_status,
    payment_status,
    payment_detail
  ) values (
    p_user_id,
    p_status,
    p_total_amount,
    upper(p_currency),
    nullif(btrim(p_shipping_full_name), ''),
    nullif(btrim(p_shipping_address), ''),
    nullif(btrim(p_shipping_city), ''),
    nullif(btrim(p_shipping_phone), ''),
    p_shipping_requested,
    p_shipping_cost,
    p_shipping_status,
    nullif(btrim(p_payment_status), ''),
    nullif(btrim(p_payment_detail), '')
  )
  returning * into created_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_uuid,
    name,
    qty,
    unit_price,
    unit,
    provider,
    image
  )
  select
    created_order.id,
    products.id::text,
    products.id,
    products.title,
    1,
    products.price,
    null,
    nullif(btrim(products.seller_name), ''),
    nullif(btrim(products.image_url), '')
  from jsonb_array_elements(p_items) with ordinality as requested(value, position)
  join public.products as products on products.id = (requested.value ->> 'product_id')::uuid
  order by requested.position;

  return jsonb_build_object(
    'ok', true,
    'order', to_jsonb(created_order)
  );
end;
$$;

revoke all on function public.create_checkout_order_atomic(
  uuid, text, numeric, text, text, text, text, text,
  boolean, numeric, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_checkout_order_atomic(
  uuid, text, numeric, text, text, text, text, text,
  boolean, numeric, text, text, text, jsonb
) to service_role;

revoke all on function public.sync_order_product_reservations() from public, anon, authenticated;
revoke all on function public.sync_order_item_product_reservation() from public, anon, authenticated;

commit;

-- Fuerza a PostgREST a descubrir la RPC nueva sin esperar el refresco normal.
select pg_notify('pgrst', 'reload schema');

-- Verificacion posterior de solo lectura. Debe devolver cero conflictos y
-- la misma cantidad de productos activos que de reservas.
with active_products as (
  select distinct btrim(items.product_id) as product_id, orders.id as order_id
  from public.order_items as items
  join public.orders as orders on orders.id = items.order_id
  where orders.status in ('pending', 'approved', 'partially_refunded', 'refund_pending')
    and nullif(btrim(items.product_id), '') is not null
), conflicts as (
  select product_id
  from active_products
  group by product_id
  having count(distinct order_id) > 1
)
select jsonb_build_object(
  'active_products', (select count(*) from active_products),
  'reservations', (select count(*) from public.product_checkout_reservations),
  'conflicts', (select count(*) from conflicts),
  'rpc_service_role_execute', has_function_privilege(
    'service_role',
    'public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'rpc_anon_execute', has_function_privilege(
    'anon',
    'public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'rpc_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)',
    'EXECUTE'
  )
) as atomic_reservation_audit;

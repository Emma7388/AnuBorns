-- Stock atomico, publicaciones permanentes/mensuales y snapshots de vendedor.
--
-- Ejecutar en una ventana coordinada con el despliegue del codigo compatible.
-- El codigo nuevo necesita estas columnas y el codigo anterior pierde escritura
-- directa sobre products, por lo que no conviene dejar una version sin la otra.
-- La migracion es transaccional, no borra compras ni productos y puede repetirse.

begin;

create temporary table _ab_product_stock_migration_state on commit drop as
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'stock'
) as stock_already_existed;

alter table public.products
  add column if not exists stock integer not null default 1,
  add column if not exists publication_type text not null default 'permanent',
  add column if not exists publication_status text not null default 'active',
  add column if not exists publication_started_at timestamptz,
  add column if not exists publication_expires_at timestamptz;

update public.products
set stock = greatest(0, least(100, coalesce(stock, 1))),
    publication_type = case when publication_type = 'monthly' then 'monthly' else 'permanent' end,
    publication_status = case
      when publication_status in ('pending_payment', 'active', 'expired', 'cancelled') then publication_status
      else 'active'
    end;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_stock_range_check') then
    alter table public.products add constraint products_stock_range_check check (stock between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_publication_type_check') then
    alter table public.products add constraint products_publication_type_check
      check (publication_type in ('permanent', 'monthly'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_publication_status_check') then
    alter table public.products add constraint products_publication_status_check
      check (publication_status in ('pending_payment', 'active', 'expired', 'cancelled'));
  end if;
end;
$$;

create index if not exists products_publication_availability_idx
  on public.products (publication_status, publication_expires_at, stock);

alter table public.order_items
  add column if not exists product_uuid uuid references public.products (id) on delete set null,
  add column if not exists seller_user_id uuid references auth.users (id) on delete set null;

update public.cart_items set quantity = greatest(1, least(100, coalesce(quantity, 1)));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cart_items_quantity_range_check') then
    alter table public.cart_items add constraint cart_items_quantity_range_check check (quantity between 1 and 100);
  end if;
end;
$$;

-- Un usuario conserva un solo carrito. Los duplicados se fusionan sin sumar
-- unidades repetidas, que era la causa de tarjetas duplicadas entre sesiones.
with ranked_carts as (
  select id, first_value(id) over (partition by user_id order by created_at, id) as canonical_id
  from public.carts
), duplicate_items as (
  select ranked.canonical_id as cart_id, items.product_id,
    max(items.quantity) as quantity, max(items.price_snapshot) as price_snapshot
  from ranked_carts as ranked
  join public.cart_items as items on items.cart_id = ranked.id
  where ranked.id <> ranked.canonical_id
  group by ranked.canonical_id, items.product_id
)
insert into public.cart_items(cart_id, product_id, quantity, price_snapshot)
select cart_id, product_id, quantity, price_snapshot from duplicate_items
on conflict (cart_id, product_id) do update
set quantity = greatest(public.cart_items.quantity, excluded.quantity),
    price_snapshot = excluded.price_snapshot;

with ranked_carts as (
  select id, row_number() over (partition by user_id order by created_at, id) as position
  from public.carts
)
delete from public.carts as carts
using ranked_carts as ranked
where carts.id = ranked.id and ranked.position > 1;

create unique index if not exists carts_user_id_unique_idx on public.carts(user_id);

update public.order_items as items
set product_uuid = products.id,
    seller_user_id = products.user_id
from public.products as products
where products.id::text = nullif(btrim(items.product_id), '')
  and (items.product_uuid is null or items.seller_user_id is null);

create index if not exists order_items_seller_order_idx
  on public.order_items (seller_user_id, order_id);

create table if not exists public.product_publication_payments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(14,2) not null default 2000 check (amount = 2000),
  currency text not null default 'ARS' check (currency = 'ARS'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  preference_id text,
  payment_id text,
  payment_status text,
  payment_detail text,
  init_point text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_publication_payments add column if not exists init_point text;
alter table public.product_publication_payments alter column product_id drop not null;
alter table public.product_publication_payments
  drop constraint if exists product_publication_payments_product_id_fkey;
alter table public.product_publication_payments
  add constraint product_publication_payments_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

with ranked_pending as (
  select id, row_number() over (partition by product_id order by created_at desc, id desc) as position
  from public.product_publication_payments where status = 'pending'
)
update public.product_publication_payments as payments
set status = 'cancelled', payment_detail = 'superseded_pending_preference', updated_at = now()
from ranked_pending as ranked
where payments.id = ranked.id and ranked.position > 1;

create unique index if not exists product_publication_payments_one_pending_idx
  on public.product_publication_payments(product_id) where status = 'pending';

create index if not exists product_publication_payments_owner_idx
  on public.product_publication_payments (user_id, created_at desc);
create unique index if not exists product_publication_payments_active_preference_idx
  on public.product_publication_payments (preference_id) where preference_id is not null;
create unique index if not exists product_publication_payments_payment_idx
  on public.product_publication_payments (payment_id) where payment_id is not null;

alter table public.product_publication_payments enable row level security;
drop policy if exists product_publication_payments_select_own on public.product_publication_payments;
create policy product_publication_payments_select_own
  on public.product_publication_payments for select
  using (auth.uid() = user_id);
revoke insert, update, delete on public.product_publication_payments from public, anon, authenticated;
grant select, insert, update, delete on public.product_publication_payments to service_role;

-- Las publicaciones vencidas dejan de ser publicas. El propietario conserva lectura.
drop policy if exists products_select_public on public.products;
create policy products_select_public on public.products for select using (
  auth.uid() = user_id
  or (
    publication_status = 'active'
    and (publication_type = 'permanent' or publication_expires_at > now())
  )
);

-- Crear, editar y borrar pasa por APIs autenticadas del servidor.
drop policy if exists products_insert_own on public.products;
drop policy if exists products_update_own on public.products;
drop policy if exists products_delete_own on public.products;
revoke insert, update, delete on public.products from anon, authenticated;
grant select, insert, update, delete on public.products to service_role;

-- Reemplaza la reserva binaria por una reserva con cantidad por orden.
drop trigger if exists orders_sync_product_reservations on public.orders;
drop trigger if exists order_items_sync_product_reservation on public.order_items;
drop function if exists public.sync_order_product_reservations();
drop function if exists public.sync_order_item_product_reservation();

alter table public.product_checkout_reservations add column if not exists qty integer not null default 1;
alter table public.product_checkout_reservations drop constraint if exists product_checkout_reservations_pkey;
alter table public.product_checkout_reservations
  add constraint product_checkout_reservations_pkey primary key (product_id, order_id);

update public.product_checkout_reservations as reservations
set qty = coalesce(items.qty, 1)
from public.order_items as items
where items.order_id = reservations.order_id
  and btrim(items.product_id) = reservations.product_id;

-- En la primera ejecucion, las reservas antiguas todavia no descontaban stock.
do $$
begin
  if not (select stock_already_existed from _ab_product_stock_migration_state) then
    update public.products as products
    set stock = greatest(0, products.stock - reserved.qty)
    from (
      select product_id, sum(qty)::integer as qty
      from public.product_checkout_reservations
      group by product_id
    ) as reserved
    where products.id::text = reserved.product_id;
  end if;
end;
$$;

create or replace function public.sync_order_item_stock_reservation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_status text;
  requested_qty integer;
  available_stock integer;
  product_status text;
  product_type text;
  expires_at timestamptz;
  normalized_product_id text;
begin
  if tg_op = 'DELETE' then
    delete from public.product_checkout_reservations
    where product_id = btrim(old.product_id) and order_id = old.order_id;
    if found then
      update public.products set stock = least(100, stock + greatest(old.qty, 1))
      where id::text = btrim(old.product_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    old.order_id is distinct from new.order_id
    or old.product_id is distinct from new.product_id
    or old.qty is distinct from new.qty
  ) then
    delete from public.product_checkout_reservations
    where product_id = btrim(old.product_id) and order_id = old.order_id;
    if found then
      update public.products set stock = least(100, stock + greatest(old.qty, 1))
      where id::text = btrim(old.product_id);
    end if;
  end if;

  select status into current_status from public.orders where id = new.order_id;
  if current_status <> all (array['pending','approved','partially_refunded','refund_pending']::text[]) then
    return new;
  end if;

  normalized_product_id := nullif(btrim(new.product_id), '');
  requested_qty := greatest(coalesce(new.qty, 0), 0);
  if normalized_product_id is null or requested_qty < 1 or requested_qty > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_order_product';
  end if;

  if exists (
    select 1 from public.product_checkout_reservations
    where product_id = normalized_product_id and order_id = new.order_id
  ) then
    return new;
  end if;

  select stock, publication_status, publication_type, publication_expires_at
  into available_stock, product_status, product_type, expires_at
  from public.products
  where id::text = normalized_product_id
  for update;

  if available_stock is null
     or product_status <> 'active'
     or (product_type = 'monthly' and (expires_at is null or expires_at <= now()))
     or available_stock < requested_qty then
    raise exception using errcode = 'P0001', message = 'product_unavailable';
  end if;

  update public.products set stock = stock - requested_qty where id::text = normalized_product_id;
  insert into public.product_checkout_reservations (product_id, order_id, qty)
  values (normalized_product_id, new.order_id, requested_qty);
  return new;
end;
$$;

create or replace function public.sync_order_stock_reservations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  reservation record;
  item record;
  available_stock integer;
  product_status text;
  product_type text;
  expires_at timestamptz;
begin
  if old.status = any (array['pending','approved','partially_refunded','refund_pending']::text[])
     and new.status <> all (array['pending','approved','partially_refunded','refund_pending']::text[]) then
    for reservation in
      delete from public.product_checkout_reservations where order_id = new.id
      returning product_id, qty
    loop
      update public.products
      set stock = least(100, stock + reservation.qty)
      where id::text = reservation.product_id;
    end loop;
  elsif old.status <> all (array['pending','approved','partially_refunded','refund_pending']::text[])
     and new.status = any (array['pending','approved','partially_refunded','refund_pending']::text[]) then
    for item in
      select btrim(product_id) as product_id, greatest(qty, 1) as qty
      from public.order_items where order_id = new.id order by btrim(product_id)
    loop
      if not exists (
        select 1 from public.product_checkout_reservations
        where product_id = item.product_id and order_id = new.id
      ) then
        select stock, publication_status, publication_type, publication_expires_at
        into available_stock, product_status, product_type, expires_at
        from public.products
        where id::text = item.product_id for update;
        if available_stock is null
           or product_status <> 'active'
           or (product_type = 'monthly' and (expires_at is null or expires_at <= now()))
           or available_stock < item.qty then
          raise exception using errcode = 'P0001', message = 'product_unavailable';
        end if;
        update public.products set stock = stock - item.qty where id::text = item.product_id;
        insert into public.product_checkout_reservations(product_id, order_id, qty)
        values (item.product_id, new.id, item.qty);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.release_order_stock_before_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  reservation record;
begin
  for reservation in
    delete from public.product_checkout_reservations where order_id = old.id
    returning product_id, qty
  loop
    update public.products
    set stock = least(100, stock + reservation.qty)
    where id::text = reservation.product_id;
  end loop;
  return old;
end;
$$;

create trigger order_items_sync_product_reservation
after insert or update or delete on public.order_items
for each row execute function public.sync_order_item_stock_reservation();

create trigger orders_sync_product_reservations
after update of status on public.orders
for each row execute function public.sync_order_stock_reservations();

drop trigger if exists orders_release_stock_before_delete on public.orders;
create trigger orders_release_stock_before_delete
before delete on public.orders
for each row execute function public.release_order_stock_before_delete();

create or replace function public.create_checkout_order_atomic(
  p_user_id uuid, p_status text, p_total_amount numeric, p_currency text,
  p_shipping_full_name text, p_shipping_address text, p_shipping_city text,
  p_shipping_phone text, p_shipping_requested boolean, p_shipping_cost numeric,
  p_shipping_status text, p_payment_status text, p_payment_detail text, p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requested_count integer;
  distinct_count integer;
  mismatch_count integer;
  product_total numeric;
  product_currency text;
  product_currencies integer;
  created_order public.orders%rowtype;
  unavailable_ids text[];
begin
  if p_user_id is null or p_status is null or p_status <> all(array['pending','approved']::text[])
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50
     or p_total_amount is null or p_total_amount < 0
     or p_shipping_cost is null or p_shipping_cost < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  begin
    select count(*), count(distinct product_id)
    into requested_count, distinct_count
    from jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end;
  if requested_count <> distinct_count then
    return jsonb_build_object('ok', false, 'code', 'duplicate_products');
  end if;

  -- Bloqueo estable de todas las filas evita sobreventa en checkouts simultaneos.
  perform products.id
  from public.products as products
  join jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer)
    on requested.product_id = products.id
  order by products.id
  for update of products;

  select array_agg(requested.product_id::text order by requested.product_id)
  into unavailable_ids
  from jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer)
  left join public.products as products on products.id = requested.product_id
  where products.id is null or requested.qty < 1 or requested.qty > 100
     or products.stock < requested.qty
     or products.publication_status <> 'active'
     or (products.publication_type = 'monthly'
         and (products.publication_expires_at is null or products.publication_expires_at <= now()));
  if coalesce(array_length(unavailable_ids, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'product_unavailable', 'sold_product_ids', to_jsonb(unavailable_ids));
  end if;

  select count(*) into mismatch_count
  from jsonb_to_recordset(p_items) as requested(
    product_id uuid, qty integer, unit_price numeric, currency text, provider_user_id uuid
  )
  join public.products as products on products.id = requested.product_id
  where products.price is distinct from requested.unit_price
     or upper(products.currency) is distinct from upper(requested.currency)
     or products.user_id is distinct from requested.provider_user_id
     or products.user_id = p_user_id;
  if mismatch_count > 0 then
    return jsonb_build_object('ok', false, 'code', 'products_changed');
  end if;

  select sum(products.price * requested.qty), count(distinct upper(products.currency)), min(upper(products.currency))
  into product_total, product_currencies, product_currency
  from jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer)
  join public.products as products on products.id = requested.product_id;
  if product_currencies <> 1 or product_currency is distinct from upper(p_currency)
     or product_total + p_shipping_cost is distinct from p_total_amount then
    return jsonb_build_object('ok', false, 'code', 'products_changed');
  end if;

  insert into public.orders (
    user_id,status,total_amount,currency,shipping_full_name,shipping_address,
    shipping_city,shipping_phone,shipping_requested,shipping_cost,shipping_status,
    payment_status,payment_detail
  ) values (
    p_user_id,p_status,p_total_amount,upper(p_currency),nullif(btrim(p_shipping_full_name),''),
    nullif(btrim(p_shipping_address),''),nullif(btrim(p_shipping_city),''),
    nullif(btrim(p_shipping_phone),''),p_shipping_requested,p_shipping_cost,p_shipping_status,
    nullif(btrim(p_payment_status),''),nullif(btrim(p_payment_detail),'')
  ) returning * into created_order;

  insert into public.order_items (
    order_id,product_id,product_uuid,seller_user_id,name,qty,unit_price,unit,provider,image
  )
  select created_order.id,products.id::text,products.id,products.user_id,products.title,
    requested.qty,products.price,null,nullif(btrim(products.seller_name),''),nullif(btrim(products.image_url),'')
  from rows from (
    jsonb_to_recordset(p_items) as (
      product_id uuid, qty integer, unit_price numeric, currency text, provider_user_id uuid
    )
  ) with ordinality as requested(
    product_id, qty, unit_price, currency, provider_user_id, position
  )
  join public.products as products on products.id = requested.product_id
  order by requested.position;

  return jsonb_build_object('ok', true, 'order', to_jsonb(created_order));
end;
$$;

revoke all on function public.create_checkout_order_atomic(
  uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_atomic(
  uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb
) to service_role;
revoke all on function public.sync_order_item_stock_reservation() from public, anon, authenticated;
revoke all on function public.sync_order_stock_reservations() from public, anon, authenticated;
revoke all on function public.release_order_stock_before_delete() from public, anon, authenticated;

commit;
select pg_notify('pgrst', 'reload schema');

-- Auditoria final de solo lectura.
select jsonb_build_object(
  'stock_fuera_de_rango', (select count(*) from public.products where stock < 0 or stock > 100),
  'mensuales_sin_vencimiento_activas', (select count(*) from public.products where publication_type = 'monthly' and publication_status = 'active' and publication_expires_at is null),
  'reservas_sin_cantidad', (select count(*) from public.product_checkout_reservations where qty < 1),
  'rpc_service_role_execute', has_function_privilege('service_role','public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)','EXECUTE'),
  'rpc_authenticated_execute', has_function_privilege('authenticated','public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)','EXECUTE')
) as product_stock_publications_audit;

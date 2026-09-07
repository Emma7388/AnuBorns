-- Envio y seguimiento de entrega.
-- Ejecutar en Supabase SQL editor despues de supabase-schema.sql y supabase-sales-dispatch.sql.

alter table public.orders
  add column if not exists shipping_requested boolean not null default false,
  add column if not exists shipping_cost numeric(12,2) not null default 0,
  add column if not exists shipping_status text not null default 'not_requested';

alter table public.orders
  drop constraint if exists orders_shipping_status_check;

alter table public.orders
  add constraint orders_shipping_status_check
  check (
    shipping_status in (
      'not_requested',
      'requested',
      'preparing',
      'shipped',
      'delivered',
      'pickup_pending',
      'ready_for_pickup',
      'picked_up',
      'completed'
    )
  );

alter table public.sale_dispatches
  add column if not exists fulfillment_status text not null default 'pending',
  add column if not exists status_updated_at timestamptz not null default now();

alter table public.sale_dispatches
  drop constraint if exists sale_dispatches_fulfillment_status_check;

alter table public.sale_dispatches
  add constraint sale_dispatches_fulfillment_status_check
  check (
    fulfillment_status in (
      'pending',
      'requested',
      'preparing',
      'shipped',
      'delivered',
      'pickup_pending',
      'ready_for_pickup',
      'picked_up',
      'completed'
    )
  );

create index if not exists orders_shipping_status_idx on public.orders (shipping_status);
create index if not exists sale_dispatches_status_idx on public.sale_dispatches (fulfillment_status);

create table if not exists public.purchase_status_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  fulfillment_status text not null,
  status_updated_at timestamptz not null default '1970-01-01 00:00:00+00',
  read_at timestamptz not null default now(),
  constraint purchase_status_reads_unique
    unique (user_id, order_id, product_id, fulfillment_status, status_updated_at)
);

alter table public.purchase_status_reads
  add column if not exists status_updated_at timestamptz not null default '1970-01-01 00:00:00+00';

alter table public.purchase_status_reads
  alter column product_id type text using product_id::text;

update public.purchase_status_reads as reads
set status_updated_at = dispatches.status_updated_at
from public.sale_dispatches as dispatches
where reads.order_id = dispatches.order_id
  and reads.product_id = dispatches.product_id
  and reads.status_updated_at = '1970-01-01 00:00:00+00';

alter table public.purchase_status_reads
  drop constraint if exists purchase_status_reads_user_id_order_id_product_id_fulfillment_status_key,
  drop constraint if exists purchase_status_reads_user_id_order_id_product_id_fulfillme_key;

alter table public.purchase_status_reads
  drop constraint if exists purchase_status_reads_unique;

alter table public.purchase_status_reads
  add constraint purchase_status_reads_unique
  unique (user_id, order_id, product_id, fulfillment_status, status_updated_at);

alter table public.purchase_status_reads
  drop constraint if exists purchase_status_reads_fulfillment_status_check;

alter table public.purchase_status_reads
  add constraint purchase_status_reads_fulfillment_status_check
  check (
    fulfillment_status in (
      'pending',
      'requested',
      'preparing',
      'shipped',
      'delivered',
      'pickup_pending',
      'ready_for_pickup',
      'picked_up',
      'completed'
    )
  );

alter table public.purchase_status_reads enable row level security;

create index if not exists purchase_status_reads_user_idx on public.purchase_status_reads (user_id);
create index if not exists purchase_status_reads_lookup_idx
  on public.purchase_status_reads (user_id, order_id, product_id, fulfillment_status, status_updated_at);

drop policy if exists purchase_status_reads_select_own on public.purchase_status_reads;
create policy "purchase_status_reads_select_own"
  on public.purchase_status_reads
  for select
  using (auth.uid() = user_id);

-- Las confirmaciones y lecturas de estado pasan por API server-side.
-- No crear políticas directas de INSERT/UPDATE para el navegador.

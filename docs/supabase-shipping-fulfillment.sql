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
      'completed'
    )
  );

create index if not exists orders_shipping_status_idx on public.orders (shipping_status);
create index if not exists sale_dispatches_status_idx on public.sale_dispatches (fulfillment_status);

drop policy if exists sale_dispatches_update_own on public.sale_dispatches;
create policy "sale_dispatches_update_own"
  on public.sale_dispatches
  for update
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

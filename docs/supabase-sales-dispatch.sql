-- Persistencia de despacho por venta (vendedor).
-- Ejecutar en Supabase SQL editor.

create table if not exists public.sale_dispatches (
  id bigserial primary key,
  seller_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text not null,
  dispatched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (seller_id, order_id, product_id)
);

create index if not exists sale_dispatches_seller_idx on public.sale_dispatches (seller_id);
create index if not exists sale_dispatches_order_idx on public.sale_dispatches (order_id);
create index if not exists sale_dispatches_product_idx on public.sale_dispatches (product_id);
s
alter table public.sale_dispatches enable row level security;

drop policy if exists sale_dispatches_select_own on public.sale_dispatches;
create policy "sale_dispatches_select_own"
  on public.sale_dispatches
  for select
  using (auth.uid() = seller_id);

drop policy if exists sale_dispatches_insert_own on public.sale_dispatches;
create policy "sale_dispatches_insert_own"
  on public.sale_dispatches
  for insert
  with check (auth.uid() = seller_id);

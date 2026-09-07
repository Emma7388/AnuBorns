-- Persistencia de despacho por venta (vendedor).
-- Ejecutar en Supabase SQL editor.

create table if not exists public.sale_dispatches (
  id bigserial primary key,
  seller_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text not null,
  fulfillment_status text not null default 'pending',
  dispatched_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (seller_id, order_id, product_id)
);

alter table public.sale_dispatches
  add column if not exists fulfillment_status text not null default 'pending',
  add column if not exists status_updated_at timestamptz not null default now();

create index if not exists sale_dispatches_seller_idx on public.sale_dispatches (seller_id);
create index if not exists sale_dispatches_order_idx on public.sale_dispatches (order_id);
create index if not exists sale_dispatches_product_idx on public.sale_dispatches (product_id);
create index if not exists sale_dispatches_status_idx on public.sale_dispatches (fulfillment_status);

alter table public.sale_dispatches enable row level security;

drop policy if exists sale_dispatches_select_own on public.sale_dispatches;
create policy "sale_dispatches_select_own"
  on public.sale_dispatches
  for select
  using (
    auth.uid() = seller_id
    or exists (
      select 1
      from public.orders as buyer_order
      where buyer_order.id = sale_dispatches.order_id
        and buyer_order.user_id = auth.uid()
    )
  );

-- Inserciones y cambios de estado se realizan exclusivamente desde las API
-- server-side. No crear políticas directas de escritura para el navegador.

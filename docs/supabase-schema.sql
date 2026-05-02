-- Supabase schema for orders + order_items
-- Run this in Supabase SQL editor.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  status text not null default 'pending',
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'ARS',
  shipping_full_name text,
  shipping_address text,
  shipping_city text,
  shipping_phone text,
  preference_id text,
  payment_id text,
  payment_status text,
  payment_detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigserial primary key,
  order_id uuid references public.orders on delete cascade not null,
  product_id text,
  name text not null,
  qty integer not null default 1,
  unit_price numeric(12,2) not null default 0,
  unit text,
  provider text,
  image text,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Allow logged-in users to read their own orders
drop policy if exists "Orders are viewable by owner" on public.orders;
create policy "Orders are viewable by owner"
on public.orders
for select
using (auth.uid() = user_id);

-- Allow logged-in users to read their order items
drop policy if exists "Order items viewable by owner" on public.order_items;
create policy "Order items viewable by owner"
on public.order_items
for select
using (
  exists (
    select 1
    from public.orders
    where public.orders.id = order_items.order_id
      and public.orders.user_id = auth.uid()
  )
);

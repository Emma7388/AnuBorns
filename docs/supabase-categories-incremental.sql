-- Incremental update for existing DBs (safe to run multiple times)

-- Ensure categories table exists
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_slug_idx on public.categories (slug);
create unique index if not exists categories_name_idx on public.categories (name);

alter table public.categories enable row level security;
drop policy if exists categories_select_all on public.categories;
create policy "categories_select_all"
  on public.categories
  for select
  using (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

insert into public.categories (name, slug, icon)
values
  ('Plomería', 'plomeria', '/icons/plomeria.svg'),
  ('Electricidad', 'electricidad', '/icons/electricidad.svg'),
  ('Corralón', 'corralon', '/icons/corralon.svg'),
  ('Ferretería', 'ferreteria', '/icons/ferreteria.svg'),
  ('Construcción', 'construccion', '/icons/construccion.svg'),
  ('Pinturería', 'pintureria', '/icons/pintureria.svg'),
  ('Carpintería', 'carpinteria', '/icons/carpinteria.svg'),
  ('Hogar', 'hogar', '/icons/hogar.svg')
on conflict (slug) do update
set name = excluded.name,
    icon = excluded.icon;

-- Ensure products table exists and add missing columns
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  title text not null,
  description text,
  price numeric(14,2) not null default 0,
  currency text not null default 'ARS',
  location text,
  delivery_methods text[],
  pickup_address text,
  contact text,
  image_url text,
  image_urls jsonb,
  seller_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists location text,
  add column if not exists delivery_methods text[],
  add column if not exists pickup_address text,
  add column if not exists contact text,
  add column if not exists image_urls jsonb,
  add column if not exists seller_name text;

alter table public.products
  alter column price type numeric(14,2);

create index if not exists products_user_id_idx on public.products (user_id);
create index if not exists products_category_id_idx on public.products (category_id);

alter table public.products enable row level security;

drop policy if exists products_select_public on public.products;
create policy "products_select_public"
  on public.products
  for select
  using (true);

drop policy if exists products_insert_own on public.products;
create policy "products_insert_own"
  on public.products
  for insert
  with check (auth.uid() = user_id);

drop policy if exists products_update_own on public.products;
create policy "products_update_own"
  on public.products
  for update
  using (auth.uid() = user_id);

drop policy if exists products_delete_own on public.products;
create policy "products_delete_own"
  on public.products
  for delete
  using (auth.uid() = user_id);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- Carts (carrito híbrido)
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists carts_user_id_idx on public.carts (user_id);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null default 1,
  price_snapshot numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists cart_items_cart_product_idx
  on public.cart_items (cart_id, product_id);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

drop policy if exists carts_select_own on public.carts;
create policy "carts_select_own"
  on public.carts
  for select
  using (auth.uid() = user_id);

drop policy if exists carts_insert_own on public.carts;
create policy "carts_insert_own"
  on public.carts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists carts_update_own on public.carts;
create policy "carts_update_own"
  on public.carts
  for update
  using (auth.uid() = user_id);

drop policy if exists carts_delete_own on public.carts;
create policy "carts_delete_own"
  on public.carts
  for delete
  using (auth.uid() = user_id);

drop policy if exists cart_items_select_own on public.cart_items;
create policy "cart_items_select_own"
  on public.cart_items
  for select
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
    )
  );

drop policy if exists cart_items_insert_own on public.cart_items;
create policy "cart_items_insert_own"
  on public.cart_items
  for insert
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
    )
  );

drop policy if exists cart_items_update_own on public.cart_items;
create policy "cart_items_update_own"
  on public.cart_items
  for update
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
    )
  );

drop policy if exists cart_items_delete_own on public.cart_items;
create policy "cart_items_delete_own"
  on public.cart_items
  for delete
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
    )
  );

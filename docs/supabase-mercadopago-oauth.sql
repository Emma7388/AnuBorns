-- Conexiones OAuth de Mercado Pago por vendedor.
-- Ejecutar en Supabase SQL editor.

create table if not exists public.seller_mercadopago_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mp_user_id text,
  access_token text not null,
  refresh_token text,
  public_key text,
  token_type text,
  scope text,
  live_mode boolean,
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seller_mercadopago_accounts_mp_user_idx
  on public.seller_mercadopago_accounts (mp_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists seller_mercadopago_accounts_set_updated_at on public.seller_mercadopago_accounts;
create trigger seller_mercadopago_accounts_set_updated_at
before update on public.seller_mercadopago_accounts
for each row execute function public.set_updated_at();

alter table public.seller_mercadopago_accounts enable row level security;

drop policy if exists seller_mercadopago_accounts_select_own on public.seller_mercadopago_accounts;
create policy "seller_mercadopago_accounts_select_own"
  on public.seller_mercadopago_accounts
  for select
  using (auth.uid() = user_id);

drop policy if exists seller_mercadopago_accounts_insert_own on public.seller_mercadopago_accounts;
create policy "seller_mercadopago_accounts_insert_own"
  on public.seller_mercadopago_accounts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists seller_mercadopago_accounts_update_own on public.seller_mercadopago_accounts;
create policy "seller_mercadopago_accounts_update_own"
  on public.seller_mercadopago_accounts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists seller_mercadopago_accounts_delete_own on public.seller_mercadopago_accounts;
create policy "seller_mercadopago_accounts_delete_own"
  on public.seller_mercadopago_accounts
  for delete
  using (auth.uid() = user_id);

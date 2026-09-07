-- Cierre de acceso directo a credenciales OAuth de Mercado Pago.
-- Ejecutar DESPUÉS de revisar supabase-rls-audit.sql.
-- Las API del proyecto usan service role y continúan operando.

begin;

alter table public.seller_mercadopago_accounts enable row level security;

drop policy if exists seller_mercadopago_accounts_select_own on public.seller_mercadopago_accounts;
drop policy if exists seller_mercadopago_accounts_insert_own on public.seller_mercadopago_accounts;
drop policy if exists seller_mercadopago_accounts_update_own on public.seller_mercadopago_accounts;
drop policy if exists seller_mercadopago_accounts_delete_own on public.seller_mercadopago_accounts;

revoke all on table public.seller_mercadopago_accounts from anon, authenticated;

commit;

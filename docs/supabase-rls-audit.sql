-- Auditoría de RLS: sólo lectura. Ejecutar primero en Supabase SQL Editor.
-- No modifica tablas, políticas ni datos.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('profiles', 'seller_mercadopago_accounts', 'audit_logs')
order by c.relname;

select
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'seller_mercadopago_accounts', 'audit_logs')
order by tablename, policyname;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'seller_mercadopago_accounts'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

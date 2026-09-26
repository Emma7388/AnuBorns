-- Politica recomendada para borrado de usuarios en Supabase Auth.
--
-- En este marketplace conviene conservar trazabilidad de compras, ventas,
-- pagos, reclamos y auditoria. Por eso public.orders.user_id debe bloquear
-- el borrado fisico del usuario cuando ya tiene actividad comercial.
--
-- Ejecutar en Supabase SQL editor para diagnosticar. No borra datos.

-- 1) Ver todas las foreign keys que apuntan a auth.users y su accion al borrar.
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else con.confdeltype::text
  end as on_delete,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where con.contype = 'f'
  and con.confrelid = 'auth.users'::regclass
order by n.nspname, c.relname, con.conname;

-- 2) Diagnostico para un usuario puntual.
-- Reemplazar el UUID antes de decidir si borrar o desactivar.
with target as (
  select '00000000-0000-0000-0000-000000000000'::uuid as user_id
)
select 'orders' as table_name, count(*) as row_count
from public.orders, target
where orders.user_id = target.user_id
union all
select 'products', count(*)
from public.products, target
where products.user_id = target.user_id
union all
select 'carts', count(*)
from public.carts, target
where carts.user_id = target.user_id
union all
select 'profiles', count(*)
from public.profiles, target
where profiles.user_id = target.user_id
union all
select 'seller_mercadopago_accounts', count(*)
from public.seller_mercadopago_accounts, target
where seller_mercadopago_accounts.user_id = target.user_id
union all
select 'sale_dispatches_as_seller', count(*)
from public.sale_dispatches, target
where sale_dispatches.seller_id = target.user_id
union all
select 'purchase_status_reads', count(*)
from public.purchase_status_reads, target
where purchase_status_reads.user_id = target.user_id
union all
select 'audit_logs', count(*)
from public.audit_logs, target
where audit_logs.user_id = target.user_id
union all
select 'admin_users', count(*)
from public.admin_users, target
where admin_users.user_id = target.user_id
union all
select 'admin_users_created_by', count(*)
from public.admin_users, target
where admin_users.created_by = target.user_id
order by table_name;

-- 3) Asegurar la politica recomendada:
-- Si el usuario tiene orders, no permitir borrado fisico desde auth.users.
do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'f'
    and n.nspname = 'public'
    and c.relname = 'orders'
    and con.confrelid = 'auth.users'::regclass
    and con.conkey = array[
      (
        select attnum
        from pg_attribute
        where attrelid = 'public.orders'::regclass
          and attname = 'user_id'
      )
    ]::smallint[]
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.orders drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete restrict;

-- 4) Confirmar que public.orders quedo en RESTRICT.
select
  con.conname as constraint_name,
  case con.confdeltype
    when 'r' then 'RESTRICT'
    else con.confdeltype::text
  end as on_delete,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.contype = 'f'
  and con.conrelid = 'public.orders'::regclass
  and con.confrelid = 'auth.users'::regclass;

-- Supabase Realtime para compras, ventas y estados de entrega.
-- Ejecutar en Supabase SQL editor despues de:
-- 1. docs/supabase-schema.sql
-- 2. docs/supabase-sales-dispatch.sql
-- 3. docs/supabase-shipping-fulfillment.sql
--
-- Esto equivale a activar estas tablas en Database > Publications > supabase_realtime.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    execute 'alter publication supabase_realtime add table public.order_items';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sale_dispatches'
  ) then
    execute 'alter publication supabase_realtime add table public.sale_dispatches';
  end if;
end;
$$;

select
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('orders', 'order_items', 'products', 'sale_dispatches')
order by tablename;

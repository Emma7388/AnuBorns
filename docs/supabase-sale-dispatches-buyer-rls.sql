-- RLS para Realtime de estados de compra.
-- Ejecutar en Supabase SQL editor despues de docs/supabase-realtime.sql.
--
-- Permite que el comprador reciba cambios de sale_dispatches de sus propias
-- ordenes, sin darle permisos para insertar o actualizar esas filas.

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

select
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and tablename = 'sale_dispatches'
  and policyname = 'sale_dispatches_select_own';

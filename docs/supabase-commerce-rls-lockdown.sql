-- Cierre de políticas de escritura directa y correcciones detectadas por
-- supabase-commerce-schema-audit.sql.
-- No elimina órdenes, productos, ventas ni despachos.

begin;

-- Las operaciones de checkout y estado ya usan APIs con service role.
drop policy if exists "Users can create orders" on public.orders;
drop policy if exists "Users can update their orders" on public.orders;
drop policy if exists "Users can create order items" on public.order_items;
drop policy if exists sale_dispatches_insert_own on public.sale_dispatches;
drop policy if exists sale_dispatches_update_own on public.sale_dispatches;
drop policy if exists purchase_status_reads_insert_own on public.purchase_status_reads;

-- Esta restricción antigua omite status_updated_at y bloquea el historial
-- correcto de lecturas. La restricción vigente purchase_status_reads_unique
-- ya incluye ese campo.
alter table public.purchase_status_reads
  drop constraint if exists purchase_status_reads_user_id_order_id_product_id_fulfillment_status_key,
  drop constraint if exists purchase_status_reads_user_id_order_id_product_id_fulfillme_key;

-- Índices de las relaciones consultadas por historial, ventas y despachos.
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

-- Reemplaza el índice de búsqueda heredado por la versión que usa el cursor
-- completo del estado.
drop index if exists public.purchase_status_reads_lookup_idx;
create index purchase_status_reads_lookup_idx
  on public.purchase_status_reads (user_id, order_id, product_id, fulfillment_status, status_updated_at);

commit;

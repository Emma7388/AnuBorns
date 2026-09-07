-- Vínculo opcional entre order_items y products.
--
-- Conserva product_id como texto histórico. product_uuid se usa sólo como
-- relación para consultas nuevas y queda NULL si el producto ya no existe.
-- ON DELETE SET NULL permite borrar una publicación sin borrar ni romper
-- ventas anteriores, cuyos datos snapshot permanecen en order_items.

begin;

alter table public.order_items
  add column if not exists product_uuid uuid
    references public.products (id) on delete set null;

-- Completa únicamente las filas cuyo texto coincide exactamente con un
-- producto existente. Las ventas con producto borrado quedan en NULL.
update public.order_items as items
set product_uuid = products.id
from public.products as products
where items.product_uuid is null
  and nullif(btrim(items.product_id), '') = products.id::text;

create index if not exists order_items_product_uuid_idx
  on public.order_items (product_uuid)
  where product_uuid is not null;

commit;

-- Verificación posterior (sólo lectura esperada):
-- 149 filas vinculadas y 6 filas NULL según la auditoría actual.
select
  count(*) filter (where product_uuid is not null) as vinculados,
  count(*) filter (where product_uuid is null) as historicos_sin_producto_actual
from public.order_items;

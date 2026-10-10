-- Reinicio controlado del catalogo de productos.
-- Conserva Auth, perfiles, admins y cuentas Mercado Pago.
-- Ejecutar solo cuando no haya un checkout o pago en curso.
--
-- ESTADO HISTORICO:
-- El usuario confirmo el 10 de octubre de 2026 que este procedimiento ya se
-- habia ejecutado anteriormente; la fecha exacta de ejecucion no quedo
-- registrada. Ademas del catalogo, el procedimiento elimina ordenes, items,
-- despachos y la auditoria comercial indicada mas abajo. En consecuencia, las
-- operaciones anteriores no pueden reconstruirse de punta a punta desde la
-- base actual y deben contrastarse con evidencia externa de Mercado Pago.

-- Paso 1: registrar el estado anterior antes de borrar.
select
  (select count(*) from public.products) as products,
  (select count(*) from public.cart_items) as cart_items,
  (select count(*) from public.carts) as carts,
  (select count(*) from public.orders) as orders,
  (select count(*) from public.order_items) as order_items,
  (select count(*) from public.sale_dispatches) as sale_dispatches,
  (select count(*) from public.purchase_status_reads) as purchase_status_reads,
  (select count(*) from public.categories) as categories;

-- Paso 2: eliminar solamente la operacion de productos y recrear el catalogo.
begin;

delete from public.purchase_status_reads;
delete from public.sale_dispatches;
delete from public.order_items;
delete from public.orders;
delete from public.cart_items;
delete from public.carts;
delete from public.products;

-- Conserva auditoria de acceso, perfil y administracion; elimina eventos comerciales.
delete from public.audit_logs
where event in (
  'manual_checkout_created',
  'order_payment_status_changed'
);

delete from public.categories;

insert into public.categories (name, slug, icon)
values
  ('Hogar', 'hogar', '/icons/hogar.svg'),
  ('Electrodomésticos', 'electrodomesticos', '/icons/cocina.svg'),
  ('Tecnología', 'tecnologia', '/icons/dispositivo.svg'),
  ('Automóviles y accesorios', 'automoviles-y-accesorios', '/icons/vehiculos.svg'),
  ('Moda', 'moda', '/icons/moda.svg'),
  ('Belleza y cuidado personal', 'belleza-y-cuidado-personal', '/icons/cuidadopersonal.svg'),
  ('Artículos para mascotas', 'articulos-para-mascotas', '/icons/mascotas.svg'),
  ('Deportes', 'deportes', '/icons/deporte.svg'),
  ('Jardín y exteriores', 'jardin-y-exteriores', '/icons/casa.svg'),
  ('Moda y calzado', 'moda-y-calzado', '/icons/moda.svg');

commit;

-- Paso 3: verificar que quedaron exactamente las diez categorias.
select name, slug, icon
from public.categories
order by created_at;

-- Paso 4: abrir Storage > product-images y borrar todos los objetos del bucket.
-- No ejecutar DELETE directo sobre storage.objects: usar el panel de Storage
-- elimina tambien los archivos fisicos y no afecta avatares de usuarios.

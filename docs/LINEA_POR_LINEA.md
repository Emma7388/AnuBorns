# Línea por línea (estado vigente)

Actualizado al 23 de abril de 2026.

## Layouts

- `src/layouts/BaseLayout.astro`: documento HTML base, metadatos globales y slot de contenido.
- `src/layouts/MainLayout.astro`: compone `Header` + `Footer`, carga estilos globales y resuelve `backHref` automáticamente.

## Componentes

- `src/components/Header.astro`: barra superior con estado invitado/autenticado, carrito, avatar y modal de logout.
- `src/components/Footer.astro`: pie global con navegación inferior mobile y CTA volver.
- `src/components/SecondLevel.astro`: bloque reutilizable para ramas de segundo nivel (`comprar`, `vender`, `oferta`).
- `src/components/CategoryGrid.astro`: grilla de categorías para productos/profesionales con links dinámicos.
- `src/components/ProviderCard.astro`: tarjeta de proveedor/profesional con badges, datos y CTAs (`ver perfil`, `ver productos`).

## Datos y utilidades

- `src/data/categories.js`: catálogo fuente de categorías (nombre, slug, ícono).
- `src/data/providers.js`: dataset mock de proveedores/profesionales y productos de demo.
- `src/lib/supabaseClient.js`: cliente Supabase browser con validación de variables públicas.
- `src/lib/supabaseServer.js`: helper server-side para cliente admin (`service_role`) cacheado.
- `src/lib/cart.js`: carrito híbrido (localStorage para anónimo + tablas `carts/cart_items` para usuario logueado), sincronización al login y evento `ab-cart-updated`.

## Scripts de cliente

- `src/scripts/header-auth.js`: controla sesión en header, sincroniza carrito al login, maneja logout con modal y escucha cambios cross-tab.
- `src/scripts/login.js`: login por email/password con timeout, auditoría y redirect seguro por `returnTo`.
- `src/scripts/register.js`: registro, validaciones, subida opcional de avatar y flujo de confirmación por email.
- `src/scripts/auth-callback.js`: intercambio de `code` por sesión en Supabase y redirección segura post-verificación.
- `src/scripts/profile.js`: carga/edita metadata de perfil, sube avatar y procesa avatar pendiente guardado en registro.
- `src/scripts/comprar-productos.js`: binding de botones para agregar productos al carrito desde tarjetas de catálogo.
- `src/scripts/cart.js`: render de carrito, cambio de cantidades, vaciado total y control de acceso a checkout.
- `src/scripts/checkout.js`: resumen final, pre-carga de datos de usuario y persistencia de órdenes locales (`ab_orders_v1`) como fallback UX.
- `src/scripts/confirmation.js`: estado visual de pago en `/compra-confirmada`, lectura de orden y limpieza de carrito.
- `src/scripts/orders.js`: historial de compras (fuente local/remota), render por orden y borrado con modal.
- `src/scripts/product-create.js`: formulario de publicación de producto, categorías dinámicas, optimización/subida de imagen y alta en Supabase.
- `src/scripts/mis-ventas.js`: carga y borrado de productos publicados por el usuario autenticado.
- `src/scripts/audit.js`: cliente liviano para enviar eventos a `/api/audit` con token de sesión.

## API routes

- `src/pages/api/audit.js`: recibe eventos de auditoría autenticados y los inserta en `audit_logs`.
- `src/pages/api/checkout.js`: crea orden + `order_items` en Supabase y genera preferencia de pago en Mercado Pago.
- `src/pages/api/mercadopago-webhook.js`: valida firma (`x-signature`), consulta pago en MP e impacta estado de la orden.

## Páginas

- `src/pages/index.astro`: home con entradas a comprar, vender y ofertar.
- `src/pages/login.astro`: pantalla de acceso con `login.js`.
- `src/pages/registro.astro`: pantalla de alta con `register.js`.
- `src/pages/auth/callback.astro`: confirmación/verificación de cuenta con `auth-callback.js`.
- `src/pages/mis-datos.astro`: perfil del usuario autenticado con edición y avatar (`profile.js`).
- `src/pages/mis-compras.astro`: historial de órdenes y accesos a proveedor público (`orders.js`).
- `src/pages/mis-servicios.astro`: tablero básico de servicios del usuario.
- `src/pages/mis-ventas.astro`: tablero de ventas + grilla de productos publicados (`mis-ventas.js`).
- `src/pages/proveedor-publico/[userId].astro`: vidriera pública de productos por vendedor real (`products` en Supabase).

- `src/pages/comprar.astro`: entrada de segundo nivel para flujo de compra.
- `src/pages/comprar/productos.astro`: grilla de categorías para comprar productos.
- `src/pages/comprar/servicios.astro`: entrada de servicios con CTA a publicar trabajo.
- `src/pages/comprar/productos/[categoria].astro`: catálogo por categoría consumiendo Supabase REST + botón agregar al carrito (`comprar-productos.js`).
- `src/pages/proveedor/[slug]/index.astro`: perfil público de proveedor (dataset mock).
- `src/pages/proveedor/[slug]/productos.astro`: catálogo del proveedor mock con navegación de regreso por `from`.
- `src/pages/profesionales.astro`: entrada de búsqueda profesional por categorías.
- `src/pages/profesionales/categoria/[categoria].astro`: listado de profesionales por categoría (dataset mock).
- `src/pages/profesionales/[slug]/index.astro`: perfil profesional (mock).
- `src/pages/profesionales/[slug]/productos.astro`: catálogo del profesional (mock).
- `src/pages/contratar/[slug].astro`: formulario MVP de contratación desde perfil.

- `src/pages/carrito.astro`: UI del carrito conectado a `src/lib/cart.js`.
- `src/pages/finalizar-compra.astro`: checkout local (resumen + datos de envío) con `checkout.js`.
- `src/pages/compra-confirmada.astro`: estado final de compra/pago con `confirmation.js`.

- `src/pages/vender.astro`: entrada de segundo nivel para vender.
- `src/pages/vender/productos.astro`: publicación de producto con imagen y datos de contacto (`product-create.js`).
- `src/pages/vender/servicios.astro`: alta de perfil profesional MVP.
- `src/pages/cuenta/profesional.astro`: activación de cuenta profesional.

- `src/pages/oferta.astro`: entrada de segundo nivel para ofertar.
- `src/pages/oferta/productos.astro`: placeholder de flujo de oferta de productos.
- `src/pages/oferta/servicios.astro`: placeholder de flujo de oferta de servicios.

- `src/pages/trabajos/publicar.astro`: publicación de trabajo para contratación de servicios.
- `src/pages/publicacion-confirmada.astro`: confirmación de trabajo publicado.

## Estilos

- `src/styles/global.css`: tokens visuales, resets y estilos compartidos (`ab-*`) para paneles, cards, formularios y estados.

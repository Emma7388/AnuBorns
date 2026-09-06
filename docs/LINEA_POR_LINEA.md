# Línea por línea (estado vigente)

Actualizado al 15 de agosto de 2026 para la rama `V0.7`.

> Este inventario describe responsabilidades funcionales. El estado general, las limitaciones y la configuración se mantienen en `README.md`.

> El módulo de servicios fue retirado temporalmente. Consultar [`SERVICIOS_PENDIENTES.md`](SERVICIOS_PENDIENTES.md) antes de volver a implementarlo.

## Layouts

- `src/layouts/BaseLayout.astro`: documento HTML base, metadatos globales y slot de contenido.
- `src/layouts/MainLayout.astro`: compone `Header` + `Footer`, carga estilos globales y resuelve `backHref` automáticamente.

## Componentes

- `src/components/Header.astro`: barra superior con estado invitado/autenticado, carrito, avatar y modal de logout.
- `src/components/Footer.astro`: pie global con navegación inferior mobile y CTA volver.
- `src/components/CategoryGrid.astro`: grilla de categorías de productos con links dinámicos.

## Datos y utilidades

- `src/data/categories.js`: catálogo fuente de categorías (nombre, slug, ícono).
- `src/lib/supabaseClient.js`: cliente Supabase browser con validación de variables públicas.
- `src/lib/supabaseServer.js`: helper server-side para cliente admin (`service_role`) cacheado.
- `src/lib/cart.js`: carrito híbrido (localStorage para anónimo + tablas `carts/cart_items` para usuario logueado), sincronización al login y evento `ab-cart-updated`.
- `src/lib/checkoutServer.js`: valida productos, vendedor, moneda, disponibilidad y entrega con datos del servidor; calcula el total final.
- `src/lib/checkoutPendingOrders.js`: cancela checkouts pendientes abandonados y contempla aprobaciones tardías.
- `src/lib/mercadopagoOAuthState.js`: firma y valida el estado temporal de la conexión OAuth de Mercado Pago.
- `src/lib/saleDispatches.js`: crea y actualiza los despachos iniciales de una venta aprobada.
- `src/lib/fulfillmentStatus.js`: normaliza estados de envío, retiro y entrega.
- `src/lib/soldProducts.js`: excluye productos asociados a ventas aprobadas.

## Scripts de cliente

- `src/scripts/header-auth.js`: controla sesión en header, sincroniza carrito al login, maneja logout con modal y escucha cambios cross-tab.
- `src/scripts/login.js`: login por email/password con timeout, auditoría y redirect seguro por `returnTo`.
- `src/scripts/register.js`: registro, validaciones, subida opcional de avatar y flujo de confirmación por email.
- `src/scripts/auth-callback.js`: intercambio de `code` por sesión en Supabase y redirección segura post-verificación.
- `src/scripts/profile.js`: carga/edita metadata de perfil, sube avatar y procesa avatar pendiente guardado en registro.
- `src/scripts/comprar-productos.js`: binding de botones para agregar productos al carrito desde tarjetas de catálogo.
- `src/scripts/cart.js`: render de carrito, cambio de cantidades, vaciado total y control de acceso a checkout.
- `src/scripts/checkout.js`: resumen final, datos de retiro/envío por vendedor y redirección a Mercado Pago.
- `src/scripts/confirmation.js`: estado visual del pago, sincronización de respaldo con Mercado Pago y limpieza del carrito aprobado.
- `src/scripts/orders.js`: historial de compras (fuente local/remota), render por orden y borrado con modal.
- `src/scripts/product-create.js`: formulario de publicación de producto, categorías dinámicas, optimización/subida de imagen y alta en Supabase.
- `src/scripts/mis-ventas.js`: carga y borrado de productos publicados por el usuario autenticado.
- `src/scripts/mercadopago-connect.js`: consulta, conecta, reconecta y desconecta la cuenta Mercado Pago del vendedor.
- `src/scripts/purchase-status-notifications.js`: notifica cambios de estado relevantes para el comprador.
- `src/scripts/audit.js`: cliente liviano para enviar eventos a `/api/audit` con token de sesión.

## API routes

- `src/pages/api/audit.js`: recibe eventos de auditoría autenticados y los inserta en `audit_logs`.
- `src/pages/api/checkout.js`: valida un checkout de vendedor único, crea orden + `order_items` y genera la preferencia con el token OAuth del vendedor y la comisión de AnuBorns.
- `src/pages/api/checkout-manual.js`: crea una orden manual para escenarios controlados de desarrollo o respaldo.
- `src/pages/api/checkout-pending-cleanup.js`: solicita la limpieza de órdenes pendientes abandonadas.
- `src/pages/api/mercadopago-webhook.js`: valida firma, consulta el pago, verifica monto/moneda, aplica idempotencia e impacta la orden.
- `src/pages/api/mercadopago-payment-sync.js`: sincroniza el pago al volver del checkout si el webhook todavía no impactó.
- `src/pages/api/mercadopago/oauth/connect.js`: genera la URL de autorización OAuth del vendedor.
- `src/pages/api/mercadopago/oauth/callback.js`: alias del callback OAuth corto `/api/mp-oauth`.
- `src/pages/api/mercadopago/oauth/status.js`: consulta la conexión Mercado Pago del vendedor.
- `src/pages/api/mercadopago/oauth/disconnect.js`: elimina la conexión del vendedor autenticado.
- `src/pages/api/sales-dispatch.js`: actualiza preparación, envío y despacho desde el panel de ventas.
- `src/pages/api/purchase-delivery.js`: permite al comprador confirmar la recepción de un envío.
- `src/pages/api/purchase-pickup.js`: permite al comprador confirmar el retiro.
- `src/pages/api/purchase-fulfillment.js`: consulta el resumen de cumplimiento de una compra.

## Páginas

- `src/pages/index.astro`: home con entradas a comprar, vender y ofertar.
- `src/pages/login.astro`: pantalla de acceso con `login.js`.
- `src/pages/registro.astro`: pantalla de alta con `register.js`.
- `src/pages/auth/callback.astro`: confirmación/verificación de cuenta con `auth-callback.js`.
- `src/pages/mis-datos.astro`: perfil del usuario autenticado con edición y avatar (`profile.js`).
- `src/pages/mis-compras.astro`: historial de órdenes y accesos a proveedor público (`orders.js`).
- `src/pages/mis-ventas.astro`: tablero de ventas + grilla de productos publicados (`mis-ventas.js`).
- `src/pages/proveedor-publico/[userId].astro`: vidriera pública de productos por vendedor real (`products` en Supabase).

- `src/pages/comprar.astro`: entrada de segundo nivel para flujo de compra.
- `src/pages/comprar/productos.astro`: grilla de categorías para comprar productos.
- `src/pages/comprar/productos/[categoria].astro`: catálogo por categoría consumiendo Supabase REST + botón agregar al carrito (`comprar-productos.js`).

- `src/pages/carrito.astro`: UI del carrito conectado a `src/lib/cart.js`.
- `src/pages/finalizar-compra.astro`: checkout local (resumen + datos de envío) con `checkout.js`.
- `src/pages/compra-confirmada.astro`: estado final de compra/pago con `confirmation.js`.

- `src/pages/vender.astro`: entrada de segundo nivel para vender.
- `src/pages/vender/productos.astro`: publicación de producto con imagen y datos de contacto (`product-create.js`).

- `src/pages/oferta.astro`: entrada de segundo nivel para ofertar.
- `src/pages/oferta/productos.astro`: placeholder de flujo de oferta de productos.


## Estilos

- `src/styles/global.css`: tokens visuales, resets y estilos compartidos (`ab-*`) para paneles, cards, formularios y estados.

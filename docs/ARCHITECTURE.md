# Guía de arquitectura

Actualizado el 12 de septiembre de 2026.

AnuBorns es una aplicación Astro 6 desplegada en Vercel. Supabase provee autenticación, base de datos y almacenamiento; Mercado Pago procesa cobros de productos por medio de OAuth por vendedor.

## Backend

- Supabase Auth administra registro, sesión y perfiles.
- Supabase Database guarda categorías, productos, carritos, órdenes, ventas y despachos.
- Supabase Storage almacena imágenes de productos y avatares.
- Las rutas de `src/pages/api/` autentican al usuario y usan el cliente admin sólo en el servidor.
- El checkout permite un vendedor por orden y la preferencia se crea con su conexión Mercado Pago.
- El webhook firmado y la sincronización de retorno actualizan el pago de forma idempotente, incluyendo reembolsos y cancelaciones informados por Mercado Pago.

## Capas principales

### Layouts y componentes

- `src/layouts/BaseLayout.astro`: documento HTML y metadatos base.
- `src/layouts/MainLayout.astro`: header, footer, estilos globales y navegación de regreso segura.
- `src/components/Header.astro`: sesión, carrito, avatar y cierre de sesión.
- `src/components/Footer.astro`: pie de página y navegación móvil.
- `src/components/ActionSwitch.astro`: acceso a productos en los flujos de compra y venta.
- `src/components/CategoryGrid.astro`: grilla dinámica de categorías de producto.
- `src/components/DeferredListControls.astro`: controles de carga diferida y fechas; evita búsquedas sin fechas y permite ocultar encabezados repetidos.
- `src/components/ConfirmationModal.astro`: estructura común de confirmación en carrito, checkout y ventas, conservando los identificadores de eventos.
- `ab-transaction-list` en `global.css`: presentación compartida de compras y ventas, independiente de las tarjetas compactas del catálogo.

### Datos y lógica

- `src/data/categories.js`: catálogo canónico de categorías.
- `src/lib/supabaseClient.js`: cliente Supabase de navegador con validación de variables públicas.
- `src/lib/supabaseServer.js`: cliente admin de servidor.
- `src/lib/cart.js`: carrito de usuario y sincronización al iniciar sesión.
- `src/lib/checkoutServer.js`: validación de productos, vendedor, entrega y total antes de cobrar.
- `src/lib/paymentStatus.js`: normaliza estados de Mercado Pago y define qué estados bloquean producto, cuáles son visibles en ventas y cuáles permiten despacho.
- `src/lib/paymentMovement.js`: registra cambios reales de estado de pago en `audit_logs`.
- `src/lib/serverRequest.js`: lectura JSON server-side con límite de bytes y errores controlados.
- `src/lib/saleDispatches.js` y `src/lib/fulfillmentStatus.js`: estados de venta, retiro y entrega.
- `src/lib/purchaseDetail.js`: HTML de detalle de compra compartido por historial y confirmación; escape de contenido, vendedor, referencia y presentación de cancelaciones/reembolsos.
- `src/lib/purchaseDetailStyles.js`: estilo imprimible compartido por detalles de compra y venta.
- El detalle de venta se construye con los datos cargados por la API autenticada de ventas; no abre la publicación pública del producto vendido.

### Verificación

`node --test tests\paymentStatus.test.mjs tests\salePendingAction.test.mjs tests\purchaseDetail.test.mjs tests\serverRequest.test.mjs tests\mercadopagoOAuthState.test.mjs tests\purchaseProvider.test.mjs` valida estados de pago, bloqueo de despacho, detalle de compra, lectura JSON limitada y OAuth state. La integración con MP, el build y la revisión visual requieren verificaciones adicionales; consultar el README y la continuidad de producción.

### Flujos visibles

1. `comprar` muestra categorías y catálogo de productos.
2. El usuario agrega productos al carrito y completa una orden para un único vendedor.
3. Mercado Pago confirma el pago y la orden pasa al historial de compras y ventas; si luego informa reembolso o cancelación, la orden conserva historial pero pausa despacho/entrega según estado.
4. `mis-ventas` permite administrar productos publicados y despachos.
5. El perfil público de vendedor se genera desde productos y perfiles reales de Supabase.

## Navegación

Las pantallas de detalle preservan la ruta de origen mediante el parámetro interno `from`. `MainLayout` valida que sea una ruta local antes de usarla. Las rutas antiguas de funciones retiradas redirigen a una pantalla vigente, sin mostrar contenido ni formularios obsoletos.

## Seguridad

- Las claves con privilegios se mantienen sólo en variables privadas de Vercel y en el servidor.
- Las claves públicas de Supabase se usan únicamente en el navegador con RLS activo.
- Las operaciones sensibles validan sesión y propietario en API antes de modificar datos.
- Las APIs que reciben JSON usan límite de cuerpo y errores controlados para evitar cargas excesivas.
- Las respuestas JSON comunes salen con `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.
- El estado OAuth de Mercado Pago se firma con secreto privado y no tiene fallback fijo de desarrollo.
- Las configuraciones y políticas de Supabase se documentan en los scripts de seguridad bajo `docs/`.
- El detalle operativo de pagos y reembolsos está en `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`.

# Guía de arquitectura

Actualizado el 11 de octubre de 2026.

AnuBorns es una aplicación Astro 6 desplegada en Vercel. Supabase provee autenticación, base de datos y almacenamiento; Mercado Pago procesa cobros de productos por medio de OAuth por vendedor.

## Stack acordado

- HTML, CSS, JavaScript y Astro.
- Sin framework de cliente: no React, Vue, Svelte ni librerías UI salvo decisión explícita del usuario.
- Mantener CSS propio y scripts del navegador en `src/scripts/` siguiendo los patrones existentes.

## Backend

- Supabase Auth administra registro y sesión. Los datos privados de perfil viven en `public.profiles`; sólo nombre y apellido se sincronizan a `user_metadata` para identificación visual en Auth. El teléfono de contacto no se asigna a `auth.users.phone`, porque la aplicación autentica por email.
- Supabase Database guarda categorías, productos, carritos, órdenes, ventas y despachos.
- Supabase Storage almacena imágenes de productos y avatares.
- Las rutas de `src/pages/api/` autentican al usuario y usan el cliente admin sólo en el servidor.
- El checkout permite un vendedor por orden y la preferencia se crea con su conexión Mercado Pago.
- `src/pages/api/my-sales-list.js` usa la RPC `get_seller_sales_page(...)` si existe en Supabase para paginar ventas desde Postgres, con fallback al camino anterior.
- El webhook firmado y la sincronización de retorno actualizan el pago de forma idempotente, incluyendo reembolsos y cancelaciones informados por Mercado Pago.

## Capas principales

### Layouts y componentes

- `src/layouts/BaseLayout.astro`: documento HTML y metadatos base.
- `src/layouts/MainLayout.astro`: header, footer, estilos globales y navegación de regreso segura.
- `src/components/Header.astro`: sesión, carrito, avatar y cierre de sesión.
- `src/components/Footer.astro`: pie de página y navegación móvil.
- `src/components/ActionSwitch.astro`: acceso a productos en los flujos de compra y venta.
- `src/components/CategoryGrid.astro`: grilla dinámica de categorías de producto.
- `src/scripts/theme.js`: selector persistente de temas `light` y `dark`.
- `src/components/DeferredListControls.astro`: controles de carga diferida y fechas; evita búsquedas sin fechas y permite ocultar encabezados repetidos.
- `src/components/ConfirmationModal.astro`: estructura común de confirmación en carrito, checkout y ventas, conservando los identificadores de eventos.
- `ab-transaction-list` en `global.css`: presentación compartida de compras y ventas, independiente de las tarjetas compactas del catálogo.
- Las cards de producto comparten `ab-provider-product-card__image`; en mobile se mantiene un alto uniforme de 190px con `object-fit: contain`. `featured-products.css` usa la misma medida y oculta las flechas del carrusel en pantallas chicas.

### Datos y lógica

- `src/data/categories.js`: catálogo canónico de categorías.
- `docs/supabase-product-catalog-reset.sql`: reinicio manual de datos comerciales y carga del catálogo vigente. El usuario confirmó el 10 de octubre de 2026 que este procedimiento ya se había ejecutado, aunque no quedó registrada la fecha exacta de ejecución. Elimina productos, carritos, órdenes, ítems, despachos, lecturas de estado y auditoría comercial; preserva Auth, perfiles, administradores y conexiones OAuth de Mercado Pago. Por eso la base actual no conserva trazabilidad local de pagos anteriores al reinicio.
- `src/lib/supabaseClient.js`: cliente Supabase de navegador con validación de variables públicas.
- `src/lib/supabaseServer.js`: cliente admin de servidor.
- `src/lib/cart.js`: carrito de usuario y sincronización al iniciar sesión; deduplica altas, conserva una fila por producto, suma cantidades reales y limita cada cantidad al stock. La migración nueva consolida además un único carrito por usuario.
- `src/pages/api/products.js` y `src/pages/api/products/[id].js`: altas, edición y borrado de publicaciones con autenticación, autorización por propietario y validación server-side.
- `src/lib/mercadopagoIdentity.js`: compara nombre/apellido, email y DNI normalizados contra `/users/me`; mantiene la excepción explícita para MP User ID `1157622469`.
- `src/lib/publicationPayments.js`, `src/lib/publicationTiming.js`, `/api/publication-checkout` y `/api/publication-payment-sync`: cobro directo a plataforma, contador, renovación sólo en los últimos 7 días, idempotencia y extensión por 30 días después del vencimiento vigente.
- `docs/supabase-product-stock-publications.sql`: stock 1–100, reservas atómicas por cantidad, reposición, contratos de publicación, snapshots de vendedor, RLS y carrito único.
- `src/lib/userProfile.js`: perfil privado del usuario con caché corta e invalidación al editar para evitar lecturas repetidas de `profiles` en navegación Astro.
- `src/lib/sessionToken.js`: validación liviana de tokens de sesión antes de lanzar consultas privadas de fondo.
- `src/lib/checkoutServer.js`: validación de productos, vendedor, entrega y total antes de cobrar.
- `src/lib/atomicOrders.js`: invoca la RPC transaccional que vuelve a validar snapshots del servidor y crea la orden con sus ítems bajo una reserva única por producto.
- `src/lib/marketplaceFee.js`: calcula la comisión sobre la base recibida; checkout le pasa únicamente el subtotal de publicaciones permanentes. Prioriza importe fijo cuando es positivo y, en caso contrario, aplica el porcentaje con redondeo al peso entero.
- `src/lib/productLocation.js`: normaliza Campana, Zárate, Lima y la cobertura conjunta de las tres ciudades.
- `src/lib/shippingPreference.js`: interpreta retiro o envío como modalidades excluyentes. El retiro es el valor seguro por defecto y una publicación con envío requiere esa modalidad.
- `src/lib/sellerShipping.js`: conserva la lectura correcta de envíos nuevos con costo cero y de importes históricos ya registrados.
- `src/lib/paymentStatus.js`: normaliza estados de Mercado Pago y define qué estados bloquean producto, cuáles son visibles en ventas y cuáles permiten despacho.
- `src/lib/paymentMovement.js`: registra cambios reales de estado de pago en `audit_logs`.
- `src/lib/serverRequest.js`: lectura JSON server-side con límite de bytes y errores controlados.
- `src/lib/saleDispatches.js` y `src/lib/fulfillmentStatus.js`: estados de venta, retiro y entrega.
- `src/lib/purchaseDetail.js`: HTML de detalle de compra compartido por historial y confirmación; escape de contenido, vendedor, referencia y presentación de cancelaciones/reembolsos.
- `src/lib/purchaseDetailStyles.js`: estilo imprimible compartido por detalles de compra y venta.
- El detalle de venta se construye con los datos cargados por la API autenticada de ventas; no abre la publicación pública del producto vendido.
- `src/pages/api/purchase-fulfillment.js` acepta lectura por `POST` con `orderIds` en JSON para evitar URLs largas; el `GET` queda como compatibilidad liviana.
- `docs/supabase-performance-indexes.sql` y `docs/supabase-seller-sales-rpc.sql` documentan la primera tanda de optimización de consultas Supabase.

### Verificación

`node --test .\tests\*.test.mjs` valida la suite completa; la última ejecución observada el 11 de octubre de 2026 aprobó 101 pruebas sin fallos. La migración y los permisos remotos fueron auditados ese día; el pago mensual, la integración de reembolso con MP, el build y la revisión visual requieren verificaciones adicionales.

### Flujos visibles

1. `comprar` muestra categorías y catálogo de productos.
2. El usuario puede conservar productos de varios vendedores en el carrito, pero completa un checkout independiente por vendedor. Las modalidades incompatibles se separan antes de pagar.
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
- El rate limit actual es en memoria y sólo mitiga ráfagas por instancia; su reemplazo distribuido sigue pendiente para una garantía global en Vercel.
- Las configuraciones y políticas de Supabase se documentan en los scripts de seguridad bajo `docs/`.
- El detalle operativo de pagos y reembolsos está en `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`.

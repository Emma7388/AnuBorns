# Guía de arquitectura

Actualizado el 19 de octubre de 2026.

AnuBorns es una aplicación Astro 6 desplegada en Vercel. Supabase provee autenticación, base de datos y almacenamiento; Mercado Pago procesa cobros de productos por medio de OAuth por vendedor.

## Estado de evolución

La etapa 1 de implementación funcional se cerró en código el 11 de octubre de 2026 con el commit `e7b9f66`. El proyecto se encuentra actualmente en la etapa 2: base de datos, panel administrativo, seguridad operativa y validación de producción. La subetapa 2A está desplegada y su migración fue aplicada y auditada; la subetapa 2B fue validada visualmente en producción el 15 de octubre. La primera entrega de 2C también fue desplegada y contrastada ese día: su vista global read-only revisó cuatro órdenes y quedó en cero registros a revisar después de retirar un falso positivo de stock agotado. La Etapa 2D fue desplegada y su primer contraste confirmó dos vendedores conectados, la excepción `1157622469`, una identidad coincidente, tokens vigentes y ausencia de intentos locales pendientes. La Etapa 2E fue desplegada y validada el 15 de octubre: el rechazo visual ocultó controles y datos administrativos, conservó el 403 y el evento deduplicado de mejor esfuerzo quedó visible en Trazabilidad. El hotfix de la RPC atómica fue aplicado y auditado el 12 de octubre y una compra posterior quedó aprobada, persistida y sin alertas locales. La etapa 3 de madurez comercial permanece aplazada hasta estabilizar producción.

El 16 de octubre se realizó una estabilización local transversal sin despliegue: se centralizaron formato de datos y acceso tolerante a storage, se consolidaron reglas CSS administrativas, se reforzó la navegación del panel contra módulos ligados a DOM obsoleto y se añadieron defensas HTTP globales. La suite completa aprobó 146 pruebas y el build Astro/Vercel finalizó correctamente.

La siguiente mejora reemplazó el rate limit por una RPC atómica compartida entre instancias. El backend persiste sólo claves HMAC/SHA-256, reintenta después de una indisponibilidad y usa memoria únicamente como modo degradado. La migración incremental v2 corrigió una colisión entre una variable PL/pgSQL y `CURRENT_TIME`, reafirmó permisos server-only y agregó una prueba funcional. El 17 de octubre el panel de producción confirmó la fuente distribuida con 34 chequeos correctos, sin advertencias ni errores.

## Stack acordado

- HTML, CSS, JavaScript y Astro.
- Sin framework de cliente: no React, Vue, Svelte ni librerías UI salvo decisión explícita del usuario.
- Mantener CSS propio y scripts del navegador en `src/scripts/` siguiendo los patrones existentes.

## Backend

- Supabase Auth administra registro y sesión. Los datos privados de perfil viven en `public.profiles`; sólo nombre y apellido se sincronizan a `user_metadata` para identificación visual en Auth. El teléfono de contacto no se asigna a `auth.users.phone`, porque la aplicación autentica por email.
- Supabase Database guarda categorías, productos, carritos, órdenes, ventas y despachos.
- Supabase Storage almacena imágenes de productos y avatares. El circuito de productos acepta JPG/JPEG, PNG y WebP, normaliza la extensión desde el MIME y limita cada archivo a 20 MB. `docs/supabase-product-images-storage-hardening.sql` lleva esas mismas reglas al bucket y restringe las escrituras a `<auth.uid>/<product-id>/<file>`; fue aplicado y auditado remotamente el 19 de octubre de 2026. Los cinco objetos existentes respetaban extensión y profundidad de ruta. Los avatares se revisarán por separado.
- Las rutas de `src/pages/api/` autentican al usuario y usan el cliente admin sólo en el servidor.
- `src/lib/serverRateLimit.js` protege las APIs mediante `consume_api_rate_limit(...)`, una RPC atómica de Supabase. La tabla no guarda identificadores en claro y sólo `service_role` puede leerla o consumir la función. Un fallback local de 30 segundos mantiene disponibilidad durante una caída, pero el panel administrativo lo expone como estado degradado.
- `src/lib/serverAuth.js` consulta `public.admin_user_controls` después de validar el Bearer token y rechaza cuentas suspendidas antes de ejecutar la operación solicitada. La ausencia temporal de la tabla se tolera sólo para permitir el despliegue gradual; los botones administrativos permanecen bloqueados hasta aplicar la migración.
- `src/lib/adminAuth.js`, `src/lib/adminAccess.js` y `src/lib/adminAudit.js` separan autenticación, reglas de rol/suspensión y escritura auditada. Los permisos pueden venir de `admin_users` o Vercel, pero sólo los roles persistidos en base son removibles desde el panel. Un usuario autenticado sin rol conserva la respuesta 403; cada instancia intenta generar como máximo un evento `admin_permission_denied` por ruta cada cinco minutos, y un fallo de auditoría nunca habilita el acceso. `src/lib/adminPageAccess.js` unifica la respuesta visual de las cinco vistas administrativas y retira sus controles y datos vacíos cuando la sesión no existe o el rol es insuficiente.
- `security.csp` en `astro.config.mjs` hace que el render SSR entregue una política por encabezado HTTP. Astro calcula hashes SHA-256 para scripts y estilos legítimos; la política limita recursos remotos a Google Fonts y Supabase, bloquea objetos, frames y ancestros embebidos, y no concede `unsafe-inline` a JavaScript. `src/middleware.js` agrega únicamente `style-src-attr 'unsafe-inline'`, separación necesaria para los estados visuales calculados en runtime mientras `style-src` permanece basado en hashes. El `ClientRouter` incompatible fue retirado y la navegación usa cargas normales con transición nativa opcional.
- El checkout permite un vendedor por orden y la preferencia se crea con su conexión Mercado Pago.
- La preferencia recibe una vigencia explícita igual al TTL local de la reserva. La migración `supabase-abandoned-checkouts-cron.sql`, aplicada y auditada el 12 de octubre, programa una cancelación horaria de órdenes vencidas sin `payment_id`; el cambio de estado libera stock mediante los triggers existentes y conserva el historial.
- `src/pages/api/my-sales-list.js` usa la RPC `get_seller_sales_page(...)` si existe en Supabase para paginar ventas desde Postgres, con fallback al camino anterior.
- El webhook firmado y la sincronización de retorno actualizan el pago de forma idempotente, incluyendo reembolsos y cancelaciones informados por Mercado Pago.

## Capas principales

### Layouts y componentes

- `src/layouts/BaseLayout.astro`: documento HTML y metadatos base.
- `src/layouts/MainLayout.astro`: header, footer, estilos globales y navegación de regreso segura.
- `src/components/Header.astro`: sesión, carrito, avatar y cierre de sesión.
- `src/components/AdminNavigation.astro`: navegación única de las cinco superficies administrativas; lateral y fija en escritorio, horizontal en tablet y compacta en móvil. Marca la sección actual, fuerza recarga segura y desaparece ante acceso restringido.
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
- `docs/supabase-admin-control.sql`: tabla server-only de suspensiones, endurecimiento de permisos de `admin_users`, trigger de actualización, RPC serializadas para coordinar roles/suspensiones y no eliminar concurrentemente al último admin, más la auditoría final de la Etapa 2A.
- `docs/supabase-profiles-search-path-hardening.sql`: endurecimiento idempotente de `set_profiles_updated_at()` con `search_path` vacío. Fue aplicado y auditado remotamente el 15 de octubre de 2026 sin modificar perfiles.
- `docs/supabase-checkout-ordinality-hotfix.sql`: reemplazo idempotente de `create_checkout_order_atomic(...)` que corrige la combinación de `jsonb_to_recordset` y `WITH ORDINALITY`, restaura permisos server-only y devuelve una auditoría sin escribir datos comerciales.
- `docs/supabase-abandoned-checkouts-cron.sql`: función server-only y tarea `pg_cron` horaria para regularizar checkouts vencidos sin borrar órdenes; aplicada y auditada con `jobid=1`, cero vencidas restantes y permisos exclusivos de `service_role`.
- `docs/supabase-distributed-rate-limit.sql`: tabla RLS, RPC atómica server-only y limpieza diaria de claves opacas del rate limit. Fue ejecutada y auditada remotamente el 16 de octubre de 2026.
- `docs/supabase-distributed-rate-limit-v2.sql`: migración incremental correctiva de la RPC, con nombres `p_`/`v_`, permisos reafirmados, prueba funcional como `service_role` y limpieza del bucket de prueba. Aplicada y validada en producción el 17 de octubre de 2026.
- `src/lib/adminUserOverview.js` y `/api/admin/users/[userId]/overview`: agregación read-only de publicaciones, pagos mensuales, compras, ventas, cumplimiento, actividad e identidad Mercado Pago para la Etapa 2B. La API se consulta sólo al seleccionar o actualizar una ficha y nunca devuelve tokens OAuth.
- `src/lib/adminOperations.js`, `/api/admin/operations` y `/admin/operaciones`: clasificación global read-only de órdenes, pagos incompletos, movimientos auditados, entregas demoradas y publicaciones inconsistentes para la Etapa 2C.
- `src/lib/adminMercadoPago.js`, `/api/admin/mercadopago` y `/admin/mercadopago`: control central read-only de vendedores, OAuth, identidad e intentos pendientes para la Etapa 2D. La carga inicial no consulta Mercado Pago; la verificación en vivo requiere una acción manual y nunca devuelve tokens.
- `src/lib/userProfile.js`: perfil privado del usuario con caché corta e invalidación al editar para evitar lecturas repetidas de `profiles` en navegación Astro.
- `src/lib/browserStorage.js`: acceso compartido y tolerante a `localStorage`/`sessionStorage`, con fallbacks para SSR, modo privado, cuotas agotadas y JSON inválido.
- `src/lib/displayFormat.js`: escape HTML, referencias cortas y formateadores `Intl` cacheados para evitar implementaciones duplicadas en el panel.
- `src/lib/sessionToken.js`: validación liviana de tokens de sesión antes de lanzar consultas privadas de fondo.
- `src/lib/checkoutServer.js`: validación de productos, vendedor, entrega y total antes de cobrar.
- `src/lib/checkoutPendingOrders.js`: TTL compartido, vencimiento explícito de la preferencia y limpieza por actividad como respaldo del cron.
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

`node --test` valida la suite completa; la última ejecución observada el 19 de octubre de 2026 aprobó 161 pruebas sin fallos y el build Astro/Vercel finalizó correctamente. El artefacto SSR fue invocado directamente y confirmó una CSP en el encabezado HTTP con hashes de scripts y estilos, sin `unsafe-inline` en `script-src` ni `style-src`. Las regresiones cubren además los formateadores compartidos, storage seguro, restricciones de imágenes, encabezados, navegación administrativa centralizada, recarga segura y rate limit distribuido/fallback. Las migraciones administrativa 2A y del limitador quedaron auditadas con RLS activo y RPC exclusivas de `service_role`; el panel confirmó además 34 de 34 chequeos correctos en producción. La compra posterior al hotfix cerró su validación de ejecución; el reembolso con Mercado Pago continúa pendiente.

### Flujos visibles

1. `comprar` muestra categorías y catálogo de productos.
2. El usuario puede conservar productos de varios vendedores en el carrito, pero completa un checkout independiente por vendedor. Las modalidades incompatibles se separan antes de pagar.
3. Mercado Pago confirma el pago y la orden pasa al historial de compras y ventas; si luego informa reembolso o cancelación, la orden conserva historial pero pausa despacho/entrega según estado.
4. `mis-ventas` permite administrar productos publicados y despachos.
5. El perfil público de vendedor se genera desde productos y perfiles reales de Supabase.

## Navegación

Las pantallas de detalle preservan la ruta de origen mediante el parámetro interno `from`. `MainLayout` valida que sea una ruta local antes de usarla. Las rutas antiguas de funciones retiradas redirigen a una pantalla vigente, sin mostrar contenido ni formularios obsoletos.

Las entradas y enlaces internos de `/admin` usan recarga completa de forma deliberada. Así cada superficie vuelve a enlazar sus referencias DOM y revalida sesión, suspensión y rol en el servidor, evitando conservar controles o datos de una visita administrativa anterior. La navegación pública mantiene las transiciones de Astro.

## Seguridad

- Las claves con privilegios se mantienen sólo en variables privadas de Vercel y en el servidor.
- Las claves públicas de Supabase se usan únicamente en el navegador con RLS activo.
- Las operaciones sensibles validan sesión y propietario en API antes de modificar datos.
- Las APIs que reciben JSON usan límite de cuerpo y errores controlados para evitar cargas excesivas.
- Las respuestas JSON comunes salen con `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.
- `vercel.json` aplica además `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` que deshabilita cámara, micrófono y geolocalización.
- El estado OAuth de Mercado Pago se firma con secreto privado y no tiene fallback fijo de desarrollo.
- El reemplazo distribuido del rate limit está activo en producción. El panel confirmó la fuente distribuida; `memory-fallback` queda reservado como modo degradado observable ante una indisponibilidad de Supabase.
- Las configuraciones y políticas de Supabase se documentan en los scripts de seguridad bajo `docs/`.
- El detalle operativo de pagos y reembolsos está en `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`.

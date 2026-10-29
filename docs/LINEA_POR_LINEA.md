# Línea por línea (estado vigente)

Actualizado al 29 de octubre de 2026 para la rama `V0.8`.

> Este inventario describe responsabilidades funcionales. El estado general, las limitaciones y la configuración se mantienen en `README.md`.

> El módulo de servicios fue retirado temporalmente. Consultar [`SERVICIOS_PENDIENTES.md`](SERVICIOS_PENDIENTES.md) antes de volver a implementarlo.

> Continuidad del diagnóstico de Mercado Pago, variables de Vercel y auditorías de producción (9 de septiembre de 2026): [`CONTINUIDAD_MP_Y_PRODUCCION.md`](CONTINUIDAD_MP_Y_PRODUCCION.md).

> Estados de pago, reembolsos, auditoría y defensas de API: [`PAGOS_REEMBOLSOS_SEGURIDAD.md`](PAGOS_REEMBOLSOS_SEGURIDAD.md).

> Reinicio manual y lectura de métricas Supabase: [`SUPABASE_REINICIO_CONTROLADO.md`](SUPABASE_REINICIO_CONTROLADO.md).

## Layouts

- `astro.config.mjs`: configuración SSR/Vercel y Content Security Policy nativa de Astro 7, con hashes SHA-256, recursos separados por elemento/atributo, orígenes explícitos y bloqueo de objetos/frames.
- `src/layouts/BaseLayout.astro`: documento HTML base, metadatos globales y slot de contenido; usa navegación convencional compatible con CSP en lugar de `ClientRouter`.
- `src/layouts/MainLayout.astro`: compone `Header` + `Footer`, carga estilos globales y resuelve `backHref` automáticamente.

## Componentes

- `src/components/DeferredListControls.astro`: filtros compartidos de compras, ventas y publicaciones; habilitación de Buscar por fecha y mensaje inicial opcional.
- `src/components/ConfirmationModal.astro`: contenedor compartido de confirmaciones de carrito, checkout y eliminación de publicaciones.

- `src/components/Header.astro`: barra superior con estado invitado/autenticado, carrito, avatar y modal de logout.
- `src/components/Footer.astro`: pie global con navegación inferior mobile y CTA volver.
- `src/components/AdminNavigation.astro`: stack compartido de navegación administrativa; elimina botoneras repetidas, identifica la sección actual y cambia de lateral a horizontal/compacto según viewport.
- `src/components/CategoryGrid.astro`: grilla de categorías de productos con links dinámicos.

## Datos y utilidades

- `src/lib/purchaseDetail.js`: generación única del detalle imprimible de compra; formato de pago compartido con el historial.
- `src/lib/purchaseDetailStyles.js`: presentación del detalle de compra y venta, responsive e imprimible.
- `tests/purchaseDetail.test.mjs`: regresiones del documento compartido; ejecutar con `node --test tests/purchaseDetail.test.mjs`.

- `src/data/categories.js`: catálogo fuente de las diez categorías vigentes (nombre, slug, ícono).
- `src/lib/supabaseClient.js`: cliente Supabase browser con validación de variables públicas.
- `src/components/TurnstileWidget.astro` y `src/lib/turnstile.js`: desafío anti-bot y entrega del `captchaToken` a Supabase Auth para registro, login y recuperación.
- `src/lib/supabaseServer.js`: helper server-side para cliente admin (`service_role`) cacheado.
- `src/lib/supabaseMetrics.js`: lectura server-side de Supabase Metrics API, resumen read-only y tarjetas de uso del plan para el panel admin.
- `src/lib/vercelAnalytics.js`: lectura server-side de Vercel Web Analytics para visitas, page views y rankings del panel admin.
- `src/lib/adminAuth.js`: valida administradores persistidos en `admin_users` o configurados por Vercel; registra de mejor esfuerzo y con deduplicación temporal los accesos rechazados de usuarios autenticados sin rol.
- `src/lib/adminAccess.js`: normaliza y valida cambios de rol, suspensión y restauración; protege la propia cuenta, administradores de Vercel y el último admin persistido.
- `src/lib/adminAudit.js`: escritura server-side común de solicitudes y resultados administrativos en `audit_logs`.
- `src/lib/adminUserOverview.js`: reglas puras para visibilidad, diagnóstico OAuth/identidad, contadores y cronología de la ficha 360 administrativa.
- `tests/adminUserOverview.test.mjs`: regresiones de visibilidad, excepción de identidad, resumen de actividad y orden cronológico de la Etapa 2B.
- `src/lib/adminOperations.js`: clasificación global read-only de órdenes, pagos incompletos, entregas demoradas y publicaciones inconsistentes para la Etapa 2C.
- `tests/adminOperations.test.mjs`: regresiones de estados globales, pagos incompletos, seguimiento faltante y publicaciones inconsistentes.
- `src/lib/adminMercadoPago.js`: clasificación read-only de conexión OAuth, identidad e intentos pendientes locales/externos para la Etapa 2D.
- `tests/adminMercadoPago.test.mjs`: regresiones de token renovable, reconexión, preferencia sin pago, pago pendiente real, identidad, excepción y caída externa.
- `src/lib/serverAuth.js`: autenticación Bearer compartida y bloqueo inmediato de rutas de aplicación para cuentas suspendidas.
- `src/lib/cart.js`: carrito híbrido, sincronización al login, deduplicación, cantidades 1–100 limitadas por stock, conteo por unidades y un único registro por producto.
- `src/lib/productInput.js`: normalización server-side de producto, stock, ubicación, entrega y contrato.
- `src/lib/mercadopagoIdentity.js`: verificación de identidad vendedor/perfil con excepción controlada.
- `src/lib/mercadopagoTokenCrypto.js`: cifrado AES-256-GCM, descifrado server-side y detección de tokens OAuth legados.
- `src/lib/publicationPayments.js`: ciclo idempotente del pago mensual y activación/vencimiento.
- `src/lib/sessionToken.js`: helper de cliente para no consultar endpoints privados con sesiones sin token o próximas a vencer.
- `src/lib/userProfile.js`: perfil privado del usuario, perfil pendiente de registro y caché corta de lecturas a `profiles`.
- `src/lib/browserStorage.js`: lectura, escritura y JSON seguros para storage local o de sesión; tolera SSR, acceso bloqueado y cuota agotada.
- `src/lib/displayFormat.js`: texto limpio, escape HTML, fecha, moneda y referencias breves compartidos por las vistas administrativas.
- `tests/browserStorage.test.mjs` y `tests/displayFormat.test.mjs`: regresiones de las utilidades transversales incorporadas en la estabilización.
- `src/lib/checkoutServer.js`: valida productos, vendedor, moneda, disponibilidad y entrega con datos del servidor; calcula el total final.
- `src/lib/atomicOrders.js`: crea órdenes mediante la RPC de reserva atómica y traduce conflictos de PostgreSQL a respuestas controladas.
- `src/lib/checkoutPendingOrders.js`: define el TTL común, genera la vigencia explícita de la preferencia y cancela por actividad checkouts abandonados; el webhook conserva la recuperación controlada de aprobaciones tardías.
- `src/lib/marketplaceFee.js`: calcula importe fijo o porcentaje sobre la base comisionable que checkout limita a publicaciones permanentes, con redondeo al peso entero.
- `src/lib/productLocation.js`: normaliza la ciudad de publicación y la opción conjunta Campana, Zárate y Lima.
- `src/lib/shippingPreference.js`: persiste la preferencia de entrega por vendedor y resuelve retiro/envío como modalidades excluyentes.
- `src/lib/sellerShipping.js`: distingue envíos nuevos con costo cero de órdenes históricas con costo registrado.
- `src/lib/mercadopagoOAuthState.js`: firma y valida el estado temporal de la conexión OAuth de Mercado Pago.
- `src/lib/paymentStatus.js`: normaliza estados de Mercado Pago y define bloqueo de producto, visibilidad de ventas y permiso de despacho.
- `src/lib/paymentMovement.js`: registra en `audit_logs` los cambios reales de estado de pago.
- `src/lib/serverRequest.js`: lee JSON en APIs con límite de bytes y errores controlados.
- `src/lib/saleDispatches.js`: crea y actualiza los despachos iniciales de una venta aprobada.
- `src/lib/fulfillmentStatus.js`: normaliza estados de envío, retiro y entrega.
- `src/lib/soldProducts.js`: excluye publicaciones sin stock, inactivas o mensuales vencidas.

## Scripts de cliente

- `src/scripts/header-auth.js`: controla sesión en header, sincroniza carrito al login, maneja logout con modal, escucha cambios cross-tab y coalesce eventos Astro/Auth para evitar requests repetidos.
- `src/scripts/theme.js`: persiste y alterna los temas `light` y `dark`.
- `src/scripts/login.js`: login por email/password con timeout, auditoría y redirect seguro por `returnTo`.
- `src/scripts/register.js`: registro, validaciones, subida opcional de avatar y flujo de confirmación por email.
- `src/scripts/auth-callback.js`: intercambio de `code` por sesión en Supabase y redirección segura post-verificación.
- `src/scripts/profile.js`: carga/edita metadata de perfil, sube avatar y procesa avatar pendiente guardado en registro.
- `src/scripts/comprar-productos.js`: binding de botones para agregar productos al carrito desde tarjetas de catálogo.
- `src/scripts/cart.js`: render deduplicado por vendedor, cantidades, subtotal por unidades, vaciado, entrega y checkout independiente por vendedor.
- `src/scripts/publication-confirmation.js`: sincroniza el pago de publicación mensual al regresar de Mercado Pago.
- `src/scripts/checkout.js`: resumen final, datos de retiro/envío por vendedor sin sumar costo logístico al comprador y redirección a Mercado Pago.
- `src/scripts/confirmation.js`: estado visual del pago, sincronización de respaldo con Mercado Pago, estados de reembolso y limpieza del carrito aprobado.
- `src/scripts/orders.js`: historial de compras, render por orden, estados de pago/reembolso, acciones de entrega sólo cuando corresponden y borrado con modal.
- `src/scripts/product-create.js`: formulario de publicación, categorías dinámicas, ubicación única o cobertura de tres ciudades, retiro predeterminado/envío excluyente, validación JPG/JPEG/PNG/WebP, optimización de imagen, extensión normalizada y alta en Supabase.
- `src/scripts/mis-ventas.js`: carga ventas y publicaciones del usuario autenticado; distingue el tipo y estado del contrato de publicación, muestra estados de pago/reembolso y habilita despacho sólo para pagos aprobados.
- `src/scripts/mercadopago-connect.js`: consulta, conecta, reconecta y desconecta la cuenta Mercado Pago del vendedor.
- `src/scripts/purchase-status-notifications.js`: notifica cambios de estado relevantes para el comprador, usando lectura por POST y antirráfaga para navegación/realtime.
- `src/scripts/audit.js`: cliente liviano para enviar eventos a `/api/audit` con token de sesión.
- `src/scripts/admin-users.js`: búsqueda, perfil, roles, suspensión/restauración, restablecimiento auditado, administradores activos, eventos recientes y ficha 360 bajo demanda con caché por usuario.
- `src/scripts/admin-operations.js`: carga manual, filtros y render seguro del control global de operaciones 2C.
- `src/scripts/admin-mercadopago.js`: carga local, verificación externa manual, filtros y render seguro del control central de Mercado Pago 2D.

## API routes

- `src/pages/api/audit.js`: recibe eventos de auditoría autenticados y los inserta en `audit_logs`.
- `src/pages/api/checkout.js`: valida un checkout de vendedor único, crea orden + `order_items` y genera una preferencia con token OAuth, comisión de AnuBorns y vencimiento alineado al TTL local.
- `src/pages/api/checkout-manual.js`: crea una orden manual para escenarios controlados de desarrollo o respaldo.
- `src/pages/api/checkout-pending-cleanup.js`: solicita la limpieza de órdenes pendientes abandonadas.
- `src/pages/api/products.js` y `src/pages/api/products/[id].js`: CRUD seguro de publicaciones propias.
- `src/pages/api/publication-checkout.js`: preferencia ARS 2.000 con el token de plataforma.
- `src/pages/api/publication-payment-sync.js`: consulta y aplica el estado de la publicación mensual.
- `src/pages/api/mercadopago/pending-payments.js`: pendientes reales por vendedor, separados de preferencias sin intento.
- `src/pages/api/mercadopago-webhook.js`: valida firma, consulta el pago, verifica monto/moneda, aplica idempotencia, registra movimientos e impacta la orden.
- `src/pages/api/mercadopago-payment-sync.js`: sincroniza el pago al volver del checkout si el webhook todavía no impactó; también detecta reembolsos posteriores.
- `src/pages/api/mercadopago/oauth/connect.js`: genera la URL de autorización OAuth del vendedor.
- `src/pages/api/mercadopago/oauth/callback.js`: alias del callback OAuth corto `/api/mp-oauth`.
- `src/pages/api/mercadopago/oauth/status.js`: consulta la conexión Mercado Pago del vendedor.
- `src/pages/api/mercadopago/oauth/disconnect.js`: elimina la conexión del vendedor autenticado.
- `src/pages/api/sales-dispatch.js`: actualiza preparación, envío y despacho desde el panel de ventas.
- `src/pages/api/purchase-delivery.js`: permite al comprador confirmar la recepción de un envío.
- `src/pages/api/purchase-pickup.js`: permite al comprador confirmar el retiro.
- `src/pages/api/purchase-fulfillment.js`: consulta estados de cumplimiento por compra y marca lecturas; la lectura masiva usa POST con `orderIds` en JSON para evitar URLs largas.
- `src/pages/api/admin/health.js`: estado operativo admin, tablas requeridas y variables sin disparar la lectura pesada de Metrics API.
- `src/pages/api/admin/supabase-metrics.js`: endpoint admin de consulta manual para mediciones Supabase y uso del plan.
- `src/pages/api/admin/vercel-analytics.js`: endpoint admin de consulta manual para Vercel Web Analytics.
- `src/pages/api/admin/users.js`: directorio administrativo con perfil, Mercado Pago, rol, suspensión, administradores activos y auditoría reciente sanitizada.
- `src/pages/api/admin/users/access.js`: acciones auditadas para otorgar/quitar roles y suspender/restaurar cuentas sin borrarlas.
- `src/pages/api/admin/users/profile.js`: edición profunda de perfil y metadata Auth con motivo y auditoría de solicitud/resultado.
- `src/pages/api/admin/users/password-reset.js`: recuperación de contraseña con motivo obligatorio y auditoría antes/después del envío.
- `src/pages/api/admin/users/[userId]/overview.js`: lectura admin de actividad comercial e identidad Mercado Pago de un usuario; limita resultados, oculta tokens y no ejecuta mutaciones.
- `src/pages/api/admin/operations.js`: cruza órdenes, despachos, publicaciones y movimientos auditados desde el servidor; no devuelve datos logísticos personales ni ejecuta mutaciones.
- `src/pages/api/admin/mercadopago.js`: reúne vendedores, OAuth e intentos pendientes; sólo consulta Mercado Pago cuando el administrador pulsa el botón explícito y nunca devuelve tokens.
- `src/pages/api/admin/mercadopago-token-encryption.js`: migración administrativa idempotente de tokens OAuth legados, con rate limit y auditoría.

## SQL operativo nuevo

- `docs/supabase-abandoned-checkouts-cron.sql`: instala una función sin permisos de navegador, agenda su ejecución horaria con `pg_cron`, cancela de inmediato intentos vencidos y devuelve auditoría. Fue aplicado y auditado remotamente el 12 de octubre.
- `docs/supabase-abandoned-checkouts.sql`: respaldo manual con el mismo plazo de 24 horas; no reemplaza el cron.
- `tests/checkoutPendingOrders.test.mjs`: comprueba que el vencimiento de Mercado Pago y el TTL local permanezcan alineados.
- `docs/supabase-distributed-rate-limit.sql`: crea el contador atómico compartido, restringe tabla y funciones a `service_role`, agenda limpieza diaria y devuelve auditoría. Fue ejecutado y auditado remotamente el 16 de octubre de 2026.
- `src/lib/serverRateLimit.js`: genera claves HMAC/SHA-256 opacas, consume la RPC compartida y mantiene un fallback local acotado durante indisponibilidad.
- `tests/serverRateLimit.test.mjs` y `tests/distributedRateLimitSql.test.mjs`: cubren privacidad de la clave, consumo/bloqueo distribuido, degradación local, permisos SQL y uso asíncrono en todos los endpoints.

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
- `src/pages/admin/index.astro`: tablero operativo interno con chequeos por proceso, mediciones read-only de Supabase y analitica manual de Vercel.
- `src/pages/admin/administracion.astro`: resumen read-only del fee registrado localmente y operaciones recientes.
- `src/pages/admin/usuarios.astro`: control administrativo de usuarios, roles, estado de cuenta y ficha 360 de la Etapa 2B; Mercado Pago, Accesos y Trazabilidad comparten una franja compacta de tres tarjetas con altura uniforme, modal de detalle y adaptación mobile.
- `src/pages/admin/operaciones.astro`: control global read-only de la Etapa 2C con resumen, filtros y registros adaptables a mobile.
- `src/pages/admin/mercadopago.astro`: control central read-only de la Etapa 2D con resumen, filtros y verificación externa manual.

## SQL administrativo

- `docs/supabase-admin-users.sql`: creación inicial de `public.admin_users`.
- `docs/supabase-admin-control.sql`: Etapa 2A; suspensiones server-only, permisos endurecidos, RPC serializadas para coordinar rol/estado y auditoría de instalación. Fue ejecutado y auditado remotamente el 11 de octubre de 2026; los controles de roles, suspensión y restauración fueron después desplegados y validados en producción.
- `docs/supabase-checkout-ordinality-hotfix.sql`: hotfix idempotente de la RPC atómica tras el error PostgreSQL 42601 observado en producción; no modifica datos existentes y audita sintaxis y permisos. Aplicado y auditado remotamente el 12 de octubre de 2026.
- `tests/supabaseCheckoutSql.test.mjs`: regresión estática que impide volver a combinar directamente una lista tipada con `WITH ORDINALITY`.
- `docs/supabase-distributed-rate-limit.sql`: instalación base del contador compartido con tabla RLS, RPC server-only, cron de limpieza y auditoría.
- `docs/supabase-distributed-rate-limit-v2.sql`: migración incremental correctiva aplicada el 17 de octubre; reemplaza sólo la RPC, evita identificadores que colisionen con palabras temporales de PostgreSQL, reafirma permisos y ejecuta una prueba funcional con limpieza.
- `tests/distributedRateLimitSql.test.mjs`: regresión estática de estructura, seguridad y permisos del limitador; impide reintroducir `current_time` como identificador ejecutable y exige la migración v2 verificable.
- `docs/supabase-product-images-storage-hardening.sql`: migración incremental no destructiva para limitar `product-images` a 20 MB, MIME y extensiones de imagen permitidos, carpeta propietaria y metadata visible sólo para su dueño. Aplicada y auditada remotamente el 19 de octubre de 2026; los cinco objetos existentes quedaron conformes.
- `tests/productImageStorageSql.test.mjs`: regresión estática del bucket y sus políticas; confirma además que la migración no modifica ni elimina objetos existentes.
- `docs/supabase-avatar-storage-hardening.sql`: endurecimiento no destructivo del bucket `avatar`, 5 MB, MIME/extensiones permitidas y carpeta propia; ejecutado y auditado remotamente con 12 objetos compatibles y cero anomalías.
- `tests/avatarStorageSql.test.mjs`, `tests/authBotProtection.test.mjs`, `tests/mercadopagoTokenCrypto.test.mjs`, `tests/dynamicHtmlSafety.test.mjs` y `tests/sessionArchitecture.test.mjs`: regresiones del cierre de la lista de seguridad.
- `tests/deploymentHardening.test.mjs`: regresión de encabezados Vercel, CSP nativa estricta y navegación administrativa centralizada.
- `scripts/audit-repository-secrets.mjs`: revisa archivos versionados, bloquea `.env` reales y credenciales reconocibles sin imprimir valores.
- `tests/repositorySecretsAudit.test.mjs`: regresiones del control preventivo de secretos, incluido JWT `service_role` y placeholders permitidos.


## Estilos

- `src/styles/global.css`: tokens visuales, resets y estilos compartidos (`ab-*`) para paneles, cards, formularios y estados. En mobile normaliza las imágenes de cards de producto a 190px de alto.
- `src/styles/admin.css`: sistema visual de las cinco superficies administrativas, incluido el shell con navegación lateral compartida, resúmenes, filtros, estados restringidos, modales y responsive.
- `src/styles/featured-products.css`: presentación del carrusel de productos destacados; en mobile reutiliza el tamaño uniforme de imagen y oculta las flechas laterales.
- `src/styles/commerce-flow.css`: estilos de carrito y checkout; en mobile alinea las imágenes de carrito con el tamaño de las cards de producto.

## Configuración de despliegue

- `vercel.json`: redirección histórica vigente y encabezados HTTP defensivos globales (`nosniff`, anti-iframe, referrer y permisos de hardware).
- `.env.example`: inventario sin secretos de variables públicas, server-side, administrativas y de Mercado Pago.
- `pnpm-workspace.yaml`: permisos de builds nativos y resoluciones transitivas de seguridad dentro de sus líneas compatibles.

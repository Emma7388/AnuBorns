# AnuBorns

Marketplace argentino desarrollado con Astro para comprar y vender productos y gestionar cobros entre compradores, vendedores y la plataforma.

## Estado actual

Actualizado al 11 de octubre de 2026 — rama `V0.8`.

El proyecto se encuentra en etapa de MVP avanzado/beta técnica. Los flujos principales de productos ya utilizan Supabase y el cobro se integra con Mercado Pago Checkout Pro. Una compra real posterior al reinicio comercial confirmó nuevamente la creación de la preferencia con OAuth del vendedor, el pago aprobado, la persistencia local y el split 1:1 con la comisión objetivo configurada al 1,5%. La experiencia multiproveedor quedó definida como un checkout independiente por vendedor. El principal pendiente de pagos es validar un reembolso real de punta a punta.

### Estado del historial comercial

El 10 de octubre de 2026 el usuario confirmó que anteriormente se ejecutó el reinicio controlado definido en `docs/supabase-product-catalog-reset.sql`. La fecha exacta de esa ejecución no quedó registrada. Ese procedimiento eliminó intencionalmente productos, carritos, órdenes, ítems de órdenes, despachos, lecturas de estado y los eventos comerciales `manual_checkout_created` y `order_payment_status_changed` de `audit_logs`; conservó Auth, perfiles, administradores y conexiones OAuth de Mercado Pago.

Por ese motivo, `orders` y `order_items` pueden estar vacías aunque hayan existido operaciones reales anteriores. Las transacciones previas al reinicio no pueden auditarse de punta a punta usando la base actual; deben contrastarse con comprobantes o reportes externos de Mercado Pago. Esto no debe interpretarse como una pérdida reciente ni como prueba de que el checkout nunca se ejecutó.

### Implementado

- Registro, inicio de sesión, confirmación por correo y perfiles con Supabase Auth.
- Edición de datos personales y avatar.
- Categorías y productos dinámicos desde Supabase, con fallback local de categorías.
- Publicación de productos con imagen, precio, categoría, contacto y métodos de entrega.
- Catálogo por categoría, búsqueda, filtros y detalle de producto.
- Carrito híbrido: `localStorage` para visitantes, Supabase para usuarios autenticados y sincronización al iniciar sesión.
- Checkout autenticado con precios y disponibilidad validados en el servidor.
- Reserva atómica en PostgreSQL: una RPC bloquea y revalida productos, crea orden e ítems en una transacción y una restricción de reservas impide dos órdenes activas para el mismo producto.
- Órdenes, items, historial de compras y panel de ventas persistidos en Supabase.
- Envío o retiro, estados de preparación, despacho, entrega y retiro confirmado.
- Prevención de compra de productos propios y de productos ya vendidos.
- Limpieza y recuperación de checkouts pendientes abandonados.
- Conexión OAuth de la cuenta Mercado Pago del vendedor.
- Checkout Pro creado con el token del vendedor y comisión configurable para AnuBorns.
- Comisión objetivo del 1,5% comprobada en una compra real posterior al reinicio: sobre ARS 500 el redondeo vigente envió ARS 8 y Mercado Pago mostró ese importe acreditado a AnuBorns.
- Webhook firmado, validación de monto/moneda e idempotencia.
- Sincronización del pago al regresar de Mercado Pago si el webhook demora.
- Estados de pago normalizados para aprobado, pendiente, rechazado, cancelado, reembolsado, reembolso pendiente y reembolso parcial.
- Registro de movimientos de pago en `audit_logs` cuando Mercado Pago cambia el estado de una orden.
- Endurecimiento de APIs con límite de cuerpo JSON, respuestas `no-store`, rate limit en endpoints sensibles y OAuth state firmado sin fallback fijo.
- Panel admin con chequeos operativos, consulta manual de mediciones read-only de Supabase y consulta manual de Vercel Analytics cuando las APIs estan configuradas.
- Índices de performance documentados para Supabase y RPC opcional para paginar `Mis ventas` desde Postgres.
- Productos destacados, notificaciones, temas claro y oscuro, y navegación responsive.
- En mobile, las cards de productos usan imágenes de tamaño uniforme y el carrusel de destacados oculta las flechas laterales para conservar espacio.
- Tipografía base Montserrat semibold y controles/botones en Montserrat regular.
- Publicación con retiro en el domicilio como modalidad predeterminada; seleccionar envío lo reemplaza, no agrega ARS 5.000 al comprador y deja la logística a cargo del vendedor.
- Ubicación de publicación en Campana, Zárate, Lima o las tres ciudades mediante la opción Todas.

### Servicios retirados temporalmente

El módulo de servicios no está expuesto en la aplicación. La decisión, el estado de la tabla remota y los requisitos para reconstruirlo están documentados en [docs/SERVICIOS_PENDIENTES.md](docs/SERVICIOS_PENDIENTES.md).

### Limitaciones conocidas

- Cada checkout admite productos de un solo vendedor. El carrito puede conservar productos de varios vendedores, pero los presenta y finaliza por grupos separados.
- La reserva atómica, sus permisos, los índices principales y la RPC `get_seller_sales_page(...)` fueron verificados remotamente. Ambas RPC sólo permiten ejecución mediante `service_role`.
- Existe evidencia concordante de una operación real anterior al reinicio comercial: el registro histórico conservado por el usuario indica orden y pago aprobados, preferencia creada con OAuth del vendedor, `marketplace_fee:1` y `mp_status_detail:accredited`; la captura de Mercado Pago muestra una venta de ARS 1.000, ARS 999 destinados al vendedor y ARS 1 como total de la operación para AnuBorns. Esto valida el pago, el split y la comisión para esa operación concreta. Como la orden y su auditoría local fueron eliminadas por el reinicio, ya no se puede reconstruir desde Supabase si primero impactó el webhook o la sincronización de retorno.
- Las rutas históricas de servicios/profesionales permanecen retiradas o redirigidas; no forman parte del marketplace operativo de productos.
- Los flujos de oferta y contratación de servicios continúan como MVP/placeholder.
- La compra, el split y la comisión se comprobaron después del reinicio; falta completar una prueba real de reembolso total o parcial con Mercado Pago y conservar la vista del comprador.
- El stock de 1 a 100, las cantidades de carrito y la reserva/devolución atómica están implementados localmente; su migración fue aplicada y auditada remotamente el 11 de octubre de 2026. Falta validar el circuito con el código desplegado.
- El rate limit actual vive en memoria y es de mejor esfuerzo entre instancias serverless.
- La limpieza de checkouts abandonados se dispara por actividad del sistema y no mediante una tarea programada permanente.

## Stack

- Astro 6 con salida server-side y adaptador Vercel.
- HTML, CSS, JavaScript y Astro como base del proyecto.
- Sin framework de cliente: no React, Vue, Svelte ni librerías UI salvo decisión explícita.
- Supabase Auth, Database, Storage y Realtime.
- Mercado Pago SDK y Checkout Pro.
- CSS propio compartido y estilos locales.
- pnpm y Node.js 22.12 o superior.

## Scripts

- `pnpm dev`: inicia el servidor local.
- `pnpm build`: valida variables requeridas y genera el build para Vercel.
- `pnpm preview`: sirve localmente el build generado.
- `pnpm astro`: ejecuta comandos de Astro.

## Configuración local

1. Instalar Node.js 22.12 o superior y pnpm.
2. Ejecutar `pnpm install`.
3. Copiar `.env.example` a `.env` y completar las variables.
4. Revisar las migraciones ya aplicadas y ejecutar únicamente los scripts SQL pendientes que correspondan al ambiente. No ejecutar todos los archivos de `docs/` indiscriminadamente.
5. Ejecutar `pnpm dev`.

Variables requeridas para compilar:

```env
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
SUPABASE_METRICS_SECRET_KEY=
VERCEL_ANALYTICS_TOKEN=
VERCEL_ANALYTICS_PROJECT_ID=
VERCEL_ANALYTICS_TEAM_ID=
```

`SUPABASE_PROJECT_REF` y `SUPABASE_METRICS_SECRET_KEY` son opcionales para compilar, pero habilitan el boton manual de mediciones del servidor Supabase en `/admin`. La clave debe ser privada/server-side, idealmente una Secret API key `sb_secret_...`.

Cuando un admin toca `Consultar`, el panel intenta leer lo liviano disponible, como database size, Storage y usuarios activos aproximados. Egress, Log ingestion y Log Query quedan indicados como datos de dashboard porque no conviene consultarlos desde la app.

`VERCEL_ANALYTICS_TOKEN` y `VERCEL_ANALYTICS_PROJECT_ID` habilitan el boton manual de Vercel Analytics en `/admin`. `VERCEL_ANALYTICS_TEAM_ID` es opcional y solo hace falta si el proyecto pertenece a un team. El token es privado/server-side; no debe tener prefijo `PUBLIC_`.

Variables requeridas para Mercado Pago:

```env
SITE_URL=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_CLIENT_ID=
MERCADOPAGO_CLIENT_SECRET=
MERCADOPAGO_OAUTH_REDIRECT_URI=
MERCADOPAGO_MARKETPLACE_ID=MP
MERCADOPAGO_SEND_MARKETPLACE_FIELD=false
MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=0
MERCADOPAGO_MARKETPLACE_FEE_PERCENT=1.5
CHECKOUT_PENDING_ORDER_TTL_MINUTES=1440
```

La comisión objetivo vigente es el 1,5% del subtotal de productos con publicación permanente. Las publicaciones mensuales abonan ARS 2.000 por 30 días y no vuelven a pagar el porcentaje al vender. `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT` debe permanecer en `0`, porque cualquier importe fijo mayor que cero tiene prioridad y anula el porcentaje. El cálculo actual redondea la comisión al peso entero más cercano y verifica que no supere el total. `MERCADOPAGO_SEND_MARKETPLACE_FIELD` se mantiene en `false` salvo que Mercado Pago indique expresamente que la operación debe enviar el campo `marketplace`; la comisión se envía mediante `marketplace_fee`.

Ese redondeo debe considerarse una decisión comercial pendiente: ARS 500 × 1,5% produce ARS 7,50, pero el código envía ARS 8. La operación real confirmó que Mercado Pago aplicó ARS 8. Si se necesita un 1,5% exacto para importes pequeños, primero hay que confirmar que el flujo admite decimales y luego cambiar y volver a probar el cálculo.

## Arquitectura funcional

### Compra de productos

1. `/comprar/productos`: categorías disponibles.
2. `/comprar/productos/[categoria]`: productos reales agrupados por vendedor.
3. `/producto/[id]`: detalle del producto.
4. `/carrito`: carrito local/remoto.
5. `/finalizar-compra`: datos de retiro o envío.
6. `/api/checkout`: valida el carrito, crea la orden y la preferencia de Mercado Pago.
7. `/compra-confirmada`: muestra y sincroniza el resultado.
8. `/mis-compras`: historial y seguimiento de entrega.

### Venta de productos

1. `/vender/productos`: conexión de Mercado Pago y publicación.
2. `/mis-ventas`: productos publicados, ventas y despacho.
3. `/proveedor-publico/[userId]`: vidriera pública del vendedor.

### Mercado Pago marketplace

El vendedor conecta su cuenta mediante OAuth. El backend crea la preferencia usando el access token de ese vendedor y agrega la comisión de AnuBorns. Actualmente no se divide un único pago entre varios vendedores: el backend exige un solo vendedor por checkout.

Archivos principales:

- `src/pages/api/checkout.js`
- `src/pages/api/mercadopago-webhook.js`
- `src/pages/api/mercadopago-payment-sync.js`
- `src/pages/api/mercadopago/oauth/`
- `src/scripts/mercadopago-connect.js`
- `src/lib/mercadopagoOAuthState.js`
- `src/lib/paymentStatus.js`
- `src/lib/paymentMovement.js`

## Datos

- Categorías, productos, perfiles, órdenes, items, carritos y despachos viven en Supabase.
- `src/data/categories.js` funciona como catálogo/fallback local.
- No existe `src/data/providers.js`; la referencia anterior era obsoleta. El módulo de servicios/profesionales permanece retirado según `docs/SERVICIOS_PENDIENTES.md`.
- Los scripts SQL de `docs/` documentan el esquema y sus ampliaciones incrementales.
- `docs/supabase-performance-indexes.sql` agrega índices alineados a las consultas reales del marketplace.
- `docs/supabase-seller-sales-rpc.sql` crea `get_seller_sales_page(...)` para que `Mis ventas` filtre, cuente y pagine en Postgres.
- `docs/supabase-atomic-product-reservations.sql` crea la reserva única por producto, sus triggers y la RPC transaccional requerida por ambos checkouts.
- `docs/supabase-product-stock-publications.sql` migra esa reserva a cantidades, agrega stock, contratos permanentes/mensuales, snapshots de vendedor, carrito único por usuario y endurece las escrituras de productos para que pasen por APIs autenticadas.

## Documentación

- `docs/ARCHITECTURE.md`: responsabilidades generales por capa.
- `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`: estados de Mercado Pago, reembolsos, auditoría y defensas de API.
- `docs/BUENAS_PRACTICAS_VENTAS_MERCADO_PAGO.md`: resumen del material comercial aportado, estado actual y brechas para conversión, cuotas, reclamos y crecimiento.
- `docs/LINEA_POR_LINEA.md`: inventario funcional de archivos.
- `docs/vercel-supabase-env.md`: variables de despliegue.
- `docs/SUPABASE_REINICIO_CONTROLADO.md`: checklist para reinicio manual y lectura de métricas Supabase.
- `docs/supabase-*.sql`: esquema, migraciones, RLS y funciones de Supabase.
- `docs/PR_WORKFLOW.md`: criterios para ramas y pull requests.

## Supabase: optimización

Para mejorar consultas frecuentes sin cambiar datos ni policies:

1. La migración `docs/supabase-atomic-product-reservations.sql` fue aplicada y verificada en Supabase el 10 de octubre de 2026: cero conflictos, estructura correcta y RPC accesible sólo para `service_role`. Repetir su auditoría después de cambios remotos relevantes.
2. Los índices de `docs/supabase-performance-indexes.sql` aparecen en la auditoría remota del 10 de octubre de 2026.
3. `get_seller_sales_page(...)` existe y quedó con ejecución exclusiva para `service_role`; `anon` y `authenticated` fueron confirmados en `false` el 11 de octubre de 2026.
4. Si PostgREST no ve una función inmediatamente, ejecutar `select pg_notify('pgrst', 'reload schema');`.

La ampliación `docs/supabase-product-stock-publications.sql` fue ejecutada y auditada remotamente el 11 de octubre de 2026. Se confirmaron columnas, constraints, RLS, índices, tres triggers habilitados, datos consistentes y ejecución exclusiva de las RPC mediante `service_role`. El código compatible todavía debe desplegarse y validarse.

`/api/my-sales-list` usa la RPC remota `get_seller_sales_page(...)` y conserva el camino anterior como fallback defensivo.

## Pendientes prioritarios

### Pagos, producción y seguridad

1. Ejecutar, con autorización explícita, un reembolso total o parcial controlado y verificar Mercado Pago, `orders`, `audit_logs`, bloqueo/liberación del producto, Mis compras y Mis ventas.
2. Conservar una captura de la vista del comprador para completar la evidencia de las tres partes. No es necesaria para probar la comisión, pero sí para cerrar la experiencia posterior al pago.
3. Confirmar en `audit_logs` si la compra real posterior al reinicio impactó primero por webhook o por sincronización de retorno; probar además estados reales pendiente y rechazado cuando exista un escenario controlado.
4. Sustituir el rate limit en memoria por uno distribuido compatible con múltiples instancias de Vercel.
5. Decidir si la comisión conserva redondeo a pesos enteros o pasa a centavos para representar exactamente el 1,5%.
6. Automatizar la limpieza de órdenes pendientes abandonadas o monitorear su disparo actual después de 24 horas. Una preferencia sin `payment_id` no equivale a un pago pendiente en Mercado Pago.
7. Ejecutar el build y la revisión de producción con las variables reales del despliegue; el usuario gestiona build, commit, push, SQL y deploy.

### Producto y operación comercial

Los diez pendientes funcionales quedaron implementados localmente el 11 de octubre: edición segura de publicaciones; stock 1–100 y carrito con cantidades; reserva/decremento/reposición atómicos; contrato Mensual de ARS 2.000 por 30 días; borrado propio desde Destacados; consulta por vendedor de pagos MP pendientes frente a preferencias sin pago; validación de nombre, email y DNI contra Mercado Pago con excepción para `1157622469`; enlace confiable del aviso a `/carrito`; carrito único/deduplicado sin F5; y compactación/regresión del circuito de cards, ubicación, retiro y envío.

Estos diez puntos no se consideran validados en producción hasta:

1. desplegar el código compatible; las dos migraciones requeridas ya fueron ejecutadas y auditadas;
2. probar en navegador edición, alta permanente, alta mensual, vencimiento, cantidades, dos checkouts simultáneos, borrado desde Destacados, identidad coincidente/no coincidente y carrito sin recarga;
3. realizar un pago mensual controlado. El vencimiento oculta automáticamente la publicación por consulta y RLS; no se borra físicamente el historial;
4. confirmar visualmente las cards en mobile y escritorio.

Después de esa validación quedan como mejoras comerciales: instrumentar un embudo sin datos personales y abordar reclamos/contracargos/fraude, evidencia de entrega, políticas públicas, cuotas sin interés, recuperación consentida de carritos, reseñas y promociones. El plan está en `docs/BUENAS_PRACTICAS_VENTAS_MERCADO_PAGO.md`.

### Alcance aplazado y limpieza

1. Mantener servicios, profesionales y ofertas retirados hasta definir su modelo persistente, permisos y pagos.
2. Aclarar qué documento Word de la página principal debe localizarse; no hay un archivo Word identificado en el inventario actual.
3. Inventariar dependencias antes de retirar los proyectos antiguos llamados “MVP” y “Anubis-Reborn”; no eliminarlos sólo por nombre.
4. Los PDF/XLSX históricos quedan archivados como material no bloqueante. Revisarlos únicamente si se necesita una auditoría documental o comercial.

## Interfaz de compras y ventas

- El nombre de cada página aparece en la barra superior. Mis ventas distingue Ventas y Publicaciones activas.
- `DeferredListControls.astro` comparte filtros, Buscar, Limpiar y Mostrar todos. Buscar requiere al menos una fecha. Los listados se cargan por acción del usuario.
- Compras y ventas comparten la clase `ab-transaction-list`: tarjetas anchas y datos completos. El catálogo y las publicaciones mantienen una grilla compacta.
- En mobile, las cards de producto normalizan sus imágenes a 190px de alto con `object-fit: contain`; destacados usa la misma medida y oculta la navegación lateral.
- Un producto con pago aprobado deja de mostrarse en el catálogo. El detalle de venta usa los datos de la operación y no enlaza a la publicación oculta.
- El documento imprimible se llama Detalle de compra: muestra al vendedor, una referencia corta, el estado del pago y el movimiento de reembolso/cancelación cuando Mercado Pago lo informa. No implementa numeración fiscal.
- Un pago cancelado, rechazado o reembolsado no muestra entrega pendiente; un reembolso pendiente pausa la entrega y el despacho.
- `src/lib/purchaseDetail.js` genera el documento compartido por Compras y Confirmación. `purchaseDetailStyles.js` también se reutiliza en el detalle de venta.
- Los indicadores verdes de categorías excluyen productos vendidos y guardan las visitas por usuario en el navegador. Actualmente consultan hasta 300 productos recientes.
- El header deduplica ráfagas de sesión, perfil, carrito, admin y notificaciones con cachés cortas del lado cliente; no reemplaza validaciones server-side.

## Verificación y despliegue

- `node --test tests\paymentStatus.test.mjs tests\salePendingAction.test.mjs tests\purchaseDetail.test.mjs tests\serverRequest.test.mjs tests\mercadopagoOAuthState.test.mjs tests\purchaseProvider.test.mjs`: regresiones de estados de pago, indicador de ventas, detalle de compra, lectura JSON limitada y OAuth state.
- `node --test .\tests\*.test.mjs`: variante usada en Windows para ejecutar toda la suite local.
- Última ejecución local observada el 11 de octubre de 2026: 94 pruebas aprobadas, 0 fallos.
- `git diff --check`: comprueba errores de formato en el diff.
- `pnpm build`: ejecutar antes de publicar. El usuario gestiona build, commit, push, despliegues y SQL.
- En Windows se observó `EPERM` al crear un symlink durante el empaquetado del adaptador Vercel, después de compilar Astro. Revisar permisos de enlaces simbólicos; no confundir ese fallo con un error de la integración MP. `.nvmrc` fija Node 22.12.0.
- La última compilación completa y el despliegue remoto no fueron verificados por el asistente. Un chequeo de sintaxis no sustituye el build ni una prueba en navegador.

El contexto de Mercado Pago y las verificaciones pendientes se mantienen en [docs/CONTINUIDAD_MP_Y_PRODUCCION.md](docs/CONTINUIDAD_MP_Y_PRODUCCION.md).

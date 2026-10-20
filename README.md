# AnuBorns

Marketplace argentino desarrollado con Astro para comprar y vender productos y gestionar cobros entre compradores, vendedores y la plataforma.

## Estado actual

Actualizado al 20 de octubre de 2026 — rama `V0.8`.

El proyecto se encuentra en etapa de MVP avanzado/beta técnica. Los flujos principales de productos ya utilizan Supabase y el cobro se integra con Mercado Pago Checkout Pro. Una compra real posterior al reinicio comercial confirmó nuevamente la creación de la preferencia con OAuth del vendedor, el pago aprobado, la persistencia local y el split 1:1 con la comisión objetivo configurada al 1,5%. La experiencia multiproveedor quedó definida como un checkout independiente por vendedor. El principal pendiente de pagos es validar un reembolso real de punta a punta.

### Registro de etapas de actualización

- **Etapa 1 — implementación funcional: cerrada en código el 11 de octubre de 2026.** Incluyó los diez pendientes funcionales, reserva y stock atómicos, publicaciones permanentes y mensuales, renovación anticipada, estados resaltados, carrito deduplicado, identidad Mercado Pago y sincronización visual de nombres con Auth. El cierre está respaldado por el commit `e7b9f66`, rama `V0.8` sincronizada con `origin/V0.8`, 101 pruebas aprobadas y las migraciones principales ejecutadas y auditadas. Este cierre no equivale a afirmar que todos los casos ya fueron probados en producción.
- **Etapa 2 — base de datos, panel administrativo, seguridad operativa y validación: en curso desde el 11 de octubre de 2026.** Las subetapas 2A y 2B están desplegadas; la validación principal de Usuario 360 fue confirmada en producción el 15 de octubre. La primera versión de 2C también quedó desplegada ese día como una vista global y de sólo lectura para órdenes, pagos incompletos, entregas sin avance y publicaciones inconsistentes. Su primer contraste revisó cuatro órdenes y corrigió un falso positivo de stock agotado; después del ajuste, producción mostró cero registros a revisar y cero alertas críticas. La Etapa 2D también fue desplegada y contrastada: detectó dos vendedores conectados, confirmó la excepción autorizada `1157622469`, la identidad coincidente de `3527785006`, tokens vigentes y cero intentos locales pendientes. La Etapa 2E quedó desplegada y validada: una cuenta autenticada sin rol recibió el estado visual restringido, no vio controles administrativos y el intento apareció correctamente en Trazabilidad.
- **Etapa 3 — madurez comercial: no iniciada.** Comprende embudo de conversión, políticas públicas, reclamos y contracargos, evidencia logística, cuotas, recuperación consentida de carrito, reseñas y promociones. No debe adelantarse a la estabilización de la etapa 2.

El 16 de octubre se completó una pasada local de estabilización transversal: utilidades compartidas de formato y almacenamiento seguro, menor duplicación en scripts y estilos administrativos, navegación fresca entre superficies admin, dimensiones y decodificación de imágenes, tipografía sin `@import`, respeto de movimiento reducido y encabezados HTTP defensivos. La suite completa quedó en 146 pruebas aprobadas y el build Astro/Vercel terminó correctamente. Estos resultados son locales; no implican despliegue.

Después de esa pasada se reemplazó el rate limit local por una RPC atómica compartida en Supabase. La implementación usa claves HMAC/SHA-256, no persiste IPs ni tokens en texto plano y conserva un respaldo temporal en memoria si la RPC no está disponible. La migración base se ejecutó el 16 de octubre y, durante la validación real, apareció una colisión de tipos porque el identificador `current_time` era interpretado por PostgreSQL como `CURRENT_TIME` (`time with time zone`). La migración incremental `docs/supabase-distributed-rate-limit-v2.sql` corrigió la función con variables `v_`, volvió a asegurar sus permisos y ejecutó una prueba funcional transaccional. El 17 de octubre producción confirmó la fuente distribuida: `/admin` mostró 34 chequeos correctos, 0 a revisar y 0 con error.

El 17 de octubre se unificó la navegación de las cinco superficies administrativas en `AdminNavigation.astro`: menú lateral único en escritorio, navegación horizontal desplazable en tablet y adaptación compacta en móvil. Las páginas dejaron de repetir enlaces entre sí y conservan únicamente sus acciones locales. La navegación se oculta junto con el contenido cuando la autorización devuelve 401/403. El cambio fue desplegado y validado en escritorio; todavía corresponde revisar visualmente los viewports reales de tablet y móvil.

El 20 de octubre se cerró una revisión local de dependencias y secretos. Astro, el adaptador Vercel, Supabase JS y Mercado Pago SDK se actualizaron a sus líneas corregidas; las dependencias transitivas con avisos se fijaron en versiones parcheadas compatibles desde `pnpm-workspace.yaml`. `pnpm audit --prod` pasó de 53 avisos a 0 sobre 369 dependencias. La CSP ahora usa la separación nativa de Astro 7 y ya no necesita middleware: scripts y estilos de elementos continúan basados en hashes, mientras `unsafe-inline` queda limitado a `style-src-attr`. En 122 revisiones alcanzables se auditaron 1.699 blobs de texto sin secretos reconocibles ni archivos `.env` versionados; 11 blobs binarios y 4 mayores a 2 MB se clasificaron y omitieron del análisis textual. Además, `pnpm run security:secrets` evita nuevas credenciales rastreadas sin imprimir valores. La suite local quedó en 165 pruebas aprobadas y el build Vercel finalizó sin advertencias CSP. Estos cambios todavía requieren commit, push, despliegue y recorrido visual por parte del usuario.

### Estado del historial comercial

El 10 de octubre de 2026 el usuario confirmó que anteriormente se ejecutó el reinicio controlado definido en `docs/supabase-product-catalog-reset.sql`. La fecha exacta de esa ejecución no quedó registrada. Ese procedimiento eliminó intencionalmente productos, carritos, órdenes, ítems de órdenes, despachos, lecturas de estado y los eventos comerciales `manual_checkout_created` y `order_payment_status_changed` de `audit_logs`; conservó Auth, perfiles, administradores y conexiones OAuth de Mercado Pago.

Por ese motivo, `orders` y `order_items` pueden estar vacías aunque hayan existido operaciones reales anteriores. Las transacciones previas al reinicio no pueden auditarse de punta a punta usando la base actual; deben contrastarse con comprobantes o reportes externos de Mercado Pago. Esto no debe interpretarse como una pérdida reciente ni como prueba de que el checkout nunca se ejecutó.

### Implementado

- Registro, inicio de sesión, confirmación por correo y perfiles con Supabase Auth. El nombre se sincroniza como metadata de Auth para que también aparezca en el panel de usuarios; el teléfono de contacto permanece en `public.profiles` y no se convierte en credencial telefónica.
- Edición de datos personales y avatar.
- Categorías y productos dinámicos desde Supabase, con fallback local de categorías.
- Publicación de productos con imagen, precio, categoría, contacto y métodos de entrega.
- Carga de imágenes de producto limitada a JPG/JPEG, PNG y WebP de hasta 20 MB, con nombres normalizados y Storage restringido a la carpeta propietaria. La migración incremental fue aplicada y auditada remotamente el 19 de octubre de 2026.
- Catálogo por categoría, búsqueda, filtros y detalle de producto.
- Carrito híbrido: `localStorage` para visitantes, Supabase para usuarios autenticados y sincronización al iniciar sesión.
- Checkout autenticado con precios y disponibilidad validados en el servidor.
- Reserva atómica en PostgreSQL: una RPC bloquea y revalida productos, crea orden e ítems en una transacción y una restricción de reservas impide dos órdenes activas para el mismo producto.
- Órdenes, items, historial de compras y panel de ventas persistidos en Supabase.
- Envío o retiro, estados de preparación, despacho, entrega y retiro confirmado.
- Prevención de compra de productos propios y de productos ya vendidos.
- Limpieza y recuperación de checkouts pendientes abandonados: las preferencias nuevas vencen junto con el TTL local y la migración programada cancela órdenes huérfanas sin borrar su historial.
- Conexión OAuth de la cuenta Mercado Pago del vendedor.
- Checkout Pro creado con el token del vendedor y comisión configurable para AnuBorns.
- Comisión objetivo del 1,5% comprobada en una compra real posterior al reinicio: sobre ARS 500 el redondeo vigente envió ARS 8 y Mercado Pago mostró ese importe acreditado a AnuBorns.
- Webhook firmado, validación de monto/moneda e idempotencia.
- Sincronización del pago al regresar de Mercado Pago si el webhook demora.
- Estados de pago normalizados para aprobado, pendiente, rechazado, cancelado, reembolsado, reembolso pendiente y reembolso parcial.
- Registro de movimientos de pago en `audit_logs` cuando Mercado Pago cambia el estado de una orden.
- Endurecimiento de APIs con límite de cuerpo JSON, respuestas `no-store`, rate limit en endpoints sensibles y OAuth state firmado sin fallback fijo.
- Panel admin con chequeos operativos, consulta manual de mediciones read-only de Supabase, Vercel Analytics y control de usuarios. La Etapa 2A agrega alta/baja de roles persistidos en base, suspensión/restauración sin borrar cuentas, administradores activos y auditoría reciente; cada mutación exige motivo y se ejecuta sólo desde APIs server-side. La Etapa 2B suma una ficha 360 por usuario. La primera entrega de 2C agrega `/admin/operaciones`, con clasificación global y alertas read-only para pagos, auditoría, cumplimiento y catálogo. La Etapa 2D incorpora `/admin/mercadopago`, que diferencia datos locales, preferencias sin pago, pagos realmente pendientes, OAuth e identidad sin exponer tokens. La Etapa 2E incorpora a Trazabilidad los accesos administrativos rechazados de usuarios autenticados, con deduplicación temporal de mejor esfuerzo y sin exponer credenciales.
- Índices de performance documentados para Supabase y RPC opcional para paginar `Mis ventas` desde Postgres.
- Productos destacados, notificaciones, temas claro y oscuro, y navegación responsive.
- En mobile, las cards de productos usan imágenes de tamaño uniforme y el carrusel de destacados oculta las flechas laterales para conservar espacio.
- Tipografía base Montserrat semibold y controles/botones en Montserrat regular.
- Acceso seguro a almacenamiento del navegador para que carrito, tema, perfil y avisos degraden sin romper la interfaz cuando `localStorage` o `sessionStorage` están bloqueados.
- Encabezados globales `nosniff`, anti-iframe, política de referencia y restricción de cámara, micrófono y geolocalización configurados en Vercel.
- Content Security Policy servida como encabezado HTTP por Astro: scripts y bloques de estilo autorizados por SHA-256, conexiones limitadas al mismo origen y Supabase, fuentes limitadas a Google Fonts, objetos y frames bloqueados, y atributos de estilo dinámicos aislados mediante `style-src-attr`. Para mantener esta política sin `unsafe-inline` en scripts se retiró `ClientRouter`; la navegación conserva cargas completas y usa transiciones nativas sólo cuando el navegador las soporta.
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
- El rate limit distribuido está activo y confirmado en producción desde el 17 de octubre de 2026. `/admin` informó la fuente distribuida y 34 chequeos correctos, sin advertencias ni errores. El respaldo temporal en memoria permanece de forma intencional para no inutilizar las APIs durante incidentes de Supabase; si se activa, el panel lo señala como degradación.
- El cron de checkouts abandonados fue aplicado y auditado en Supabase: canceló los dos intentos vencidos, dejó cero pendientes antiguos y quedó activo cada hora con acceso exclusivo de `service_role`. La expiración explícita de preferencias nuevas está implementada localmente y requiere el próximo despliegue.

## Stack

- Astro 7 con salida server-side y adaptador Vercel.
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
RATE_LIMIT_HASH_SECRET=
SUPABASE_PROJECT_REF=
SUPABASE_METRICS_SECRET_KEY=
VERCEL_ANALYTICS_TOKEN=
VERCEL_ANALYTICS_PROJECT_ID=
VERCEL_ANALYTICS_TEAM_ID=
```

`SUPABASE_PROJECT_REF` y `SUPABASE_METRICS_SECRET_KEY` son opcionales para compilar, pero habilitan el boton manual de mediciones del servidor Supabase en `/admin`. La clave debe ser privada/server-side, idealmente una Secret API key `sb_secret_...`.

`RATE_LIMIT_HASH_SECRET` es privada, opcional pero recomendada. Debe ser un valor aleatorio largo y estable entre despliegues; se usa sólo para convertir ruta e identidad de red en una clave HMAC irreversible. Si falta, el servidor deriva esa clave con `SUPABASE_SERVICE_ROLE_KEY` sin exponerla al navegador.

Cuando un admin toca `Consultar`, el panel intenta leer lo liviano disponible, como database size, Storage y usuarios activos aproximados. Egress, Log ingestion y Log Query quedan indicados como datos de dashboard porque no conviene consultarlos desde la app.

`VERCEL_ANALYTICS_TOKEN` y `VERCEL_ANALYTICS_PROJECT_ID` habilitan el boton manual de Vercel Analytics en `/admin`. `VERCEL_ANALYTICS_TEAM_ID` es opcional y solo hace falta si el proyecto pertenece a un team. El token es privado/server-side; no debe tener prefijo `PUBLIC_`.

Administradores de respaldo configurados en Vercel:

```env
ADMIN_USER_IDS=
ADMIN_EMAILS=
```

Ambas variables son privadas, opcionales y aceptan listas separadas por comas. `ADMIN_USER_IDS` es la referencia estable recomendada; `ADMIN_EMAILS` queda como respaldo operativo. Los roles administrables desde la web viven en `public.admin_users`, por lo que estas variables no deben usarse para reemplazar la gestión auditada ordinaria.

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

`CHECKOUT_PENDING_ORDER_TTL_MINUTES` vale 1440 minutos por defecto. El checkout usa ese mismo plazo para `expiration_date_to` de la preferencia de Mercado Pago. El cron SQL queda fijado en 24 horas, por lo que ambos valores deben modificarse juntos si cambia la política. La cancelación conserva la orden como auditoría y los triggers devuelven el stock; no elimina filas.

La migración sólo regulariza el estado local. Las preferencias históricas creadas antes de incorporar `expires` no se modifican retroactivamente en Mercado Pago; si alguno de esos enlaces antiguos todavía circula, debe vencerse mediante la API de preferencias con el token OAuth del vendedor. El webhook conserva la validación defensiva ante una aprobación tardía.

Las publicaciones mensuales muestran el tiempo restante en días y horas después de aprobarse el pago, calculado al ingresar o recargar `Mis ventas` sin consultas periódicas. La renovación se habilita únicamente durante los últimos 7 días. Si se paga antes del vencimiento, los nuevos 30 días comienzan después de la fecha vigente, de modo que el vendedor no pierde el tiempo restante. Al vencer, el producto no se elimina: deja de ser público y comprable, pero permanece en la base y en el panel de su vendedor para poder renovarlo.

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
- `docs/supabase-checkout-ordinality-hotfix.sql` corrige la RPC atómica de checkout instalada el 11 de octubre; fue aplicado y auditado en Supabase el 12 de octubre. Una compra posterior quedó aprobada con Payment ID, detalle y movimiento auditado, confirmando nuevamente la ejecución remota.
- `docs/supabase-abandoned-checkouts-cron.sql` instala la cancelación horaria de órdenes `pending` sin `payment_id`, regulariza las vencidas y audita permisos; fue aplicado y verificado remotamente el 12 de octubre de 2026.
- `docs/supabase-performance-indexes.sql` agrega índices alineados a las consultas reales del marketplace.
- `docs/supabase-seller-sales-rpc.sql` crea `get_seller_sales_page(...)` para que `Mis ventas` filtre, cuente y pagine en Postgres.
- `docs/supabase-atomic-product-reservations.sql` crea la reserva única por producto, sus triggers y la RPC transaccional requerida por ambos checkouts.
- `docs/supabase-product-stock-publications.sql` migra esa reserva a cantidades, agrega stock, contratos permanentes/mensuales, snapshots de vendedor, carrito único por usuario y endurece las escrituras de productos para que pasen por APIs autenticadas.
- `docs/supabase-admin-control.sql` agrega suspensión sin borrado, endurece los permisos de roles administrativos y devuelve su propia auditoría de instalación para la Etapa 2A.
- `docs/supabase-profiles-search-path-hardening.sql` fija un `search_path` vacío en el trigger de actualización de perfiles. Fue aplicado y auditado remotamente el 15 de octubre de 2026: función y trigger existentes, y configuración segura confirmada.
- `docs/supabase-distributed-rate-limit.sql` crea el contador atómico compartido, restringe tabla y RPC a `service_role`, agenda la limpieza de claves antiguas y devuelve una auditoría de instalación. Fue ejecutado y auditado remotamente el 16 de octubre de 2026: tabla existente, RLS activo, cron diario activo y RPC exclusiva de `service_role`.
- `docs/supabase-distributed-rate-limit-v2.sql` es la migración incremental correctiva aplicada el 17 de octubre de 2026. Reemplaza únicamente la RPC con nombres de variables no reservados, reafirma `search_path` y permisos, ejecuta una prueba funcional como `service_role` y limpia su bucket de verificación. Producción quedó confirmada con fuente distribuida.
- `docs/supabase-product-images-storage-hardening.sql` restringe el bucket `product-images` a 20 MB, MIME JPEG/PNG/WebP, extensiones JPG/JPEG/PNG/WebP y rutas `<usuario>/<producto>/<archivo>`. Fue aplicado y auditado remotamente el 19 de octubre de 2026: cuatro políticas para `authenticated`, cinco objetos históricos y cero extensiones o estructuras inesperadas.

## Documentación

- `docs/ARCHITECTURE.md`: responsabilidades generales por capa.
- `docs/PANEL_ADMIN_OPERATIVO.md`: alcance, seguridad, activación y pendientes del panel administrativo.
- `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`: estados de Mercado Pago, reembolsos, auditoría y defensas de API.
- `docs/supabase-auth-display-name-backfill.sql`: sincronización puntual de nombres históricos desde perfiles hacia la metadata visual de Auth, sin alterar el teléfono de autenticación.
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

### Etapa 2 actual — Administración, base de datos y validación

1. Completado por validación operativa del usuario: `/admin/usuarios` permite otorgar/quitar roles y suspender/restaurar cuentas con auditoría. No se repetirá sobre cuentas reales sólo para generar evidencia adicional.
2. Completar la validación responsive y de filtros de `/admin/operaciones`. La vista ya fue desplegada y contrastada: revisó cuatro órdenes, retiró un falso positivo de stock agotado y, después del ajuste, informó cero registros a revisar y cero alertas críticas.
3. Completar la revisión responsive y las variantes de contingencia de `/admin/mercadopago`. Su primera validación en producción confirmó dos vendedores conectados, identidades correcta/exceptuada, tokens vigentes y cero intentos locales pendientes. La pantalla no requiere SQL nuevo.
4. Completado: 2E fue desplegada y validada con una cuenta autenticada sin rol. El panel ocultó controles y datos administrativos, mantuvo el rechazo 403 y Trazabilidad registró `Acceso administrativo rechazado`. No requirió SQL nuevo.
5. Completar las variantes pendientes de diagnóstico OAuth en producción y conservar la excepción de identidad Mercado Pago documentada.
6. Ejecutar, con autorización explícita, un reembolso total o parcial controlado y verificar Mercado Pago, `orders`, `audit_logs`, bloqueo/liberación del producto, Mis compras y Mis ventas.
7. Conservar una captura de la vista del comprador y confirmar si la aprobación real impactó primero por webhook o sincronización de retorno; probar estados pendiente y rechazado cuando exista un escenario controlado.
8. Completado: `RATE_LIMIT_HASH_SECRET` está configurada en producción, las migraciones del limitador fueron aplicadas y `/admin` confirmó la fuente distribuida con 34 chequeos correctos, 0 a revisar y 0 con error. Siguen pendientes la decisión sobre el redondeo del 1,5% y el tratamiento de enlaces históricos si todavía circulan.
9. Ejecutar despliegue y revisión responsive con variables reales. El build local con CSP ya finalizó correctamente; el usuario gestiona commit, push, SQL y deploy.

### Registro de la etapa 1 — Producto y operación funcional

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
3. El proyecto antiguo “MVP” ya fue retirado y el directorio local quedó vinculado al proyecto Vercel `anuborns`. Si “Anubis-Reborn” todavía existe, inventariar sus dependencias antes de retirarlo; no eliminarlo sólo por nombre.
4. Los PDF/XLSX históricos quedan archivados como material no bloqueante. Revisarlos únicamente si se necesita una auditoría documental o comercial.

## Interfaz de compras y ventas

- El nombre de cada página aparece en la barra superior. Mis ventas distingue Ventas y Publicaciones activas.
- `DeferredListControls.astro` comparte filtros, Buscar, Limpiar y Mostrar todos. Buscar requiere al menos una fecha. Los listados se cargan por acción del usuario.
- Compras y ventas comparten la clase `ab-transaction-list`: tarjetas anchas y datos completos. El catálogo y las publicaciones mantienen una grilla compacta.
- En mobile, las cards de producto normalizan sus imágenes a 190px de alto con `object-fit: contain`; destacados usa la misma medida y oculta la navegación lateral.
- Un producto con pago aprobado deja de mostrarse en el catálogo. El detalle de venta usa los datos de la operación y no enlaza a la publicación oculta.
- El documento imprimible se llama Detalle de compra: muestra al vendedor, una referencia corta, el estado del pago y el movimiento de reembolso/cancelación cuando Mercado Pago lo informa. No implementa numeración fiscal.
- Un pago cancelado, rechazado o reembolsado no muestra entrega pendiente; un reembolso pendiente pausa la entrega y el despacho.
- Los estados visibles dentro de las cards de publicaciones, ventas, compras, pagos pendientes y administración se distinguen con un fondo tipo resaltador, sin modificar su tipografía.
- `src/lib/purchaseDetail.js` genera el documento compartido por Compras y Confirmación. `purchaseDetailStyles.js` también se reutiliza en el detalle de venta.
- Los indicadores verdes de categorías excluyen productos vendidos y guardan las visitas por usuario en el navegador. Actualmente consultan hasta 300 productos recientes.
- El header deduplica ráfagas de sesión, perfil, carrito, admin y notificaciones con cachés cortas del lado cliente; no reemplaza validaciones server-side.

## Verificación y despliegue

- `node --test tests\paymentStatus.test.mjs tests\salePendingAction.test.mjs tests\purchaseDetail.test.mjs tests\serverRequest.test.mjs tests\mercadopagoOAuthState.test.mjs tests\purchaseProvider.test.mjs`: regresiones de estados de pago, indicador de ventas, detalle de compra, lectura JSON limitada y OAuth state.
- `node --test tests\adminAccess.test.mjs tests\adminAudit.test.mjs tests\adminAuth.test.mjs`: reglas de rol/suspensión, auditoría administrativa y bloqueo de cuentas.
- `node --test tests\adminUserOverview.test.mjs`: visibilidad de publicaciones, diagnóstico Mercado Pago seguro, resumen comercial y cronología de la ficha 360.
- `node --test .\tests\*.test.mjs`: variante usada en Windows para ejecutar toda la suite local.
- `pnpm run security:secrets`: revisa archivos versionados, rechaza `.env` reales y credenciales reconocibles, y nunca imprime el valor detectado.
- `pnpm run security:audit`: consulta avisos conocidos del árbol de producción; la última ejecución del 20 de octubre devolvió 0 vulnerabilidades sobre 369 dependencias.
- Última ejecución local observada el 20 de octubre de 2026: 165 pruebas aprobadas, 0 fallos. El artefacto SSR devolvió la CSP esperada, con hashes para scripts y estilos de elementos, sin `unsafe-inline` en scripts y con la excepción visual acotada exclusivamente a `style-src-attr`.
- `git diff --check`: comprueba errores de formato en el diff.
- `pnpm build`: ejecutar antes de publicar. El usuario gestiona build, commit, push, despliegues y SQL.
- En Windows se había observado `EPERM` al crear un symlink durante el empaquetado del adaptador Vercel. El 16 de octubre `pnpm.cmd build` completó correctamente compilación, empaquetado y salida del adaptador; si reaparece, debe tratarse como un problema de permisos local y no como un fallo de Mercado Pago. `.nvmrc` fija Node 22.12.0.
- El despliegue remoto continúa bajo control del usuario. La versión actual fue desplegada por el usuario y contrastada en `/admin` el 17 de octubre de 2026.

El contexto de Mercado Pago y las verificaciones pendientes se mantienen en [docs/CONTINUIDAD_MP_Y_PRODUCCION.md](docs/CONTINUIDAD_MP_Y_PRODUCCION.md).

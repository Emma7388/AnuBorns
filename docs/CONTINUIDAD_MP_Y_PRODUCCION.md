# Continuidad de AnuBorns: Mercado Pago y producción

Documento de traspaso del chat, actualizado el 20 de octubre de 2026.
No contiene credenciales. Distingue resultados observados, reportes del usuario e hipótesis pendientes.

## Retomar por aquí

### Transición de etapa — 11 de octubre de 2026

- **Etapa 1, implementación funcional: cerrada en código.** Los diez puntos funcionales y sus ampliaciones posteriores quedaron en `V0.8`, commit `e7b9f66`, ya sincronizado con `origin/V0.8`. Las migraciones principales de stock, publicaciones, reservas, índices y permisos fueron ejecutadas y auditadas remotamente; una prueba real del 12 de octubre reveló un error diferido dentro de la RPC de checkout, documentado y corregido localmente más abajo.
- El usuario ejecutó la sincronización histórica de nombres de Auth y mostró nueve cuentas con `display_name` y teléfono de contacto recuperados desde `public.profiles`. `telefono_auth=null` es correcto para cuentas que autentican por email. La excepción de identidad continúa asociada al MP User ID `1157622469`, no al nombre visible.
- **Etapa 2, base de datos, panel administrativo, seguridad operativa y validación: iniciada.** La subetapa 2A de control administrativo base quedó implementada y desplegada: roles desde el panel, suspensión sin borrado, administradores activos, auditoría reciente y motivo obligatorio para mutaciones. `docs/supabase-admin-control.sql` fue aplicado y auditado remotamente; falta completar pruebas controladas de todas las mutaciones. Hasta completar esas verificaciones, “implementado” no significa certificado en producción.
- **Etapa 2B, ficha 360 por usuario: desplegada el 12 de octubre.** `/admin/usuarios` carga bajo demanda publicaciones, pagos mensuales, compras, ventas, cumplimiento, cronología y diagnóstico en vivo OAuth/identidad. La respuesta no contiene tokens, no ejecuta mutaciones y queda cacheada por usuario durante la visita. La disposición visual fue revisada en producción; falta contrastar todas las variantes de cuenta y estados operativos.
- **Etapa 2C, control global: desplegada y contrastada en producción el 15 de octubre.** `/admin/operaciones` centraliza hasta 500 órdenes recientes y cruza despachos, catálogo y auditoría para señalar pendientes viejas, pagos incompletos, entregas sin avance y publicaciones inconsistentes. Es exclusivamente read-only.
- Primer contraste en producción: 4 órdenes revisadas, 2 aprobadas, 0 pendientes y 0 críticas. El único aviso provenía de un producto con stock agotado correctamente oculto; se retiró esa clasificación para no generar un falso positivo. El ajuste se desplegó con el commit `4e601d8` y la vista confirmó después 0 registros a revisar y 0 alertas críticas.
- **Etapa 2D, Mercado Pago centralizado: desplegada y contrastada en producción el 15 de octubre.** `/admin/mercadopago` reúne vendedores, conexiones OAuth, vencimientos, identidad e intentos pendientes. La carga inicial usa sólo Supabase; `Verificar Mercado Pago` es una acción manual, limitada y read-only que diferencia preferencias sin pago, pagos pendientes reales, estados ya resueltos y caídas externas sin exponer tokens. La primera verificación mostró dos vendedores conectados: `1157622469` con excepción autorizada y `3527785006` con identidad coincidente; ambos tokens estaban vigentes y no había intentos locales pendientes ni alertas locales.
- **Etapa 2E, trazabilidad de permisos: desplegada y validada el 15 de octubre.** Una cuenta autenticada sin rol recibió el estado visual de acceso restringido sin controles ni datos administrativos; la API conservó el rechazo 403 y el evento sanitizado `admin_permission_denied` apareció correctamente en Trazabilidad. La deduplicación sigue siendo de mejor esfuerzo por usuario/ruta durante cinco minutos en cada instancia, y un fallo al escribirla nunca modifica el rechazo ni habilita acceso.
- **Estabilización transversal local — 16 de octubre.** Se centralizaron formateo y storage seguro, se consolidó CSS administrativo, se reservaron recargas completas para las rutas admin, se mejoraron carga y estabilidad visual de imágenes y se agregaron encabezados HTTP defensivos. Pasaron 146 pruebas, los chequeos de sintaxis/CSS/JSON y el build completo Astro/Vercel. No se hizo deploy ni se modificó Supabase.
- **Rate limit distribuido — activo y validado en producción el 17 de octubre.** Las APIs usan una RPC atómica compartida con claves HMAC/SHA-256 opacas, fallback local de 30 segundos y diagnóstico en `/admin`. La auditoría remota confirmó tabla y RLS activos, cron diario `jobid=2`, `service_role=true`, `authenticated=false` y `anon=false`. La primera prueba funcional detectó PostgreSQL 42804 porque `current_time` colisionaba con `CURRENT_TIME` y producía `time with time zone`; `docs/supabase-distributed-rate-limit-v2.sql` corrigió la RPC con variables `v_`, reafirmó permisos y pasó su prueba transaccional. Tras desplegar, `/admin` mostró 34 chequeos correctos, 0 a revisar y 0 con error, con fuente distribuida.
- **Navegación administrativa unificada — desplegada el 17 de octubre.** Las cinco superficies dejaron de repetir botoneras y ahora comparten un stack lateral mediante `AdminNavigation.astro`; se adapta horizontalmente en viewports menores y se oculta ante 401/403. Las acciones específicas permanecen en cada encabezado. La disposición quedó validada en escritorio; falta revisar visualmente tablet y móvil reales.
- **Storage de imágenes de producto — aplicado y auditado el 19 de octubre.** El formulario acepta JPG/JPEG —incluidas las descargas habituales de WhatsApp—, PNG y WebP, rechaza otros MIME, conserva el máximo de 20 MB, exige que el navegador pueda decodificar el contenido y genera la extensión desde el tipo declarado. `docs/supabase-product-images-storage-hardening.sql` aplica los mismos límites en el bucket, exige la ruta `<auth.uid>/<product-id>/<file>`, usa `owner_id` y permite leer metadata únicamente de la carpeta propia. La auditoría confirmó bucket público, límite `20971520`, MIME correctos, cuatro políticas para `authenticated`, cinco objetos existentes, cero extensiones inesperadas y cero rutas con profundidad incorrecta. No se alteraron objetos históricos. Avatar tiene ahora su propia migración no destructiva, aún pendiente de ejecución remota.
- **Dependencias, secretos y CSP — revisión local cerrada el 20 de octubre.** Astro 7, el adaptador Vercel, Supabase JS y Mercado Pago SDK quedaron actualizados; las resoluciones transitivas compatibles están centralizadas en `pnpm-workspace.yaml`. `pnpm audit --prod` pasó de 53 avisos a 0 sobre 369 dependencias. La CSP usa ahora la separación nativa de Astro 7: hashes para scripts y estilos de elementos, sin `unsafe-inline` en JavaScript y con esa excepción limitada a `style-src-attr`; el middleware anterior fue retirado. En 122 revisiones alcanzables se auditaron 1.699 blobs de texto sin secretos reconocibles ni `.env` versionados; 11 binarios y 4 archivos mayores a 2 MB quedaron fuera del análisis textual. Se agregó `pnpm run security:secrets` como control preventivo. Pasaron 165 pruebas y el build Vercel. Falta desplegar y recorrer en producción login, carrito, producto, venta y las cinco vistas admin vigilando la consola.
- **Cierre de la lista de veinte controles — código terminado el 20 de octubre.** Se agregaron Turnstile para registro/login/recuperación, PKCE, hardening no destructivo del bucket `avatar`, cifrado AES-256-GCM de tokens OAuth con migración administrativa idempotente y una auditoría cerrada de todos los sinks `innerHTML`/`document.write`. Durante la revisión se corrigieron título, imagen y moneda sin escapar en el detalle de venta. La arquitectura no crea cookies de sesión propias: Supabase mantiene la sesión del SDK y cada API revalida el Bearer token; una cookie HttpOnly real requeriría migrar toda la app a BFF y no se simula parcialmente. El procedimiento completo está en `docs/SECURITY_CHECKLIST.md`. Antes de declarar producción cerrada faltan tres activaciones del usuario: ejecutar `docs/supabase-avatar-storage-hardening.sql`, configurar Turnstile tanto en Vercel como en Supabase Auth, y cargar `MERCADOPAGO_TOKEN_ENCRYPTION_KEY` para luego pulsar `Cifrar tokens OAuth`.
- **Etapa 3, madurez comercial: pendiente y todavía no iniciada.** El embudo, las políticas, reclamos, logística probatoria, cuotas y crecimiento se mantienen fuera del trabajo actual.

#### Orden de trabajo de la etapa 2

1. Desplegar y validar `/admin/operaciones`; revisar cada alerta contra Supabase antes de corregir datos.
2. Completado: una compra posterior al hotfix quedó aprobada, persistida y sin alertas locales en 2C. Conservar la evidencia externa de Mercado Pago si se necesita volver a certificar el fee de esa operación.
3. Completar la revisión responsive y los escenarios de contingencia de la Etapa 2D; su despliegue y primer contraste limpio ya fueron confirmados.
4. Completado: 2E fue desplegada y validada con una cuenta autenticada sin rol; el rechazo ocultó la superficie administrativa y produjo el evento esperado en Trazabilidad.
5. Completado por confirmación operativa del usuario: roles, suspensión y restauración de 2A funcionan en producción. No repetir sobre cuentas reales sólo para generar evidencia.
6. Completar las variantes de 2B con cuenta sin MP, cuenta exceptuada y Mercado Pago temporalmente no verificable.
7. Ejecutar pruebas controladas de pago mensual, comisión aplicable, concurrencia de stock, pendiente/rechazado y reembolso.
8. Conservar evidencia de comprador, vendedor, plataforma, base y `audit_logs`; documentar cada resultado antes de cerrar la etapa.

#### Regularización de checkouts abandonados — 12 de octubre

- Las órdenes locales `pending` sin `payment_id` son intentos de checkout no completados; no prueban que exista dinero pendiente en Mercado Pago.
- El problema era que el TTL de 24 horas sólo se aplicaba cuando otra actividad disparaba la limpieza. Por eso dos intentos antiguos podían seguir visibles y mantener reservas aunque ya hubieran superado el plazo.
- El checkout local ahora crea preferencias con `expires=true` y fechas de vigencia alineadas con `CHECKOUT_PENDING_ORDER_TTL_MINUTES`.
- `docs/supabase-abandoned-checkouts-cron.sql` crea una función sin acceso para `anon` ni `authenticated`, agenda una ejecución horaria con `pg_cron` y regulariza de inmediato las órdenes vencidas. Cambia el estado a `cancelled`, conserva la fila y deja que los triggers liberen stock.
- No se usa el cierre o abandono de la pestaña como señal de cancelación porque no es un evento confiable y puede existir una aprobación tardía. El webhook mantiene una recuperación validada para ese caso.
- Estado remoto: migración aplicada y auditada. Canceló dos intentos vencidos, la lectura independiente confirmó `stale_pending_remaining=0` y `cancelled_as_abandoned=2`, y el cron quedó activo. Falta desplegar el código para que las preferencias nuevas incluyan vencimiento también del lado de Mercado Pago.
- Verificación local posterior: 124 pruebas aprobadas, chequeo de sintaxis de los dos módulos modificados y `git diff --check` sin errores. No se ejecutó build ni despliegue.
- El SQL no puede editar retroactivamente las preferencias viejas en Mercado Pago. Después de regularizar las filas locales, los dos enlaces históricos deben considerarse legado: si continúan accesibles, corresponde vencerlos una vez mediante `PUT /checkout/preferences/{id}` usando el OAuth del vendedor, sin exponer tokens. Las preferencias nuevas ya nacen con vigencia definida.
- Primera ejecución remota: el cron quedó activo como `jobid=1`, horario `17 * * * *`, con ejecución exclusiva para `service_role`, y la función informó `cancelled_now=2`. El campo `stale_pending_remaining=2` de esa misma respuesta provenía de la fotografía anterior al `UPDATE`, porque ambos cálculos compartían sentencia; el SQL local se corrigió para auditar en una sentencia posterior. La lectura independiente confirmó luego cero vencidas pendientes y dos canceladas como abandono. No requiere reinstalar el cron.

### Reserva atómica de productos — 10 de octubre

- Se agregó y aplicó `docs/supabase-atomic-product-reservations.sql` como base inicial. El 11 de octubre también se aplicó `docs/supabase-product-stock-publications.sql`, que amplió la reserva a clave `(product_id, order_id)` con `qty`, descuento y reposición de unidades.
- La RPC `create_checkout_order_atomic(...)` toma advisory locks en orden estable, bloquea las filas actuales de `products`, revalida precio, moneda, vendedor, comprador y total, y crea `orders` + `order_items` dentro de una sola transacción.
- Checkout Pro y checkout manual dejaron de insertar orden e ítems en llamadas separadas y ahora usan esa RPC mediante `src/lib/atomicOrders.js`.
- Webhook y sincronización consideran también las órdenes pendientes al buscar conflictos. La restricción de reservas actúa como defensa final si una aprobación tardía compite con otra reserva.
- La migración aborta sin cambios si encuentra productos asociados a más de una orden activa. No borra datos.
- Estado remoto: aplicado y verificado por el usuario en Supabase el 10 de octubre de 2026. La auditoría devolvió `conflicts=0`, `active_products=0`, `reservations=0`, ejecución habilitada para `service_role=true` y denegada para `anon=false` y `authenticated=false`. Los conteos en cero son coherentes con el reinicio previo del historial comercial.
- La auditoría estructural repetida el 11 de octubre confirmó las siete tablas objetivo con RLS, la nueva clave compuesta de reservas, `qty`, pagos de publicación, constraints e índices. Los conteos de stock, cantidades, carritos duplicados, vencimientos y pagos pendientes duplicados devolvieron cero anomalías.
- En `orders` y `order_items` sólo aparecen políticas de lectura del propietario; en `product_checkout_reservations` no aparece ninguna política de navegador. Las políticas de escritura directa retiradas no reaparecieron. `rls_forced=false` es el estado esperado para permitir la operación controlada del backend con `service_role` y no se considera un fallo.
- Los índices de performance documentados aparecen en el ambiente remoto. `get_seller_sales_page(...)` y `create_checkout_order_atomic(...)` existen y permiten ejecución a `service_role`; `anon` y `authenticated` quedaron sin permiso. Los tres triggers de reserva aparecen habilitados con estado `O`.
- Verificación local posterior al cambio: 64 pruebas aprobadas, chequeos de sintaxis JavaScript aprobados y `git diff --check` sin errores. Esto no reemplaza la prueba de concurrencia contra PostgreSQL remoto.
- Verificación completa más reciente del árbol de trabajo: 179 pruebas aprobadas y 0 fallos el 20 de octubre; el build Astro/Vercel también finalizó correctamente. La revisión incluye Turnstile, PKCE, Storage de avatar, cifrado OAuth, persistencia segura y auditoría de HTML dinámico. `pnpm audit --prod` ya había informado 0 vulnerabilidades y el control de secretos no encontró hallazgos. Las activaciones remotas nuevas se enumeran en `docs/SECURITY_CHECKLIST.md`; el usuario conserva a su cargo commit, push, SQL y despliegue.

#### Incidente de checkout y hotfix — 12 de octubre

- Una compra en producción llamó a `POST /api/checkout` a las 16:59 y recibió HTTP 500 antes de crear la orden o contactar a Mercado Pago.
- El log de Vercel mostró PostgreSQL `42601`: `WITH ORDINALITY cannot be used with a column definition list` dentro de `create_checkout_order_atomic(...)`.
- La causa estaba en la versión ampliada por stock de `docs/supabase-product-stock-publications.sql`: combinaba directamente `jsonb_to_recordset(...)`, `WITH ORDINALITY` y una lista tipada. La instalación podía completarse porque PL/pgSQL analizaba esa sentencia al ejecutarla; las auditorías anteriores sólo comprobaban estructura y permisos.
- Se corrigió el archivo principal con `ROWS FROM (...) WITH ORDINALITY` y se preparó `docs/supabase-checkout-ordinality-hotfix.sql`, que reemplaza únicamente la función, conserva `service_role` como ejecutor y no altera datos comerciales existentes.
- Se agregó `tests/supabaseCheckoutSql.test.mjs` para rechazar la forma inválida. Verificación local: 120 pruebas aprobadas y `git diff --check` sin errores.
- Estado remoto: **hotfix aplicado y auditado el 12 de octubre**. Supabase devolvió `ordinality_syntax_ok=true`, `rpc_existe=true`, ejecución habilitada únicamente para `service_role=true` y denegada para `authenticated=false` y `anon=false`.
- Validación posterior: la orden corta `E54882FD`, creada después del hotfix, figura aprobada con Payment ID y sin alertas locales de detalle o auditoría en `/admin/operaciones`. Esto confirma que el checkout volvió a crear y persistir la operación; no sustituye la validación externa del fee ni el reembolso pendiente.

#### Hardening del trigger de perfiles — 15 de octubre

- Se ejecutó `docs/supabase-profiles-search-path-hardening.sql` para fijar un `search_path` vacío en `public.set_profiles_updated_at()` y evitar que la resolución de nombres dependa del rol de ejecución.
- La auditoría remota confirmó `function_exists=true`, `trigger_attached=true`, `search_path_fixed=true` y `search_path_config=["search_path=\"\""]`.
- La advertencia `function_search_path_mutable` queda cerrada. No se modificaron filas de perfiles ni datos de autenticación.
- La advertencia independiente sobre protección de contraseñas filtradas no describe una filtración: el control sólo puede activarse desde Auth en planes Supabase Pro o superiores; no tiene solución SQL en Free.

- Los registros nuevos vuelven a enviar nombre y apellido como metadata de Auth, y guardar `Mis datos` vuelve a sincronizarlos sin borrar avatar ni otra metadata. El teléfono de contacto sigue en `public.profiles`: no debe copiarse a `auth.users.phone`, ya que esa columna corresponde a autenticación telefónica. Las cuentas históricas sin nombre visible requieren volver a guardar su perfil o sincronizarlas desde Administración después de desplegar este cambio.

### Evidencia real posterior al reinicio — 10 de octubre

- Se conservó en Supabase una compra real posterior al reinicio, identificada en esta documentación sólo por la referencia corta `C3ADE956`. El importe fue ARS 500 y la orden quedó con `status=approved`, `payment_status=approved` y `mp_status_detail:accredited`.
- La traza local conserva `marketplace_fee:8`, `marketplace:omitted` y el identificador OAuth del vendedor. Esto prueba que la preferencia se creó con la cuenta OAuth esperada y que el sistema configurado al 1,5% calculó y envió ARS 8.
- El redondeo vigente explica el importe: ARS 500 × 1,5% = ARS 7,50 y `calculateMarketplaceFee(...)` redondea al peso entero más cercano. Para esta venta el porcentaje efectivo fue 1,6%. Conservar ese redondeo o admitir centavos queda como decisión comercial/técnica.
- La captura de la cuenta de AnuBorns muestra la venta por ARS 500, el pago de ARS 492 al vendedor, ARS 8 como total de la operación para la plataforma y estado aprobado.
- La captura de la cuenta del vendedor muestra la misma operación y referencia, ARS 500 brutos, estado aprobado y ARS 470,49 programados para acreditación. La diferencia entre ARS 492 y ARS 470,49 es un costo adicional de Mercado Pago de ARS 21,51; el concepto exacto debe verificarse en el desglose de esa cuenta y no atribuirse a la comisión de AnuBorns.
- Las capturas de Mercado Pago y la fila de Supabase concuerdan en importe, fecha aproximada, referencia y estado. En conjunto confirman pago, OAuth, persistencia, split y acreditación de la comisión en una operación posterior al reinicio.
- Falta conservar la vista del comprador. Esa captura completaría el expediente de las tres partes y la experiencia postpago, pero no es necesaria para demostrar que AnuBorns recibió ARS 8.
- También aparecieron dos órdenes locales `pending` sin `payment_id`. Eran preferencias/checkouts no completados, no pagos pendientes confirmados por Mercado Pago. El cron aplicado el 12 de octubre las regularizó como `cancelled` y la auditoría independiente dejó cero vencidas pendientes.
- El pendiente principal de Mercado Pago pasa a ser el reembolso total o parcial de punta a punta. También quedan como pruebas complementarias un pago realmente pendiente/rechazado y determinar por `audit_logs` si la aprobación entró primero por webhook o sincronización de retorno.

### Evidencia histórica de pago, split y comisión — 10 de octubre

- El usuario conservó un correo con los datos de una compra real anterior al reinicio comercial y una captura del detalle de esa misma operación en Mercado Pago. En el repositorio sólo se registra la referencia interna corta `3478D967`; los identificadores completos y los datos personales quedan fuera de la documentación pública.
- El registro histórico indica importe de ARS 1.000, `status=approved`, `payment_status=approved` y la traza `mp_preference|marketplace_fee:1|marketplace:omitted|oauth_seller:...|mp_status_detail:accredited`.
- También indica que la entrega coordinada/retiro finalizó: `shipping_requested=false`, `shipping_status=completed` y `fulfillment_status=completed`.
- La captura de Mercado Pago coincide en importe y operación: muestra “Venta de Producto” por ARS 1.000, “Pago a [vendedor]” por ARS 999, “Total de la operación” por ARS 1 y estado “Aprobado”.
- La combinación de ambas evidencias valida, para esa operación concreta, que la preferencia se creó con OAuth del vendedor, el pago fue aprobado y acreditado, y el split aplicó la comisión de ARS 1 a AnuBorns. Es evidencia más fuerte que el mero estado “Mercado Pago conectado”.
- El correo conservado no es una confirmación de soporte de Mercado Pago: su texto termina solicitando esa confirmación. La acreditación se concluye por los datos históricos de AnuBorns y, principalmente, por el desglose visible en la captura de Mercado Pago.
- El reinicio controlado ejecutado con posterioridad eliminó `orders`, `order_items` y la auditoría comercial relacionada. Por eso hoy no se puede determinar desde Supabase si la aprobación entró primero por webhook o por sincronización de retorno, ni reconstruir el evento local completo.
- Estado correcto del pendiente: esta operación histórica y la compra posterior al reinicio validan la repetibilidad del pago, split y comisión. El reembolso total/parcial todavía no fue validado de punta a punta.
- La comisión de ARS 1 pertenece únicamente a esa prueba histórica. La configuración comercial objetivo indicada por el usuario es 1,5%: `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=0` y `MERCADOPAGO_MARKETPLACE_FEE_PERCENT=1.5`.

### Optimización Supabase y regla de stack — 14 de septiembre

- Stack acordado por el usuario: HTML, CSS, JavaScript y Astro. No incorporar React, Vue, Svelte ni librerías UI salvo pedido explícito.
- El usuario remarcó que no quiere que el asistente ejecute build ni deploy. El usuario gestiona build, despliegues, commits, pushes y SQL en Supabase.
- Se agregó `docs/supabase-performance-indexes.sql` con índices idempotentes para consultas reales: productos por vendedor/categoría/fecha, compras por usuario/fecha, checkouts pendientes, ventas por `order_items`, despachos y carritos.
- Se agregó `docs/supabase-seller-sales-rpc.sql` con la RPC `get_seller_sales_page(...)` para paginar `Mis ventas` desde Postgres.
- `src/pages/api/my-sales-list.js` intenta usar la RPC y conserva fallback al camino anterior si la función no existe o PostgREST todavía no actualizó schema cache.
- Verificación local realizada antes de esta actualización documental: `node --test .\tests\*.test.mjs` con 24 tests aprobados y `node --check src\pages\api\my-sales-list.js` aprobado. No se debe presentar esto como build ni deploy.
- Para aplicar en Supabase: ejecutar primero `docs/supabase-performance-indexes.sql`, luego `docs/supabase-seller-sales-rpc.sql`. Si la RPC no aparece de inmediato: `select pg_notify('pgrst', 'reload schema');`.

### Actualización de pagos, reembolsos y seguridad — 12 de septiembre

- Se documentó el flujo vigente en `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`.
- Se agregó normalización de estados de Mercado Pago para aprobado, pendiente, rechazado, cancelado, reembolsado, reembolso pendiente y reembolso parcial.
- Webhook y sincronización de retorno actualizan `orders.status`, `orders.payment_status`, `orders.payment_id` y `orders.payment_detail` también cuando Mercado Pago informa reembolsos o cancelaciones posteriores a la aprobación.
- Los cambios reales de estado se registran en `audit_logs` con evento `order_payment_status_changed`; el registro incluye fuente, estado anterior/nuevo y resumen de Mercado Pago.
- `orders.payment_detail` conserva la traza `mp_preference|marketplace_fee:...|oauth_seller:...` para compras nuevas y agrega `mp_status_detail:...` al impactar Mercado Pago. Órdenes viejas que quedaron sólo con `accredited` no prueban ni descartan split desde Supabase.
- Mis ventas conserva historial de operaciones no aprobadas, pero sólo permite despacho en `approved`. `refund_pending`, `partially_refunded`, `refunded`, `cancelled`, `canceled`, `rejected` y `pending` no generan indicador verde de acción pendiente.
- Mis compras y Detalle de compra muestran estado de pago y movimiento. Un reembolso pendiente pausa entrega/despacho; pagos cancelados, rechazados o reembolsados no se presentan como entregas pendientes.
- La política de producto único bloquea el producto en `approved`, `refund_pending` y `partially_refunded`; lo libera cuando la orden queda rechazada, cancelada o reembolsada completa.
- Se reforzaron APIs con lectura JSON limitada, headers `no-store`/`nosniff`, rate limit adicional y OAuth state de Mercado Pago sin fallback fijo de desarrollo.
- Pruebas locales observadas: `node --test tests\paymentStatus.test.mjs tests\salePendingAction.test.mjs tests\purchaseDetail.test.mjs tests\serverRequest.test.mjs tests\mercadopagoOAuthState.test.mjs tests\purchaseProvider.test.mjs` con 22 tests aprobados. También se ejecutó chequeo de sintaxis JavaScript y `git diff --check`. No se ejecutó build.

### Actualización de interfaz y mantenimiento — 12 de septiembre

- El commit local observado al iniciar la revisión fue `ed70f34` (Mejora interfaz de compras y ventas y detalles de operaciones), con árbol limpio. No se verificó el despliegue remoto de ese commit.
- Se simplificaron encabezados y se ajustaron estados vacíos, controles de fechas y tarjetas compartidas de Compras/Ventas. Buscar queda deshabilitado sin fechas; destildar despacho sin fechas limpia la lista de ventas.
- Los indicadores de categorías excluyen productos vendidos. Las consultas simultáneas de navegación comparten la solicitud en curso; sigue existiendo un límite de 300 productos recientes.
- El usuario confirmó que el producto debe ocultarse al aprobarse el pago. El botón de una venta ahora abre el detalle de la operación, no la publicación pública oculta.
- El documento se presenta como Detalle de compra, con vendedor y referencia corta derivada del UUID; no es una numeración correlativa o fiscal. Se ocultó el identificador de preferencia en el documento.
- En ese mantenimiento, una cancelación mostraba el importe como referencia de la compra cancelada y no presentaba retiro/entrega pendientes. Después se agregó normalización de reembolsos y estados de devolución, documentada en `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`; la compra y comisión ya fueron revalidadas después del reinicio, pero todavía falta comprobar un reembolso real de punta a punta con Mercado Pago.
- El mantenimiento posterior centraliza el documento en `src/lib/purchaseDetail.js`, compartido por `orders.js` y `confirmation.js`; estilos en `purchaseDetailStyles.js`. La venta reutiliza los estilos y conserva su propio contenido.
- Se añadieron pruebas de documento con `node --test tests/purchaseDetail.test.mjs`. No equivalen a una prueba de pago ni de producción.
- El usuario ejecuta los builds. El log compartido mostró compilación Astro exitosa seguida de `EPERM` al crear un symlink de una dependencia durante el empaquetado Vercel en Windows; después apareció un cierre de Node. No atribuirlo al SDK de MP ni dar el build completo por aprobado.
- En ese mantenimiento de interfaz no se habían modificado APIs de pago, OAuth, split, webhooks, credenciales ni migraciones. La actualización posterior de pagos/reembolsos y seguridad está resumida arriba. El estado actual del split está documentado en la sección de evidencia histórica del 10 de octubre.

El contexto anterior indicaba que Mercado Pago no observaba inconvenientes, pero la respuesta íntegra de soporte no quedó incorporada. Posteriormente el usuario compartió el correo enviado para solicitar confirmación y la captura del detalle de la operación. No confundir ese correo saliente con una respuesta oficial de soporte.

No dar por hecho que toda la integración quedó validada por las compras observadas. La próxima prueba de Mercado Pago debe enfocarse en un reembolso controlado, estados no aprobados y la evidencia del comprador, conservando la traza local antes de cualquier nuevo reinicio de datos.

## Proyecto y forma de trabajo

- Carpeta: `C:\Users\Molinas\Documents\Proyectos\AnuBorns`.
- Astro, Supabase, Mercado Pago y Vercel.
- Repositorio: `Emma7388/AnuBorns`; rama actual comprobada: `V0.8` (respetar mayúscula y punto).
- Producción utilizada: `https://anuborns.vercel.app`.
- El usuario maneja commit, push, despliegues y ejecución de SQL en Supabase. Preparar archivos e instrucciones; no ejecutar esas acciones externas por cuenta propia.
- Mensajes de commit e instrucciones en español. Explicaciones concretas, paso a paso.
- No imprimir `.env.local`, tokens ni secretos. `.env.example` sirve para consultar nombres, no para confirmar valores desplegados.
- Último commit local comprobado al actualizar este documento: `c886154 fix: hacer atomica la reserva de productos y ajustar comision`. El árbol contiene cambios posteriores todavía sin confirmar; no se verificó remotamente el último deploy.

## Qué pasó con Secret y Config

Las opciones que mostraba Vercel eran `Secret` y `Config`. Secret ocultaba el valor después de guardarlo; Config permitía verlo a miembros con acceso. Las capturas mostraban que una variable guardada como Secret no se podía convertir directamente a Config.

El usuario aclaró expresamente que eliminó y volvió a crear VARIAS VARIABLES DE MERCADO PAGO porque no pudo editarlas. No reducir este episodio al de Supabase. No tenemos el inventario exacto de cuáles recreó ni sus valores anteriores y posteriores.

El asistente había afirmado que la última era `MERCADOPAGO_OAUTH_REDIRECT_URI`, y luego lo confundió con `PUBLIC_SUPABASE_URL`. Esas reconstrucciones fueron demasiado categóricas. Conservar la aclaración del usuario como referencia principal.

Eliminar/recrear una variable no demuestra una causa del fallo. Revisar si cambió nombre, valor, entorno Production/Preview, aplicación de origen o despliegue que recibe los valores. Tampoco se probó que guardar una URL como Secret impidiera OAuth. No repetir esa explicación como diagnóstico.

Clasificación orientativa de los valores (no es un relevamiento actual de Vercel):

| Variable | Clasificación |
| --- | --- |
| PUBLIC_SUPABASE_URL | Config: URL pública |
| PUBLIC_SUPABASE_ANON_KEY | Config: clave pública anon/publishable, nunca secret/service role |
| SUPABASE_URL | Config: URL |
| SUPABASE_SERVICE_ROLE_KEY | Secret: sólo backend |
| RATE_LIMIT_HASH_SECRET | Secret opcional recomendado: HMAC estable del rate limit distribuido |
| SITE_URL | Config: URL |
| MERCADOPAGO_CLIENT_ID | Config: identificador de aplicación |
| MERCADOPAGO_CLIENT_SECRET | Secret |
| MERCADOPAGO_ACCESS_TOKEN | Secret |
| MERCADOPAGO_WEBHOOK_SECRET | Secret |
| MERCADOPAGO_OAUTH_REDIRECT_URI | Config: URL de retorno |
| MERCADOPAGO_MARKETPLACE_ID | Config: identificador |
| MERCADOPAGO_SEND_MARKETPLACE_FIELD | Config: booleano |
| MERCADOPAGO_MARKETPLACE_FEE_AMOUNT | Config: importe |
| MERCADOPAGO_MARKETPLACE_FEE_PERCENT | Config: porcentaje |

Config no significa automáticamente exposición al navegador: también importan el prefijo público y el uso en código. Secret no reemplaza controles de acceso de backend.

La URL de retorno que configuramos fue `https://anuborns.vercel.app/api/mp-oauth`, tanto en la variable como en Redirect URL de la aplicación de Mercado Pago. Client ID y Client Secret deben corresponder a la misma aplicación. Si se cambió de aplicación, revisar la procedencia de la autorización OAuth guardada antes de decidir reconectar vendedores.

## OAuth: hechos y archivos

Antes producción mostraba «Falta configurar Mercado Pago OAuth.» en `/vender/productos`. El endpoint de conexión devuelve ese mensaje si falta Client ID o Redirect URI. Después de configurar y redeployar, una captura mostró «Mercado Pago conectado», cuenta identificada y formulario para publicar habilitado.

Esto demuestra que funcionó la consulta de conexión en ese momento; no prueba un pago completo ni el reparto de comisiones.

- `src/pages/api/mercadopago/oauth/connect.js`: inicia autorización, usando Client ID y Redirect URI; envía `platform_id=mp`.
- `src/pages/api/mp-oauth.js`: callback OAuth.
- `src/lib/mercadopagoOAuthState.js`: estado de autorización.
- `src/scripts/mercadopago-connect.js`: interfaz, llama a APIs de conexión/estado/desconexión.
- `seller_mercadopago_accounts`: persistencia privada de tokens de vendedores.

## Split: comportamiento comprobado en código local

Archivo principal: `src/pages/api/checkout.js`.

- Checkout Pro crea una preferencia usando el access token OAuth del vendedor guardado en Supabase.
- `getMarketplaceFee` usa primero `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT` si es positivo. Sólo si no lo es usa `MERCADOPAGO_MARKETPLACE_FEE_PERCENT`.
- La comisión se redondea a entero y se valida que sea menor que el total. Revisar ese comportamiento al comparar importes de pruebas; no se cambió en este traspaso.
- Se envía `marketplace_fee` cuando la comisión calculada es positiva.
- `MERCADOPAGO_SEND_MARKETPLACE_FIELD=true` NO activa el split: habilita el envío del campo adicional `marketplace` con `MERCADOPAGO_MARKETPLACE_ID`, si hay comisión y un identificador.
- El flag puede estar en false y enviarse igualmente `marketplace_fee`.
- No inventar un marketplace ID ni activar ese campo suponiendo que es requisito. Comparar con las pruebas y las instrucciones concretas de soporte.
- Se renueva el token del vendedor cerca de su vencimiento y se valida su identidad mediante `/users/me`.
- `payment_detail` guarda una traza con comisión, marketplace omitido/enviado e identificador OAuth del vendedor.
- Webhook: `src/pages/api/mercadopago-webhook.js`; sincronización: `src/pages/api/mercadopago-payment-sync.js`. Esos archivos también usan variables globales de MP; revisar su correspondencia con pagos del vendedor si el fallo fuera posterior al pago.

Valores objetivo documentados en `.env.example`: marketplace ID `MP`, flag `false`, importe fijo `0` y porcentaje `1.5`. El importe fijo debe quedar en cero para que el código aplique el porcentaje. Son ejemplos del repositorio y no confirman por sí solos qué valores están desplegados en Vercel.

Documentación oficial consultada el 9 de septiembre:

- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/create-configuration
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/prerequisites

La documentación indica token OAuth del vendedor y `marketplace_fee` para Checkout Pro. La configuración incluye aplicación, Redirect URL y autorización del vendedor; no basta con nombrar variables en Vercel.

## Próxima validación de MP

1. Conservar una captura de la vista del comprador de la compra posterior al reinicio y comprobar el estado visible en Mis compras/Detalle de compra.
2. Revisar `audit_logs` de esa orden para identificar si la aprobación se aplicó primero mediante webhook o sincronización de retorno.
3. Ejecutar un reembolso total o parcial controlado y verificar sus transiciones, auditoría, bloqueo/liberación del producto e interfaces de comprador y vendedor.
4. Cuando exista un escenario seguro, validar un pago realmente pendiente y uno rechazado. No confundirlos con órdenes locales sin `payment_id`.
5. Decidir si el redondeo de ARS 7,50 a ARS 8 es el comportamiento comercial deseado para la comisión del 1,5%.
6. Si se recibe respuesta de soporte, archivarla separada del correo saliente y contrastarla con la operación, sin secretos ni datos personales.
7. No realizar cobros ni reembolsos reales sin autorización explícita.
8. No crear preferencias de diagnóstico usando una cuenta real de vendedor tomada automáticamente de `seller_mercadopago_accounts`. Para cualquier prueba que cree recursos en Mercado Pago, usar una cuenta propia/de test explícitamente permitida por `MERCADOPAGO_DIAGNOSTIC_MODE` y la allowlist documentada en `docs/mercadopago-wcs-48349-prueba-propuesta.md`.

## Supabase: auditorías y cambios anteriores

### Tokens de Mercado Pago

El usuario ejecutó `docs/supabase-mercadopago-oauth-lockdown.sql`. Quitó políticas directas SELECT/INSERT/UPDATE/DELETE de la tabla de tokens y revocó permisos a anon/authenticated, manteniendo RLS. La auditoría posterior mostró `grants_mp_oauth: []` y ninguna política de esa tabla. Backend usa service role. `profiles` tenía políticas por propietario y `audit_logs` SELECT por propietario. RLS estaba habilitado en las tres tablas; `rls_forced=false` no fue tratado como fallo.

Referencias: `docs/supabase-rls-audit.sql`, `docs/supabase-mercadopago-oauth.sql`, `docs/supabase-profiles.sql`.

### Comercio y entregas

El usuario ejecutó `docs/supabase-commerce-rls-lockdown.sql` y recibió «Success. No rows returned». Ese SQL:

- Quita políticas de escritura directa heredadas de orders, order_items, sale_dispatches y purchase_status_reads; las operaciones previstas pasan por APIs.
- Quita la unicidad antigua de purchase_status_reads que omitía status_updated_at.
- Agrega índices de order_items por order_id y product_id.
- Reconstruye el índice de lecturas de estado con status_updated_at.

También se actualizaron `docs/supabase-sales-dispatch.sql` y `docs/supabase-shipping-fulfillment.sql` para no recrear políticas retiradas. Auditoría estructural: `docs/supabase-commerce-schema-audit.sql`.

No confundir ejecución SQL exitosa con verificación exhaustiva de toda la seguridad. Después de los cambios sí se completó una compra y se verificaron pago, split, comisión y persistencia; todavía no se completaron un reembolso real ni todo el circuito de despacho/recepción con evidencia de ambas partes.

### Relación de productos históricos

Resultado compartido de `docs/supabase-order-items-product-audit.sql`:

- 155 filas de order_items (ítems, no necesariamente 155 ventas u órdenes distintas).
- 149 coinciden con productos existentes.
- 6 apuntan al mismo UUID sin coincidencia actual.
- 0 vacíos, 0 con espacios y 0 identificadores no UUID según esa consulta.

La ausencia de ese producto no prueba que haya sido eliminado: ésa fue una hipótesis. La auditoría compara texto y formato canónico; no es una validación universal de todos los formatos UUID aceptados por PostgreSQL.

Se creó `docs/supabase-order-items-product-link.sql`: agrega product_uuid nullable con FK a products y ON DELETE SET NULL, completa coincidencias actuales y crea índice parcial. Conserva product_id de texto y snapshots. Actualmente `create_checkout_order_atomic(...)` guarda ambos campos dentro de la misma transacción para checkout manual y Mercado Pago.

El usuario respondió «listo» a las instrucciones de migrar y publicar y el cambio quedó registrado originalmente en `2a576a2`. La auditoría estructural posterior del 10 de octubre confirmó remotamente `order_items.product_uuid`, su FK, los índices asociados y la relación usada por la reserva atómica.

## Interfaz y alcance previo

- Mis ventas: vendidos y publicados con controles de fecha, Buscar, Limpiar y Mostrar todos; carga diferida por acción del usuario.
- En las tarjetas propias de productos publicados, `Contrato de publicación` identifica si es permanente o mensual y `Estado del contrato` muestra Activo, Pago pendiente, Vencido o Cancelado. Este estado no representa una compra del producto.
- Mis compras: mismo patrón de carga diferida.
- Componente compartido: `src/components/DeferredListControls.astro`.
- Scripts: `src/scripts/mis-ventas.js` y `src/scripts/orders.js`.
- Se trabajó el ancho/tamaño uniforme de tarjetas, paginación y retorno al origen al entrar a un producto desde Mis ventas.
- Navegación compartida: `src/lib/internalNavigation.js`; el usuario confirmó visualmente las mejoras anteriores.
- Servicios/profesionales fueron retirados temporalmente a pedido del usuario. Referencia: `docs/SERVICIOS_PENDIENTES.md`. No restaurarlos como parte de resolver MP. La tabla remota user_services no se eliminó en ese trabajo.
- Perfil público de vendedor de productos conservado; se trabajó para tomar teléfono de profiles.phone. Revisar código actual si se vuelve a tocar contacto.

## Proyectos viejos: NO eliminados

El proyecto Vercel antiguo «MVP» ya no existe y el directorio local fue vinculado nuevamente a `anuborns`; la lista de variables de producción confirmó el proyecto correcto. «Anubis-Reborn» no fue identificado de manera definitiva. Antes de eliminar cualquier recurso que conserve ese nombre, inventariar Vercel, Supabase, aplicación MP, URLs, webhooks y credenciales vinculadas. Un nombre viejo puede seguir siendo una dependencia de producción.

## Backlog funcional que no debe perderse

El 11 de octubre quedaron resueltos en código local los diez puntos funcionales: edición por propietario vía API; stock/cantidades 1–100; reserva y reposición atómicas; publicación mensual ARS 2.000/30 días; borrado propio desde Destacados; pendientes MP por vendedor; validación de identidad con excepción `1157622469`; navegación del aviso al carrito; consolidación/deduplicación del carrito; y compactación/regresión de cards, ubicación y entrega.

Los estados visibles dentro de las cards de publicaciones, ventas, compras, pagos pendientes y administración quedaron marcados con un fondo de resaltador. No cambia familia, tamaño, peso ni color tipográfico.

Las publicaciones mensuales activas muestran días y horas restantes después de aprobarse el pago, calculados al ingresar o recargar `Mis ventas` sin un temporizador ni consultas periódicas. El botón de renovación permanece deshabilitado hasta los últimos 7 días; si el pago se aprueba antes de vencer, los 30 días nuevos se agregan después del vencimiento existente. Al vencer, la publicación no se borra: las lecturas públicas y el checkout la excluyen por fecha, mientras su propietario conserva la lectura y puede renovarla. La idempotencia del webhook evita sumar el período dos veces.

No declararlos cerrados en producción hasta desplegar el código compatible, probar un pago mensual, dos compras simultáneas por cantidad y revisar el circuito visual en mobile/escritorio. Las migraciones y sus permisos ya fueron ejecutados y auditados. El vencimiento mensual retira la publicación de consultas públicas sin borrar físicamente su trazabilidad.

- Repetir la auditoría remota sólo si se modifican nuevamente esquema, RLS, triggers o permisos de RPC.
- Realizar la validación en navegador y producción de los diez puntos locales.
- Aclarar qué “Word de la página principal” debe localizarse; no hay un archivo Word identificado en el inventario actual.
- Embudo de conversión, reclamos/contracargos/fraude, políticas públicas, evidencia logística, cuotas, recuperación consentida de carrito, reseñas y promociones, detallados en `docs/BUENAS_PRACTICAS_VENTAS_MERCADO_PAGO.md`.

## Precisión para el próximo chat

- No atribuir el fallo a Secret/Config sin evidencia.
- No confundir el flag del campo marketplace con activar comisión.
- No asumir aprobación/habilitación de split por el solo hecho de ver «conectado».
- No tratar una respuesta breve «listo» como si se hubiera inspeccionado el resultado remoto.
- No declarar toda la base segura o todas las ventas consistentes a partir de auditorías parciales.
- En mensajes antiguos se compartieron secretos en selecciones del IDE. No reproducirlos en el traspaso; no está confirmado aquí que todos hayan sido reemplazados.

## Mensaje para abrir el próximo chat

«Leé docs/CONTINUIDAD_MP_Y_PRODUCCION.md y docs/SECURITY_CHECKLIST.md. La etapa funcional y el código de los veinte controles de seguridad quedaron cerrados. La última verificación local aprobó 179 pruebas y el build Astro/Vercel. Antes de desplegar hay tres activaciones remotas: ejecutar el SQL del bucket avatar, configurar Turnstile en Vercel y Supabase Auth, y cargar la clave AES para luego cifrar los tokens OAuth desde `/admin/mercadopago`. 2A/2B/2C/2D/2E siguen documentadas y validadas según su evidencia previa. Continúan pendientes el reembolso real y las variantes controladas de pago no aprobado. El usuario controla SQL, commit, push y despliegue.»

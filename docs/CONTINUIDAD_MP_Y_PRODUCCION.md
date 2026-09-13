# Continuidad de AnuBorns: Mercado Pago y producción

Documento de traspaso del chat, actualizado el 12 de septiembre de 2026.
No contiene credenciales. Distingue resultados observados, reportes del usuario e hipótesis pendientes.

## Retomar por aquí

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
- En ese mantenimiento, una cancelación mostraba el importe como referencia de la compra cancelada y no presentaba retiro/entrega pendientes. Después se agregó normalización de reembolsos y estados de devolución, documentada en `docs/PAGOS_REEMBOLSOS_SEGURIDAD.md`; todavía falta comprobar un reembolso real de punta a punta con Mercado Pago.
- El mantenimiento posterior centraliza el documento en `src/lib/purchaseDetail.js`, compartido por `orders.js` y `confirmation.js`; estilos en `purchaseDetailStyles.js`. La venta reutiliza los estilos y conserva su propio contenido.
- Se añadieron pruebas de documento con `node --test tests/purchaseDetail.test.mjs`. No equivalen a una prueba de pago ni de producción.
- El usuario ejecuta los builds. El log compartido mostró compilación Astro exitosa seguida de `EPERM` al crear un symlink de una dependencia durante el empaquetado Vercel en Windows; después apareció un cierre de Node. No atribuirlo al SDK de MP ni dar el build completo por aprobado.
- En ese mantenimiento de interfaz no se habían modificado APIs de pago, OAuth, split, webhooks, credenciales ni migraciones. La actualización posterior de pagos/reembolsos y seguridad está resumida arriba. La investigación del split de MP indicada a continuación sigue pendiente.

Mercado Pago respondió al usuario con pruebas y, según su resumen, dice que no observa inconvenientes. El mensaje completo y las pruebas TODAVÍA NO se compartieron en este chat. El usuario sospecha que falta configuración fuera de Vercel, porque el problema aparece al configurar el split. NO conocemos el error exacto ni la etapa en que ocurre.

La próxima tarea es leer esa respuesta y contrastar su aplicación, cuentas, ambiente y solicitud de pago con nuestra integración. No dar por hecho que MP está mal, que falta habilitación ni que la integración está completamente validada.

## Proyecto y forma de trabajo

- Carpeta: `C:\Users\Molinas\Documents\Proyectos\AnuBorns`.
- Astro, Supabase, Mercado Pago y Vercel.
- Repositorio: `Emma7388/AnuBorns`; rama actual comprobada: `V0.7` (respetar mayúscula y punto).
- Producción utilizada: `https://anuborns.vercel.app`.
- El usuario maneja commit, push, despliegues y ejecución de SQL en Supabase. Preparar archivos e instrucciones; no ejecutar esas acciones externas por cuenta propia.
- Mensajes de commit e instrucciones en español. Explicaciones concretas, paso a paso.
- No imprimir `.env.local`, tokens ni secretos. `.env.example` sirve para consultar nombres, no para confirmar valores desplegados.
- Al iniciar este traspaso, el árbol Git estaba limpio. Último commit local: `2a576a2 base: vincular ventas con productos vigentes`. No se verificó remotamente el último deploy.

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

Valores encontrados en `.env.example`: marketplace ID `MP`, flag `false`, importe fijo `1`, porcentaje `0`. Son ejemplos del repositorio, NO confirmación de lo que está en Vercel ni recomendación de un ID para esta cuenta.

Documentación oficial consultada el 9 de septiembre:

- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/create-configuration
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/prerequisites

La documentación indica token OAuth del vendedor y `marketplace_fee` para Checkout Pro. La configuración incluye aplicación, Redirect URL y autorización del vendedor; no basta con nombrar variables en Vercel.

## Próximo diagnóstico de MP

1. Obtener respuesta íntegra y pruebas de soporte, sin secretos.
2. Identificar etapa y error real: guardar variable, iniciar OAuth, crear preferencia, abrir checkout, pagar o acreditar comisión.
3. Comparar aplicación y cuentas usadas por soporte contra las de producción, incluyendo ambiente de prueba/real. La cuenta conectada no confirma por sí sola la aplicación de origen del token.
4. Revisar nombres, presencia y entorno de variables en Vercel y el despliegue que las usa. No asumir que `.env.local` refleja Vercel.
5. Comparar solicitud y respuesta de creación de preferencia, comisión calculada, campo marketplace y token OAuth utilizado, manteniendo secretos fuera de logs/chat.
6. Reproducir de manera controlada sólo cuando esté definido qué se prueba. No realizar cobros reales sin autorización.

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

No confundir ejecución SQL exitosa con verificación exhaustiva de toda la seguridad. No se completó en este chat una prueba de compra/pago/despacho de punta a punta después de todos los cambios. Publicar y visualizar un producto sí fue confirmado por el usuario.

### Relación de productos históricos

Resultado compartido de `docs/supabase-order-items-product-audit.sql`:

- 155 filas de order_items (ítems, no necesariamente 155 ventas u órdenes distintas).
- 149 coinciden con productos existentes.
- 6 apuntan al mismo UUID sin coincidencia actual.
- 0 vacíos, 0 con espacios y 0 identificadores no UUID según esa consulta.

La ausencia de ese producto no prueba que haya sido eliminado: ésa fue una hipótesis. La auditoría compara texto y formato canónico; no es una validación universal de todos los formatos UUID aceptados por PostgreSQL.

Se creó `docs/supabase-order-items-product-link.sql`: agrega product_uuid nullable con FK a products y ON DELETE SET NULL, completa coincidencias actuales y crea índice parcial. Conserva product_id de texto y snapshots. `src/lib/checkoutServer.js` / buildOrderItems guarda ambos campos en nuevas compras, compartido por checkout manual y MP.

El usuario respondió «listo» a las instrucciones de migrar y publicar. El commit existe localmente (`2a576a2`), pero no se pegó el resultado final del SELECT de la migración. Si hace falta confirmar producción, verificar columna/FK/conteos antes de afirmarlo como comprobado. El código requiere aplicar la columna antes del despliegue.

## Interfaz y alcance previo

- Mis ventas: vendidos y publicados con controles de fecha, Buscar, Limpiar y Mostrar todos; carga diferida por acción del usuario.
- Mis compras: mismo patrón de carga diferida.
- Componente compartido: `src/components/DeferredListControls.astro`.
- Scripts: `src/scripts/mis-ventas.js` y `src/scripts/orders.js`.
- Se trabajó el ancho/tamaño uniforme de tarjetas, paginación y retorno al origen al entrar a un producto desde Mis ventas.
- Navegación compartida: `src/lib/internalNavigation.js`; el usuario confirmó visualmente las mejoras anteriores.
- Servicios/profesionales fueron retirados temporalmente a pedido del usuario. Referencia: `docs/SERVICIOS_PENDIENTES.md`. No restaurarlos como parte de resolver MP. La tabla remota user_services no se eliminó en ese trabajo.
- Perfil público de vendedor de productos conservado; se trabajó para tomar teléfono de profiles.phone. Revisar código actual si se vuelve a tocar contacto.

## Proyectos viejos: NO eliminados

El usuario quiere retirar «MVP» y «Anubis-Reborn» cuando se resuelva MP. No se identificó de manera definitiva qué recurso de cada plataforma corresponde a esos nombres. Antes de eliminar, inventariar Vercel, Supabase, aplicación MP, URLs, webhooks y credenciales vinculadas. Un nombre viejo puede seguir siendo una dependencia de producción.

## Precisión para el próximo chat

- No atribuir el fallo a Secret/Config sin evidencia.
- No confundir el flag del campo marketplace con activar comisión.
- No asumir aprobación/habilitación de split por el solo hecho de ver «conectado».
- No tratar una respuesta breve «listo» como si se hubiera inspeccionado el resultado remoto.
- No declarar toda la base segura o todas las ventas consistentes a partir de auditorías parciales.
- En mensajes antiguos se compartieron secretos en selecciones del IDE. No reproducirlos en el traspaso; no está confirmado aquí que todos hayan sido reemplazados.

## Mensaje para abrir el próximo chat

«Leé docs/CONTINUIDAD_MP_Y_PRODUCCION.md y retomemos el diagnóstico del split de Mercado Pago. Soporte respondió que sus pruebas funcionan. Voy a compartir la respuesta. Revisá qué diferencia hay con nuestra configuración antes de cambiar variables o código. Yo manejo los despliegues y todavía no hay que borrar MVP ni Anubis-Reborn.»

# Pagos, reembolsos y seguridad

Actualizado el 11 de octubre de 2026.

Este documento describe el comportamiento vigente del checkout de productos, la sincronización con Mercado Pago, los estados internos de pago, el bloqueo de productos, la visibilidad en compras/ventas y las defensas agregadas en las APIs. No contiene credenciales.

## Alcance

El checkout admite varios productos y cantidades del mismo vendedor; cada orden continúa perteneciendo a un único vendedor. La preferencia de Mercado Pago se crea con el token OAuth del vendedor conectado y la comisión de AnuBorns se informa como `marketplace_fee` cuando corresponde. El 1,5% se calcula sólo sobre publicaciones permanentes; una publicación mensual ya abonó ARS 2.000 por sus 30 días y no integra esa base. El soporte de cantidades requiere aplicar la migración de stock en coordinación con el despliegue.

El cobro mensual usa una preferencia separada de la plataforma, una única preferencia pendiente por producto y una referencia interna `publication:<uuid>`. La activación se ancla al instante aprobado y una repetición del webhook repara estados incompletos sin extender los 30 días. Mientras ese cobro está pendiente no se permite borrar el producto. Después, el producto puede eliminarse sin borrar el registro del pago: la relación usa `ON DELETE SET NULL` para conservar importe, estado y trazabilidad.

La renovación se habilita desde los últimos 7 días. Su vencimiento nuevo se calcula como `max(fecha de aprobación, vencimiento vigente) + 30 días`; así una renovación anticipada conserva los días restantes. `publication_started_at` identifica el pago que activó el período y permite que los reintentos del webhook devuelvan el mismo vencimiento sin volver a extenderlo.

Los cambios documentados acá cubren:

- Reembolsos, cancelaciones y pagos pendientes informados por Mercado Pago.
- Registro de movimientos de pago en `audit_logs`.
- Bloqueo o liberación del producto según el estado real de la orden.
- Vista del comprador en Mis compras y Detalle de compra.
- Vista del vendedor en Mis ventas, incluyendo cuándo puede despachar.
- Endurecimiento de APIs: lectura JSON limitada, rate limit, headers anti-cache y estado OAuth firmado sin fallback fijo.

## Estados internos de pago

La normalización vive en `src/lib/paymentStatus.js`. El sistema traduce la respuesta de Mercado Pago a estados internos de orden.

| Mercado Pago | Estado interno | Producto bloqueado | Venta visible | Despacho permitido | Uso en interfaz |
| --- | --- | --- | --- | --- | --- |
| `approved` | `approved` | Sí | Sí | Sí | Pago aprobado |
| `pending`, `in_process`, `authorized` | `pending` | Sí | Sí | No | Pago pendiente |
| `rejected` | `rejected` | No | Sí | No | Pago rechazado |
| `cancelled`, `canceled` | `cancelled` | No | Sí | No | Pago cancelado |
| `refunded`, `charged_back` | `refunded` | No | Sí | No | Pago reembolsado |
| `status_detail=refund_in_progress` o refund `processing/pending/in_process` | `refund_pending` | Sí | Sí | No | Reembolso pendiente |
| `status_detail=partially_refunded` | `partially_refunded` | Sí | Sí | No | Reembolso parcial |

La regla intencional es descontar y reservar la cantidad solicitada mientras el pago está pendiente. La ampliación local admite stock 1–100 y row locks de PostgreSQL; repone la cantidad al cancelar, rechazar o reembolsar completamente. `refund_pending` y `partially_refunded` mantienen la reserva. Esta ampliación requiere ejecutar `docs/supabase-product-stock-publications.sql` remotamente.

La garantía final vive en PostgreSQL. La reserva usa la clave compuesta `(product_id, order_id)` y guarda `qty`; los triggers descuentan o reponen unidades al cambiar órdenes o ítems. `create_checkout_order_atomic(...)` bloquea las filas de producto, revalida stock, vigencia, vendedor, moneda y precio, y persiste orden + ítems en una misma transacción. La validación previa de JavaScript mejora el mensaje al usuario, pero no es la autoridad de concurrencia.

El 12 de octubre de 2026 una prueba real detectó que la versión remota de esa RPC fallaba al insertar ítems por una combinación inválida de `jsonb_to_recordset(...)` y `WITH ORDINALITY`. El intento terminó con HTTP 500 antes de crear orden o preferencia de Mercado Pago. `docs/supabase-checkout-ordinality-hotfix.sql` corrigió únicamente esa función mediante `ROWS FROM (...) WITH ORDINALITY`; fue aplicado y auditado con ejecución exclusiva de `service_role`. Una compra posterior quedó aprobada con Payment ID, detalle local y movimiento auditado, cerrando la validación de ejecución del hotfix.

Antes de validar disponibilidad, el checkout cancela reservas `pending` antiguas sin `payment_id` para que un intento abandonado no bloquee indefinidamente una nueva compra. El TTL predeterminado es de 24 horas y ahora también se envía a Mercado Pago como vigencia explícita de la preferencia. `docs/supabase-abandoned-checkouts-cron.sql` agrega una tarea horaria global en PostgreSQL y regulariza las filas vencidas al instalarse. Fue aplicado y auditado: canceló dos intentos, dejó cero vencidos pendientes y sólo `service_role` puede ejecutar la función. La limpieza por checkout o historial se conserva como defensa adicional.

No se cancela una orden simplemente porque el navegador se cierre o el comprador no vuelva por una `back_url`: ese evento no es confiable y el pago puede aprobarse de forma tardía. Al vencer, la orden se marca `cancelled` con `payment_detail=checkout_abandoned`; no se borra. El trigger de reservas repone el stock. Si Mercado Pago informa después una aprobación válida, el webhook sólo intenta recuperarla bajo las validaciones de monto, moneda y disponibilidad existentes.

El vencimiento agregado al código se aplica a preferencias nuevas. PostgreSQL no puede alterar por sí solo una preferencia histórica ya creada en Mercado Pago; esos enlaces deben vencerse una vez mediante la API autenticada del vendedor si todavía pueden circular. Nunca se copian tokens OAuth a SQL, documentación ni navegador para resolver ese legado.

## Reembolsos y botón de arrepentimiento

Si el comprador cancela o Mercado Pago informa un arrepentimiento/reembolso, el sistema ya no trata la orden como una venta despachable común.

El flujo esperado es:

1. Mercado Pago envía webhook o el comprador vuelve a la página de confirmación.
2. `src/pages/api/mercadopago-webhook.js` o `src/pages/api/mercadopago-payment-sync.js` consulta el pago real.
3. La respuesta se normaliza con `normalizeMercadoPagoOrderStatus`.
4. Se actualizan `orders.status`, `orders.payment_status`, `orders.payment_id` y `orders.payment_detail`.
5. Si el estado cambió, se registra el movimiento en `audit_logs`.
6. Mis compras, Mis ventas y Detalle de compra muestran el nuevo estado.

Cuando Mercado Pago todavía no cerró la devolución, el comprador y el vendedor ven “Reembolso pendiente”. Esa venta queda visible como antecedente, pero no habilita despacho ni genera el indicador verde de acción pendiente para el vendedor.

`orders.payment_detail` conserva la traza de creación de preferencia cuando existe (`mp_preference|marketplace_fee:...|marketplace:...|oauth_seller:...`) y agrega el último detalle de Mercado Pago como `mp_status_detail:...`. Las compras antiguas que ya quedaron sólo con `accredited` no permiten reconstruir desde Supabase si la preferencia original tuvo `marketplace_fee`; para esas compras la confirmación definitiva del split debe salir del pago o del reporte de Mercado Pago.

## Registro de movimientos

Los movimientos se registran en `audit_logs` desde `src/lib/paymentMovement.js` con el evento:

```text
order_payment_status_changed
```

El registro se crea sólo cuando el estado cambia. El `user_id` del audit corresponde al comprador de la orden y la metadata guarda:

- `order_id`
- `source`: `mercadopago-webhook` o `mercadopago-payment-sync`
- `previous`: estado anterior
- `next`: estado nuevo
- `mercado_pago.status`
- `mercado_pago.status_detail`
- `mercado_pago.external_reference`
- `mercado_pago.refunds`: resumen de reembolsos informado por Mercado Pago

El registro de auditoría es no bloqueante: si falla la inserción del audit, la actualización de la orden no se revierte. El error se informa en consola para diagnóstico server-side.

## Bloqueo del producto y venta única

La política de producto único se basa en `PRODUCT_LOCKING_ORDER_STATUSES`:

```text
approved
pending
partially_refunded
refund_pending
```

Los módulos que usan esta regla son:

- `src/lib/checkoutServer.js`
- `src/lib/soldProducts.js`
- `src/pages/api/mercadopago-webhook.js`
- `src/pages/api/mercadopago-payment-sync.js`
- `src/pages/api/my-sales-products.js`

Esto evita que un producto vuelva al catálogo mientras hay una operación aprobada, en reembolso pendiente o con reembolso parcial. Si la operación termina como rechazada, cancelada o reembolsada completa, deja de bloquear disponibilidad.

## Mis ventas

### Envío a cargo del vendedor

Para las órdenes nuevas, solicitar envío no agrega un cargo al comprador. La orden conserva
`shipping_requested=true`, los datos de entrega y el circuito de preparación/despacho, pero guarda
`shipping_cost=0`. La preferencia de Mercado Pago contiene únicamente productos y la comisión del
marketplace se calcula sobre ese subtotal. Los importes de envío de órdenes históricas se conservan
y continúan mostrándose como fueron registrados.

Al publicar un producto, el retiro en el domicilio del vendedor se incorpora automáticamente y no
se presenta como una casilla opcional. El único checkbox de entrega permite reemplazar el retiro por
envío; las modalidades no se acumulan.

Mis ventas conserva los datos propios de la operación: cliente, fecha, orden, entrega, costo de envío, estado y detalle de pago.

La visibilidad del historial usa `SALES_HISTORY_ORDER_STATUSES`:

```text
pending
approved
partially_refunded
refund_pending
refunded
rejected
cancelled
canceled
```

El despacho sólo se permite con `approved`. Para cualquier otro estado, la card muestra el estado de pago y pausa las acciones de preparación/despacho. En particular:

- `pending`: “Esperando confirmación de pago”. Reserva el producto, pero no permite despacho.
- `refund_pending`: “Pausada por reembolso pendiente”.
- `partially_refunded`: visible como reembolso parcial, sin despacho.
- `refunded`, `cancelled`, `rejected`: visibles como historial, sin despacho.

El indicador verde de acción pendiente usa `src/lib/salePendingAction.js` y ahora ignora ventas que no estén aprobadas. Esto evita mostrar “algo para despachar” cuando no hay nada despachable.

## Mis compras y Detalle de compra

Mis compras y la factura/detalle imprimible leen el estado normalizado con `normalizePaymentStatus` y `getPaymentStatusLabel`.

El comprador ve:

- Estado de pago.
- Movimiento legible cuando existe, sin exponer la traza técnica completa.
- Pago o referencia de pago.
- Estado de entrega sólo cuando corresponde.

Para `refund_pending`, la entrega se muestra pausada por reembolso pendiente. Para pagos cancelados, rechazados o reembolsados, el detalle evita presentar retiro o entrega como si estuvieran pendientes.

## Confirmación de compra

`src/scripts/confirmation.js` reconoce `refund_pending` y `partially_refunded`. Si el webhook todavía no impactó, la sincronización de respaldo llama a `/api/mercadopago-payment-sync` y muestra el estado actualizado al usuario.

## Seguridad de APIs

### Lectura JSON limitada

`src/lib/serverRequest.js` agrega `readJsonBody(request, { maxBytes, emptyValue })`.

La función:

- Rechaza cuerpos cuyo `content-length` excede el límite.
- Lee el stream con límite real de bytes aunque el header no exista o sea incorrecto.
- Devuelve error controlado para JSON inválido.
- Permite cuerpos vacíos sólo cuando el endpoint lo define explícitamente.

Se reemplazó `request.json()` directo en APIs que reciben datos del usuario o callbacks externos:

- `src/pages/api/audit.js`
- `src/pages/api/checkout-manual.js`
- `src/pages/api/checkout.js`
- `src/pages/api/mercadopago-payment-sync.js`
- `src/pages/api/mercadopago-webhook.js`
- `src/pages/api/purchase-delivery.js`
- `src/pages/api/purchase-fulfillment.js`
- `src/pages/api/purchase-pickup.js`
- `src/pages/api/sales-dispatch.js`
- `src/pages/api/sold-products.js`

### Headers de respuesta

`src/lib/apiResponse.js` agrega por defecto:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Esto aplica a respuestas JSON generadas con los helpers comunes.

### Rate limit

Se reforzaron límites por endpoint sensible:

- `/api/checkout`: `checkout`, 20 solicitudes por minuto.
- `/api/mercadopago-payment-sync`: `mp-payment-sync`, 30 solicitudes por minuto.
- `/api/audit`: `audit`, 60 solicitudes por minuto.
- `/api/mp-oauth`: `mp-oauth-callback`, 60 solicitudes por minuto.

Los límites existentes en otros endpoints se mantienen.

La implementación actual guarda los contadores en memoria. Reduce ráfagas dentro de una instancia, pero no constituye un límite global entre múltiples instancias serverless de Vercel. Sigue pendiente migrarla a almacenamiento distribuido.

### OAuth Mercado Pago

`src/lib/mercadopagoOAuthState.js` ya no usa un estado fijo de desarrollo. El estado OAuth se firma con secreto derivado de variables privadas disponibles en backend.

Comportamiento actual:

- `createMercadoPagoOAuthState()` falla si no hay secreto disponible.
- `verifyMercadoPagoOAuthState()` devuelve inválido si no hay secreto disponible.
- `/api/mercadopago/oauth/connect` exige poder firmar el estado antes de redirigir a Mercado Pago.
- `/api/mp-oauth` exige poder verificar el estado antes de intercambiar el código.
- El intercambio de token con Mercado Pago tiene timeout server-side.

Variables relevantes:

- `MERCADOPAGO_CLIENT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

## Pruebas agregadas o actualizadas

Pruebas específicas:

```powershell
node --test tests\paymentStatus.test.mjs tests\salePendingAction.test.mjs tests\purchaseDetail.test.mjs tests\serverRequest.test.mjs tests\mercadopagoOAuthState.test.mjs tests\purchaseProvider.test.mjs
```

Último resultado observado durante este mantenimiento:

```text
22 tests passed
```

La ejecución completa más reciente del 11 de octubre de 2026 terminó con 115 pruebas aprobadas y 0 fallos; las pruebas nuevas de control administrativo no sustituyen pruebas reales de pagos. El usuario ejecutó las migraciones comerciales y la migración administrativa 2A; sus auditorías no mostraron anomalías. El build, el despliegue y las pruebas visuales todavía no fueron ejecutados.

## Evidencia real conservada

Existe evidencia concordante de una compra real anterior al reinicio comercial, identificada públicamente sólo por la referencia interna corta `3478D967`:

- El registro histórico conservado por el usuario indica ARS 1.000, orden y pago aprobados, `marketplace_fee:1`, campo `marketplace` omitido, OAuth del vendedor y `mp_status_detail:accredited`.
- La captura de Mercado Pago muestra la venta por ARS 1.000, un pago de ARS 999 al vendedor, ARS 1 como total de la operación para AnuBorns y estado aprobado.
- La operación también quedó registrada como entrega coordinada/retiro completado.

Estas evidencias validan el pago, el split y la comisión de ARS 1 para esa operación concreta. No dependen únicamente de que OAuth figure conectado. El correo aportado contiene la consulta enviada a Mercado Pago, no una respuesta oficial de soporte.

Además existe evidencia concordante de una compra real posterior al reinicio, documentada sólo con la referencia corta `C3ADE956`:

- Supabase conserva una orden de ARS 500 con `status=approved`, `payment_status=approved`, `mp_status_detail:accredited` y traza de preferencia OAuth con `marketplace_fee:8`.
- La cuenta de AnuBorns muestra la venta por ARS 500, ARS 492 transferidos al vendedor, ARS 8 para la plataforma y estado aprobado.
- La cuenta del vendedor muestra la misma referencia y operación, ARS 500 brutos, estado aprobado y ARS 470,49 programados para acreditación.
- Los ARS 21,51 entre el importe posterior al split y el neto programado corresponden a un costo adicional de Mercado Pago cuyo concepto exacto requiere abrir el desglose del vendedor; no son comisión de AnuBorns.
- El cálculo configurado al 1,5% produce ARS 7,50 sobre ARS 500, pero el código redondea y envía ARS 8. La evidencia confirma el comportamiento actual, no un porcentaje efectivo exacto para importes pequeños.

La base actual no permite reconstruir el orden exacto de los eventos de la compra histórica porque después se ejecutó el reinicio controlado. La operación nueva sí conserva la fila local, pero todavía falta revisar su `audit_logs` para saber si la aprobación entró primero por webhook o sincronización de retorno. Tampoco existe evidencia de un reembolso real total o parcial procesado de punta a punta.

## Validación pendiente antes de producción

La compra posterior al reinicio confirma la repetibilidad del pago, split y comisión. Queda pendiente cerrar el circuito de reembolso y las variantes no aprobadas:

1. Conservar la vista del comprador y confirmar Mis compras/Detalle de compra para la operación aprobada.
2. Revisar `audit_logs` para identificar si impactó primero el webhook o la sincronización de retorno.
3. Simular o ejecutar, sólo con autorización explícita, un reembolso/cancelación controlada.
4. Confirmar transición a `refund_pending`, `partially_refunded` o `refunded` según lo que Mercado Pago informe.
5. Confirmar que el vendedor no ve indicador verde ni acciones de despacho para ventas no aprobadas.
6. Confirmar que el producto se libera sólo cuando el estado final lo permite.
7. Probar un pago realmente pendiente y uno rechazado en un escenario controlado. Una orden local sin `payment_id` no alcanza para esa validación.
8. Decidir si la comisión debe conservar el redondeo a pesos enteros o representar exactamente el 1,5% con centavos.

No generalizar el funcionamiento de reembolsos, rechazos o contracargos a partir de las compras aprobadas. Pago, split y comisión ya están validados; el flujo de reembolso real continúa pendiente.

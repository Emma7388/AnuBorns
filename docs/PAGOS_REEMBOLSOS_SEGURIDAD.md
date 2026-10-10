# Pagos, reembolsos y seguridad

Actualizado el 10 de octubre de 2026.

Este documento describe el comportamiento vigente del checkout de productos, la sincronización con Mercado Pago, los estados internos de pago, el bloqueo de productos, la visibilidad en compras/ventas y las defensas agregadas en las APIs. No contiene credenciales.

## Alcance

El flujo sigue siendo de producto único por compra y de un solo vendedor por checkout. La preferencia de Mercado Pago se crea con el token OAuth del vendedor conectado y la comisión de AnuBorns se informa como `marketplace_fee` cuando corresponde.

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

La regla intencional es reservar el producto mientras el pago está pendiente para reducir carreras entre dos checkouts simultáneos. También se conserva bloqueado cuando el dinero todavía está en un estado intermedio de devolución (`refund_pending`) o cuando el reembolso fue parcial (`partially_refunded`). Cuando el pago queda finalmente cancelado, rechazado o reembolsado completo, el producto deja de estar bloqueado por esa orden.

La garantía final vive en PostgreSQL. `product_checkout_reservations.product_id` es único y sus triggers crean o liberan la reserva al cambiar órdenes o ítems. `create_checkout_order_atomic(...)` bloquea los productos, revalida sus datos y persiste orden + ítems en una misma transacción. La validación previa de JavaScript mejora el mensaje al usuario, pero no es la autoridad de concurrencia.

Antes de validar disponibilidad, el checkout cancela reservas `pending` antiguas sin `payment_id` para que un intento abandonado no bloquee indefinidamente una nueva compra.

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

También se ejecutó chequeo de sintaxis sobre los archivos JavaScript modificados y `git diff --check`. No se ejecutó build.

## Evidencia real conservada

Existe evidencia concordante de una compra real anterior al reinicio comercial, identificada públicamente sólo por la referencia interna corta `3478D967`:

- El registro histórico conservado por el usuario indica ARS 1.000, orden y pago aprobados, `marketplace_fee:1`, campo `marketplace` omitido, OAuth del vendedor y `mp_status_detail:accredited`.
- La captura de Mercado Pago muestra la venta por ARS 1.000, un pago de ARS 999 al vendedor, ARS 1 como total de la operación para AnuBorns y estado aprobado.
- La operación también quedó registrada como entrega coordinada/retiro completado.

Estas evidencias validan el pago, el split y la comisión de ARS 1 para esa operación concreta. No dependen únicamente de que OAuth figure conectado. El correo aportado contiene la consulta enviada a Mercado Pago, no una respuesta oficial de soporte.

La base actual no permite reconstruir el orden exacto de los eventos porque después se ejecutó el reinicio controlado que eliminó las órdenes y su auditoría comercial. Tampoco existe todavía evidencia de un reembolso real total o parcial procesado de punta a punta.

## Validación pendiente antes de producción

La compra histórica ya valida una ejecución real del pago, split y comisión. Falta comprobar la repetibilidad y el circuito de reembolso en el ambiente real o de prueba elegido:

1. Repetir una compra controlada con vendedor conectado.
2. Aprobar el pago y confirmar nuevamente el neto del vendedor y la comisión de AnuBorns.
3. Confirmar que el producto sale del catálogo y que Mis compras y Mis ventas reciben la venta aprobada.
4. Conservar la orden y revisar `audit_logs` para identificar si impactó primero el webhook o la sincronización de retorno.
5. Simular o ejecutar un reembolso/cancelación controlada.
6. Confirmar transición a `refund_pending`, `partially_refunded` o `refunded` según lo que Mercado Pago informe.
7. Confirmar que el vendedor no ve indicador verde ni acciones de despacho para ventas no aprobadas.
8. Confirmar que el producto se libera sólo cuando el estado final lo permite.

No generalizar el funcionamiento de toda la integración a partir de una única compra. El split quedó validado para esa operación; el flujo de reembolso real continúa pendiente.

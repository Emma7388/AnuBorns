# Mercado Pago WCS-48349: prueba propuesta no ejecutada

Documento para enviar a Mercado Pago sobre el ticket `WCS-48349`.

## Contexto

Mercado Pago informó que corrigió el error reportado para Checkout Pro Split 1:1, donde no se creaba el pago al incluir `marketplace_fee`.

En AnuBorns, el backend crea la preferencia de Checkout Pro con:

- Access token OAuth del vendedor conectado.
- `marketplace_fee` cuando la comisión configurada es mayor a cero.
- Campo `marketplace` omitido por defecto, salvo confirmación explícita de Mercado Pago.

Configuración local observada para la prueba:

- `MERCADOPAGO_SEND_MARKETPLACE_FIELD=false`
- `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=1`
- `MERCADOPAGO_MARKETPLACE_FEE_PERCENT=0`

## Prueba que se iba a realizar

La intención era ejecutar una prueba mínima de creación de preferencia, sin abrir Checkout Pro y sin realizar un pago:

1. Leer desde Supabase una cuenta de vendedor conectada por OAuth.
2. Validar que el token OAuth vigente correspondiera al `mp_user_id` guardado mediante `GET https://api.mercadopago.com/users/me`.
3. Crear una preferencia de prueba contra `POST https://api.mercadopago.com/checkout/preferences`.
4. Enviar un item de bajo importe nominal, por ejemplo ARS 100.
5. Incluir `marketplace_fee: 1`.
6. No enviar el campo `marketplace`.
7. Registrar solamente si Mercado Pago respondía con `id` de preferencia e `init_point`.

El objetivo técnico era confirmar si Mercado Pago ya acepta la creación de preferencia con `marketplace_fee` usando el token OAuth del vendedor, que era el punto fallido del ticket.

## Límite importante

Esta prueba no debía completar un pago real.

Crear una preferencia no implica cobrar, pero sí crea un recurso de Checkout Pro asociado al token OAuth utilizado. Por ese motivo, no corresponde hacerla con una cuenta de vendedor real que no pertenezca a AnuBorns o que no haya autorizado expresamente esta validación.

Se agregó una defensa local para evitar repetir ese patrón en futuros diagnósticos: cualquier herramienta interna que intente crear recursos de prueba en Mercado Pago debe usar `src/lib/mercadopagoDiagnosticsSafety.js`. Ese helper bloquea por defecto y sólo permite continuar si:

- `MERCADOPAGO_DIAGNOSTIC_MODE=true`.
- La cuenta está incluida explícitamente en `MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS` o `MERCADOPAGO_DIAGNOSTIC_ALLOWED_MP_USER_IDS`.
- La prueba identifica una cuenta concreta; no puede elegir automáticamente cualquier vendedor conectado.

Para que la prueba sea válida y segura, Mercado Pago debería indicar o proveer una de estas alternativas:

- Cuentas de prueba oficiales para marketplace y vendedor.
- Una cuenta vendedora controlada por AnuBorns y autorizada para pruebas.
- Un procedimiento de validación desde el lado de Mercado Pago sin crear recursos sobre cuentas de terceros.

## Estado real de ejecución

La prueba externa no fue ejecutada.

El intento inicial falló antes de consultar Mercado Pago porque el entorno local bloqueó la red al intentar leer Supabase. Luego se solicitó permiso para habilitar red y ejecutar la prueba, pero ese permiso fue rechazado. Por lo tanto:

- No se creó ninguna preferencia de Mercado Pago desde esta prueba.
- No se abrió ningún `init_point`.
- No se realizó ningún pago.
- No se operó sobre ninguna cuenta de vendedor mediante esta prueba.

## Payload sanitizado de referencia

El cuerpo de preferencia que se pretendía validar era equivalente a:

```json
{
  "items": [
    {
      "id": "wcs-48349-split-test",
      "title": "AnuBorns prueba split soporte WCS-48349",
      "quantity": 1,
      "unit_price": 100,
      "currency_id": "ARS"
    }
  ],
  "external_reference": "anuborns-wcs-48349-{timestamp}",
  "back_urls": {
    "success": "https://anuborns.vercel.app/compra-confirmada?status=approved&mp_test=1",
    "failure": "https://anuborns.vercel.app/compra-confirmada?status=rejected&mp_test=1",
    "pending": "https://anuborns.vercel.app/compra-confirmada?status=pending&mp_test=1"
  },
  "auto_return": "approved",
  "statement_descriptor": "ANUBORNS",
  "marketplace_fee": 1
}
```

El header `Authorization` usaría `Bearer {access_token_oauth_del_vendedor}`, que no debe compartirse.

## Consulta para Mercado Pago

Antes de repetir la prueba, necesitamos confirmar:

1. Si la creación de una preferencia con `marketplace_fee` debe hacerse únicamente con cuentas de prueba oficiales.
2. Si Mercado Pago puede validar el caso `marketplace_fee` sin requerir operar sobre una cuenta real de un tercero.
3. Si para Split 1:1 Checkout Pro corresponde seguir omitiendo el campo `marketplace` y enviar sólo `marketplace_fee`.
4. Qué evidencia esperan recibir para cerrar el ticket sin hacer un pago real.

## Evidencia local disponible

Las pruebas locales de código pasaron correctamente y validan que la integración arma el flujo esperado:

- El checkout valida un único vendedor por compra.
- El token OAuth del vendedor se valida contra `/users/me`.
- La traza interna conserva `marketplace_fee`.
- `marketplace` queda omitido cuando `MERCADOPAGO_SEND_MARKETPLACE_FIELD=false`.

Esto no reemplaza una validación de Mercado Pago, pero confirma que el request esperado desde AnuBorns es consistente con el caso reportado.

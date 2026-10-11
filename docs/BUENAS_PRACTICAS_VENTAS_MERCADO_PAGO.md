# Buenas prácticas de venta y brechas de AnuBorns

Actualizado el 11 de octubre de 2026.

Este documento resume el material aportado sobre promoción, conversión, abandono de carrito, cuotas, aprobación de pagos, reclamos, contracargos y envíos. Lo contrasta con el código actual de AnuBorns para convertir consejos generales en un plan concreto. No reproduce los artículos completos ni reemplaza las condiciones comerciales, legales o técnicas vigentes de Mercado Pago.

El proyecto está actualmente en la **etapa macro 2 — base de datos, panel administrativo, seguridad operativa y validación**. El plan comercial de este documento pertenece a la etapa macro 3 y no se considera iniciado. Para evitar confundir ambas numeraciones, sus divisiones internas se denominan “fases comerciales”.

## Objetivo

El objetivo aplicable a AnuBorns es aumentar la conversión sin debilitar la seguridad ni trasladar costos o responsabilidades de forma silenciosa a los vendedores. Para medirlo no alcanza con sumar funciones: hay que poder observar el recorrido completo desde la visita al producto hasta el pago aprobado, la entrega y los reclamos posteriores.

## Resumen del material

Las recomendaciones se agrupan en seis ideas:

1. **Atraer tráfico calificado.** Compartir el catálogo en redes, WhatsApp, comunidades y colaboraciones; usar contenidos, promociones y publicidad segmentada.
2. **Reducir fricción.** Mostrar precio, entrega y condiciones con claridad; pedir sólo los datos necesarios; mantener un checkout corto y estable.
3. **Ofrecer alternativas de pago.** Checkout Pro permite exponer los medios disponibles en Mercado Pago y limitar la cantidad máxima de cuotas. Las cuotas sin interés constituyen una promoción cuyo costo absorbe el comercio que las ofrece.
4. **Recuperar intención de compra.** Recordatorios de carrito, productos relacionados y promociones pueden ayudar, pero únicamente para usuarios que hayan consentido recibir comunicaciones.
5. **Transmitir confianza.** Reseñas verificadas, canales de contacto, políticas de devolución, información de entrega y una descripción reconocible del cargo reducen dudas y disputas.
6. **Prevenir problemas posteriores.** Conservar comprobantes, registrar estados de entrega, responder reclamos rápido y recibir alertas de fraude o contracargos.

## Qué ya tiene AnuBorns

### Pago y seguridad

- Checkout Pro con redirección al entorno de Mercado Pago.
- Preferencia creada con el token OAuth del vendedor y comisión marketplace objetivo del 1,5%.
- Ítems, importes, moneda y vendedor reconstruidos y validados en el servidor.
- Reserva atómica del producto para evitar ventas simultáneas conflictivas.
- `back_urls` para pago aprobado, rechazado o pendiente, `auto_return: approved`, webhook y sincronización de retorno.
- Firma del webhook validada y actualizaciones idempotentes de estados de pago.
- `statement_descriptor: ANUBORNS`, que ayuda a reconocer el cargo, sujeto a cómo lo procese Mercado Pago y el emisor.
- Estados de rechazo, pago pendiente, cancelación y reembolso reflejados en la aplicación.
- Auditoría local de cambios de pago y traza de `marketplace_fee`.
- Compra real posterior al reinicio con ARS 500 aprobados, ARS 8 acreditados a AnuBorns y evidencia concordante en Supabase, cuenta de la plataforma y cuenta del vendedor.

### Compra y entrega

- Carrito persistente y protección contra duplicados.
- Un vendedor por checkout, evitando un split ambiguo entre múltiples cuentas.
- Retiro o envío como modalidades excluyentes para publicaciones nuevas; si existe envío, no se procesa como retiro.
- Envío a cargo del vendedor, sin sumarlo al total cobrado al comprador.
- Seguimiento interno de preparación, envío, entrega o retiro coordinado.
- Datos principales del comprador precargados desde su perfil.

### Visibilidad y medición básica

- Catálogo por categorías, búsqueda, ubicación, productos destacados y perfil público del vendedor.
- Vercel Web Analytics para páginas, visitas, referentes, países y dispositivos.
- Panel administrativo de salud, operación de pagos y comisión marketplace.

## Brechas encontradas

### 1. Falta un embudo de conversión medible — prioridad alta

La analítica actual cuenta tráfico, pero no permite calcular con precisión:

- vista de producto → agregado al carrito;
- carrito → inicio de checkout;
- inicio de checkout → redirección a Mercado Pago;
- intento → aprobado, pendiente o rechazado;
- abandono por etapa, dispositivo, página o vendedor.

Sin este embudo no se puede afirmar qué cambio reduce el abandono ni hacer pruebas A/B con una métrica confiable. Los eventos deben evitar datos personales y usar identificadores internos o agregados.

### 2. Cuotas sin interés todavía no están definidas — prioridad alta

La preferencia actual no envía `payment_methods.installments`, por lo que AnuBorns no fija un máximo propio. Checkout Pro ofrece por defecto los medios que Mercado Pago habilita para esa operación.

Agregar `payment_methods.installments` permitiría limitar el máximo de cuotas, pero **no convierte por sí solo las cuotas en cuotas sin interés**. El material aportado indica que la promoción sin interés se activa en la cuenta del comercio y que el comercio absorbe su costo.

En AnuBorns la preferencia se crea con el token OAuth del vendedor. Por eso, antes de ofrecer o anunciar cuotas sin interés, se debe validar con Mercado Pago:

1. si la promoción se configura por cada cuenta vendedora;
2. qué vendedor puede activarla y qué requisitos debe cumplir;
3. qué costo exacto se descuenta al vendedor;
4. si el costo afecta o no la base y acreditación del `marketplace_fee`;
5. cómo se refleja en un reembolso total o parcial;
6. qué ocurre cuando un vendedor no tiene la promoción habilitada.

No se debe mostrar “cuotas sin interés” en AnuBorns hasta verificarlo con una cuenta de prueba o una operación controlada y conservar evidencia del desglose.

### 3. Pago y comisión validados; reembolso pendiente — prioridad alta

El código contempla aprobación, rechazo, pendiente, cancelación y reembolso. Además de la evidencia histórica, una compra posterior al reinicio confirmó ARS 500 aprobados, la preferencia OAuth, la persistencia local, ARS 8 de `marketplace_fee` acreditados a AnuBorns y la operación correspondiente en la cuenta del vendedor.

La configuración es 1,5%, pero el cálculo redondea ARS 7,50 a ARS 8; por eso el porcentaje efectivo de esa compra fue 1,6%. Falta decidir si se conserva el redondeo entero o se admiten centavos.

Todavía falta ejecutar y conservar una prueba controlada que cubra:

- vista postpago del comprador;
- orden de impacto entre webhook y sincronización de retorno;
- pago realmente pendiente y pago rechazado;
- reembolso total o parcial;
- liberación o bloqueo correcto del producto;
- consistencia del reembolso entre Mercado Pago, `orders`, `order_items`, despachos y `audit_logs`.

### 4. Reclamos, contracargos y alertas de fraude no tienen circuito propio — prioridad alta

El webhook actual procesa el tópico `payment` e ignora otros tópicos. Mercado Pago dispone de notificaciones opcionales para reclamos, contracargos y alertas de fraude. Falta:

- habilitar los tópicos correspondientes en la aplicación productiva;
- crear endpoints con validación de firma y deduplicación;
- vincular cada evento con el pago y la orden local;
- bloquear despacho o entrega ante una alerta relevante;
- avisar al administrador y al vendedor sin exponer datos sensibles;
- registrar evidencia, plazo de respuesta y resolución.

### 5. La entrega necesita más evidencia operativa — prioridad media/alta

AnuBorns registra estados de entrega, pero todavía no gestiona:

- plazo estimado y condiciones visibles antes del pago;
- costo logístico informado por el vendedor cuando corresponda;
- empresa, código o enlace de seguimiento;
- comprobante de despacho;
- constancia de recepción o formulario firmado;
- archivo de evidencia asociado a una disputa.

La integración de “Envíos de Mercado Libre con Link de Pago” descrita en el material no corresponde directamente al diseño actual. AnuBorns usa Checkout Pro marketplace y logística propia del vendedor, no Links de Pago ni generación automática de etiquetas. Adoptarla sería un proyecto de integración separado.

### 6. Faltan elementos de confianza — prioridad media

- Política pública de devoluciones y cancelaciones.
- Términos de compra y responsabilidades de comprador, vendedor y marketplace.
- Política de privacidad y explicación del uso de datos.
- Reseñas vinculadas únicamente a compras verificadas.
- Canal formal para reportar problemas y seguir un reclamo.
- Explicación visible de cómo aparecerá el cargo, después de comprobar el descriptor real en tarjetas de distintos emisores.

### 7. No existe recuperación consentida de carritos — prioridad media

El carrito puede persistir, pero no hay favoritos, recordatorios ni campañas. Antes de implementarlos se necesita:

- consentimiento explícito y revocable para comunicaciones comerciales;
- preferencia de canal y frecuencia;
- vencimiento de la intención de compra;
- proceso de baja;
- exclusión inmediata de carritos ya comprados o productos no disponibles;
- proveedor de correo o mensajería y registro de entregas/fallos.

No corresponde contactar compradores sólo porque dejaron un producto en el carrito.

### 8. Promociones y difusión todavía son externas — prioridad media/baja

No hay cupones, descuentos, 2×1, enlaces compartibles con seguimiento, favoritos, recomendaciones, reseñas ni campañas. Antes de construirlos conviene medir el embudo base; de lo contrario no se sabrá si mejoran conversión o sólo reducen margen.

## Plan recomendado

### Fase comercial 1 — confiabilidad y medición

1. Completar el reembolso controlado pendiente y conservar la vista del comprador; la compra, el split y la comisión ya fueron revalidados.
2. Instrumentar el embudo de conversión sin información personal.
3. Crear un tablero con tasa de agregado, inicio de checkout, aprobación, rechazo y abandono.
4. Configurar y procesar reclamos, contracargos y alertas de fraude.

### Fase comercial 2 — claridad comercial

1. Publicar políticas de devolución, privacidad y términos de compra.
2. Mostrar modalidad, plazo y condiciones de entrega antes del checkout.
3. Incorporar seguimiento y evidencia de entrega.
4. Verificar cómo aparece `ANUBORNS` en el resumen real de tarjeta.

### Fase comercial 3 — cuotas

1. Confirmar con Mercado Pago el modelo de costos para vendedores OAuth.
2. Probar un vendedor habilitado y otro no habilitado.
3. Definir si el máximo de cuotas será global, por vendedor o por publicación.
4. Recién entonces agregar configuración, interfaz y textos comerciales.

### Fase comercial 4 — crecimiento

1. Enlaces para compartir productos y atribución de campaña.
2. Favoritos y alertas de disponibilidad.
3. Recuperación de carrito sólo con consentimiento.
4. Reseñas de compras verificadas.
5. Cupones y experimentos A/B con margen y conversión medidos.

## Definición de terminado para este objetivo

El objetivo no debería considerarse completo hasta que:

- exista un embudo medible desde producto hasta pago aprobado;
- pago y comisión permanezcan validados, y el reembolso quede validado en un entorno controlado;
- una promoción de cuotas indique quién absorbe el costo y haya sido probada con vendedores OAuth;
- reclamos, contracargos y alertas de fraude puedan detener una entrega;
- entrega y recepción conserven evidencia;
- políticas y comunicaciones comerciales sean claras y consentidas.

## Fuentes y alcance

Material aportado por el usuario:

- “Herramientas para promocionar tus productos online”.
- “Incrementá tus ventas ofreciendo cuotas sin interés”.
- “Cómo garantizar que el cliente finalice la compra”.
- “5 consejos para disminuir el abandono del carrito de compras”.
- “Qué es la aprobación y cómo mejorarla”.
- “Cómo evitar reclamos y contracargos”.
- “Tácticas para vender en Instagram con Link de Pago”.
- “Sumá Envíos de Mercado Libre a tus ventas con Link de Pago”.

Documentación oficial revisada el 10 de octubre de 2026:

- [Crear y configurar una preferencia de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/create-payment-preference).
- [Configurar medios de pago y máximo de cuotas](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/checkout-customization/preferences/payment-methods).
- [Integrar un checkout marketplace con OAuth](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/how-tos/integrate-marketplace?scope=prod).
- [Configurar URLs de retorno](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/configure-back-urls).
- [Notificaciones opcionales: reclamos, contracargos y fraude](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/optional-notifications?scope=prod).
- [Pruebas de Checkout Pro](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/integration-test/test-purchases).

Los costos, requisitos comerciales y opciones visibles en la cuenta de Mercado Pago pueden cambiar. Deben verificarse nuevamente antes de activar promociones o publicar importes.

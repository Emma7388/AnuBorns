# Panel admin operativo

El panel interno arranca con dos superficies:

- `/admin`: tablero operativo read-only con estados OK, Revisar y Error.
- `/admin/usuarios`: administracion read-only de usuarios, perfiles y estado Mercado Pago.

## Seguridad base

- El acceso se valida en APIs server-side con `requireAdmin`.
- El navegador nunca recibe `SUPABASE_SERVICE_ROLE_KEY`, tokens OAuth ni secretos de Mercado Pago.
- El rol admin sale de `public.admin_users` o, como respaldo operativo, de `ADMIN_USER_IDS` / `ADMIN_EMAILS`.
- Las acciones peligrosas quedan fuera del MVP: no borrar usuarios, no reembolsar, no tocar pagos, no editar tokens.

## Estados

- OK: pieza operativa disponible.
- Revisar: la pieza existe, pero requiere decision humana o confirmacion externa.
- Error: falta configuracion, tabla o permiso necesario.

## Chequeos iniciales del tablero

### Admin

- Acceso admin actual.
- Tabla `admin_users`.

### Supabase

- `PUBLIC_SUPABASE_URL`.
- `PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- Cliente server disponible.

### Usuarios

- Tabla `profiles`.
- Lectura de perfiles profundos para administracion interna.

### Catalogo

- Tabla `products`.
- Relacion producto-vendedor por `user_id`.

### Checkout y compras

- `SITE_URL` presente y HTTPS.
- Tabla `orders`.
- Tabla `order_items`.
- Checkout Pro con piezas minimas: `SITE_URL`, Mercado Pago, `orders`, `order_items`, `products`, `seller_mercadopago_accounts`.
- Carrito multiproveedor: finalizar un vendedor por vez y validar en servidor.

### Mercado Pago

- `MERCADOPAGO_ACCESS_TOKEN`.
- `MERCADOPAGO_WEBHOOK_SECRET`.
- Webhook con firma y tablas de impacto disponibles.
- `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT`.
- `MERCADOPAGO_MARKETPLACE_FEE_PERCENT`.
- `MERCADOPAGO_SEND_MARKETPLACE_FIELD`.
- `MERCADOPAGO_MARKETPLACE_ID`.

Regla: la comision va por `marketplace_fee`. El campo `marketplace` queda omitido salvo confirmacion explicita de Mercado Pago.

### Mercado Pago OAuth vendedores

- `MERCADOPAGO_CLIENT_ID`.
- `MERCADOPAGO_CLIENT_SECRET`.
- `MERCADOPAGO_OAUTH_REDIRECT_URI`.
- Tabla `seller_mercadopago_accounts`.

### Ventas y entregas

- Tabla `sale_dispatches`.
- Tabla `purchase_status_reads`.

### Auditoria

- Tabla `audit_logs`.
- Trazabilidad de eventos criticos.

## Posibilidades futuras documentadas

Estas son las funciones posibles para sumar al panel, en orden prudente:

1. Usuarios
   - Buscar por email, nombre, DNI, telefono.
   - Ver compras, ventas, productos publicados y estado MP.
   - Editar datos profundos con auditoria.
   - Bloquear acciones de usuario sin borrar cuenta.

2. Operacion
   - Ver ordenes pendientes, aprobadas, rechazadas y reembolsadas.
   - Detectar ordenes pendientes viejas.
   - Detectar productos vendidos que siguen visibles.
   - Detectar despachos faltantes despues de pagos aprobados.

3. Mercado Pago
   - Ver vendedores conectados/desconectados.
   - Detectar tokens OAuth vencidos o por vencer.
   - Ver compras con `payment_detail` incompleto.
   - Ver pagos aprobados sin movimiento en `audit_logs`.

4. Seguridad
   - Ver admins activos.
   - Ver eventos recientes de `audit_logs`.
   - Ver intentos rechazados por permisos.
   - Registrar cada accion admin con motivo.

5. Configuracion
   - Mostrar variables presentes/ausentes sin revelar valores.
   - Separar local vs produccion como revision manual.
   - Avisar si `MERCADOPAGO_SEND_MARKETPLACE_FIELD=true`.

6. Acciones controladas
   - Reprocesar sincronizacion de una orden puntual.
   - Marcar seguimiento de entrega.
   - Editar perfil de usuario con diff y auditoria.
   - Nunca ejecutar cobros, reembolsos o despliegues sin confirmacion explicita.

## Revisión de produccion

El panel muestra el entorno donde corre. Para produccion hay que revisar en Vercel:

- Variables `PUBLIC_*`, Supabase server y Mercado Pago.
- Que `SITE_URL` sea HTTPS y corresponda al dominio real.
- Que el webhook configurado en Mercado Pago apunte al dominio real.
- Que `MERCADOPAGO_SEND_MARKETPLACE_FIELD=false`, salvo confirmacion formal de Mercado Pago.
- Que `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=1` si la comision fija de ARS 1 sigue siendo la configuracion buscada.

# Panel admin operativo

El panel interno tiene tres superficies:

- `/admin`: tablero operativo read-only con estados OK, Revisar y Error.
- `/admin/administracion`: resumen administrativo del `marketplace_fee` registrado localmente.
- `/admin/usuarios`: administración de usuarios, perfiles, roles, suspensiones, administradores activos, auditoría reciente y estado Mercado Pago.

## Etapa 2A — Control administrativo base

Implementada localmente el 11 de octubre de 2026. `docs/supabase-admin-control.sql` fue ejecutado y auditado remotamente ese día; para activarla en producción todavía hay que desplegar el código y validar las acciones con cuentas de prueba.

Incluye:

- otorgar o quitar roles almacenados en `public.admin_users` sin ejecutar SQL manual por cada cambio;
- suspender y restaurar cuentas sin eliminarlas mediante `public.admin_user_controls` y el bloqueo de Supabase Auth;
- listar administradores activos e indicar si el permiso proviene de base, Vercel o ambas fuentes;
- mostrar los eventos administrativos recientes de `audit_logs` sin enviar IP, user agent, secretos ni diffs completos al navegador;
- exigir un motivo de al menos seis caracteres para roles, suspensión, restauración, edición de perfil y restablecimiento de contraseña;
- registrar solicitud y resultado de cada acción antes y después de la mutación.

## Seguridad base

- El acceso se valida en APIs server-side con `requireAdmin`.
- El navegador nunca recibe `SUPABASE_SERVICE_ROLE_KEY`, tokens OAuth ni secretos de Mercado Pago.
- El rol admin sale de `public.admin_users` o, como respaldo operativo, de `ADMIN_USER_IDS` / `ADMIN_EMAILS`.
- No se permite auto-suspensión ni auto-remoción de rol, suspender administradores, quitar el último administrador persistido ni retirar desde el panel un rol que proviene de Vercel. Las RPC `set_admin_user_role_controlled(...)` y `set_admin_user_suspension_controlled(...)` comparten un bloqueo transaccional: dos remociones simultáneas no pueden dejar la tabla sin administradores y tampoco se puede otorgar un rol mientras otra operación suspende la misma cuenta.
- Una suspensión se comprueba en las APIs antes de autorizar cualquier operación. También aplica un `ban_duration` en Supabase Auth para impedir nuevos ingresos o renovaciones; un access token ya emitido sólo queda inmediatamente bloqueado en las rutas de la aplicación que usan la guarda server-side.
- Las acciones peligrosas quedan fuera del alcance: no borrar usuarios, no reembolsar, no tocar pagos, no editar tokens.

## Estados

Los contadores de `/admin` resumen chequeos operativos, no cantidad de usuarios.
El tablero agrupa los chequeos en solapas por proceso; cada solapa contiene las etapas de validacion de ese proceso.

- OK: pieza operativa disponible.
- Revisar: la pieza existe, pero requiere decision humana o confirmacion externa.
- Error: falta configuracion, tabla o permiso necesario.

## Chequeos iniciales del tablero

### Admin

- Acceso admin actual.
- Tabla `admin_users`.
- Tabla `admin_user_controls` y chequeo conjunto de roles, suspensión y auditoría 2A.

### Supabase

- `PUBLIC_SUPABASE_URL`.
- `PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- Cliente server disponible.
- Mediciones read-only del servidor via Metrics API cuando estan configuradas `SUPABASE_PROJECT_REF` y `SUPABASE_METRICS_SECRET_KEY`.
- La lectura de mediciones es manual desde el boton `Consultar`; la carga inicial del panel no llama a Metrics API.
- Las mediciones visibles incluyen memoria, swap, disco, carga, I/O en curso, conexiones reportadas y reinicios de Postgres. El navegador no recibe la clave de metricas.
- El bloque `Uso del plan` muestra como tarjetas solo las cuotas que puede leer sin consultas costosas: database size, monthly active users y file storage cuando estan disponibles. Egress, Log ingestion y Log Query quedan agrupados como referencia de Supabase Usage porque no conviene consultarlos desde la app.

### Vercel

- `VERCEL_ANALYTICS_TOKEN`.
- `VERCEL_ANALYTICS_PROJECT_ID`.
- `VERCEL_ANALYTICS_TEAM_ID` cuando el proyecto pertenece a un team.
- La lectura de Web Analytics es manual desde el boton `Consultar`; la carga inicial del panel no llama a Vercel.
- El bloque muestra visitantes y page views de 7 y 30 dias, pagina principal, origen principal y rankings compactos de paginas, origenes, paises y dispositivos.
- El navegador no recibe el token de Vercel Analytics.

### Usuarios

- Tabla `profiles`.
- Lectura de perfiles profundos para administracion interna.
- La edicion admin escribe primero en `public.profiles` y sincroniza los mismos campos editables en `auth.users.user_metadata` para visibilidad operativa en Supabase Auth.
- `public.admin_user_controls` conserva el estado activo/suspendido, motivo, operador y fechas sin contaminar `profiles`.
- Los roles se administran mediante `/api/admin/users/access`; el `service_role` permanece sólo en el servidor.
- El restablecimiento de contraseña envía el correo de recuperación de Supabase sólo después de registrar la solicitud auditada.

### Catalogo

- Tabla `products`.
- Relacion producto-vendedor por `user_id`.

### Checkout y compras

- `SITE_URL` presente y HTTPS.
- Tabla `orders`.
- Tabla `order_items`.
- Checkout Pro con piezas minimas: `SITE_URL`, Mercado Pago, `orders`, `order_items`, `products`, `seller_mercadopago_accounts`.
- Carrito multiproveedor: finalizar un vendedor por vez y validar en servidor.
- El panel de administracion suma el `marketplace_fee` guardado en `orders.payment_detail`; no confirma por si solo la acreditacion real en Mercado Pago.
- La compra real posterior al reinicio confirmó externamente una comisión de ARS 8 para una venta de ARS 500. Esa evidencia proviene del desglose de Mercado Pago; no cambia la regla de que el panel local por sí solo sólo muestra trazas registradas.

### Mercado Pago

- `MERCADOPAGO_ACCESS_TOKEN`.
- `MERCADOPAGO_WEBHOOK_SECRET`.
- Webhook con firma y tablas de impacto disponibles.
- `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT`.
- `MERCADOPAGO_MARKETPLACE_FEE_PERCENT`.
- `MERCADOPAGO_SEND_MARKETPLACE_FIELD`.
- `MERCADOPAGO_MARKETPLACE_ID`.
- `MERCADOPAGO_DIAGNOSTIC_MODE`.

Regla: la comision va por `marketplace_fee`. El campo `marketplace` queda omitido salvo confirmacion explicita de Mercado Pago.

Regla de diagnostico: no se deben crear preferencias de prueba usando cuentas reales conectadas por OAuth. Cualquier diagnostico que cree recursos en Mercado Pago debe tener `MERCADOPAGO_DIAGNOSTIC_MODE=true` y una cuenta explicitamente permitida en la allowlist. En produccion, ese estado debe revisarse y apagarse al terminar.

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

## Estado del plan administrativo

Estas son las funciones del panel en orden prudente. Las marcadas como implementadas todavía requieren despliegue y validación cuando así se indique:

1. Usuarios
   - Implementado: buscar por email, nombre, DNI, teléfono.
   - Ver compras, ventas, productos publicados y estado MP.
   - Implementado: editar datos profundos con auditoría solicitada/completada/fallida.
   - Implementado localmente en 2A: bloquear acciones de usuario sin borrar cuenta.

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
   - La vista del propio vendedor ya consulta sus pagos pendientes con OAuth y diferencia preferencias sin intento. Sigue pendiente una vista central equivalente para administradores.
   - La publicación y el checkout ya bloquean discrepancias de nombre/apellido, email y DNI, con excepción para MP User ID `1157622469`. Sigue pendiente exponer ese diagnóstico en el panel admin.

4. Seguridad
   - Implementado localmente en 2A: ver y administrar admins activos.
   - Implementado localmente en 2A: ver eventos administrativos recientes de `audit_logs`.
   - Ver intentos rechazados por permisos.
   - Implementado localmente en 2A: registrar cada acción mutante del panel con motivo.

5. Configuracion
   - Mostrar variables presentes/ausentes sin revelar valores.
   - Separar local vs produccion como revision manual.
   - Avisar si `MERCADOPAGO_SEND_MARKETPLACE_FIELD=true`.
   - Mostrar si falta la configuracion de Metrics API sin bloquear el resto del panel.
   - Mostrar si falta la configuracion de Vercel Analytics sin bloquear el resto del panel.

6. Acciones controladas
   - Reprocesar sincronizacion de una orden puntual.
   - Marcar seguimiento de entrega.
   - Implementado: editar perfil de usuario con diff y auditoría.
   - Nunca ejecutar cobros, reembolsos o despliegues sin confirmacion explicita.

## Activación de la Etapa 2A

1. Completado: ejecutar `docs/supabase-admin-control.sql` en Supabase SQL Editor.
2. Completado: la auditoría devolvió dos administradores, RLS activo, cero suspensiones inválidas, privilegios vacíos para `authenticated` y ambas RPC con `service_role=true` / `authenticated=false`.
3. Pendiente: desplegar el código y entrar a `/admin/usuarios` con un administrador que no sea la cuenta elegida para la prueba.
4. Pendiente: otorgar y retirar un rol de base usando un motivo verificable.
5. Pendiente: suspender y restaurar una cuenta de prueba; confirmar que una API autenticada responde 403 durante la suspensión.
6. Pendiente: revisar que `audit_logs` contenga eventos `requested` y `completed` o `failed` para cada acción.
7. Regla permanente: no ejecutar estas pruebas sobre el último administrador persistido ni sobre permisos de Vercel.

## Revisión de produccion

El panel muestra el entorno donde corre. Para produccion hay que revisar en Vercel:

- Variables `PUBLIC_*`, Supabase server y Mercado Pago.
- Variables privadas de Vercel Analytics si se quiere ver visitas dentro de `/admin`.
- Que `SITE_URL` sea HTTPS y corresponda al dominio real.
- Que el webhook configurado en Mercado Pago apunte al dominio real.
- Que `MERCADOPAGO_SEND_MARKETPLACE_FIELD=false`, salvo confirmacion formal de Mercado Pago.
- Que `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=0` y `MERCADOPAGO_MARKETPLACE_FEE_PERCENT=1.5` para aplicar la comision objetivo del 1,5%. Un importe fijo mayor que cero anula el porcentaje.
- Que `MERCADOPAGO_DIAGNOSTIC_MODE=false`, salvo una prueba coordinada con cuenta propia o de test.

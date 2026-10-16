# Panel admin operativo

El panel interno tiene tres superficies:

- `/admin`: tablero operativo read-only con estados OK, Revisar y Error.
- `/admin/administracion`: resumen administrativo del `marketplace_fee` registrado localmente.
- `/admin/usuarios`: administración de usuarios, perfiles, roles, suspensiones, administradores activos, auditoría reciente y ficha 360 comercial con estado Mercado Pago.

## Etapa 2A — Control administrativo base

Implementada y desplegada desde el 11 de octubre de 2026. `docs/supabase-admin-control.sql` fue ejecutado y auditado remotamente ese día; permanecen pendientes las pruebas mutantes controladas con una cuenta descartable.

Incluye:

- otorgar o quitar roles almacenados en `public.admin_users` sin ejecutar SQL manual por cada cambio;
- suspender y restaurar cuentas sin eliminarlas mediante `public.admin_user_controls` y el bloqueo de Supabase Auth;
- listar administradores activos e indicar si el permiso proviene de base, Vercel o ambas fuentes;
- mostrar los eventos administrativos recientes de `audit_logs` sin enviar IP, user agent, secretos ni diffs completos al navegador;
- exigir un motivo de al menos seis caracteres para roles, suspensión, restauración, edición de perfil y restablecimiento de contraseña;
- registrar solicitud y resultado de cada acción antes y después de la mutación.

## Etapa 2B — Ficha 360 por usuario

Desplegada el 12 de octubre de 2026. No agrega tablas, políticas ni RPC: usa desde una API exclusivamente administrativa las estructuras comerciales ya aplicadas. La validación principal en producción fue confirmada el 15 de octubre desde una cuenta administradora: acceso, ficha, solapas, actualización y disposición visual funcionaron correctamente. Las variantes de cuentas sin actividad o con Mercado Pago temporalmente no verificable permanecen como regresiones complementarias.

Al seleccionar un usuario, `/admin/usuarios` consulta una sola vez sus datos y los conserva en memoria durante esa visita. Sólo vuelve a consultarlos si se pulsa `Actualizar datos`, ubicado en la cabecera después de `Operación`; cambiar de solapa no genera requests adicionales.

La cabecera operativa reúne Mercado Pago, Accesos y Trazabilidad en tres tarjetas horizontales de igual altura cuando el ancho lo permite. Las tarjetas muestran únicamente el resumen centrado, sin listas ni scrollbars internos; cada botón `Ver` abre un modal amplio con administradores o eventos completos. En mobile se apilan manteniendo la misma altura y el modal adapta su contenido a una columna.

Incluye:

- resumen de publicaciones, compras, ventas, entregas pendientes y alertas;
- publicaciones permanentes y mensuales con stock, vigencia, estado y visibilidad calculada;
- compras con estado de pago, entrega, importe, referencia y productos;
- ventas reconstruidas mediante el snapshot `order_items.seller_user_id`, con pago y cumplimiento;
- cronología conjunta de publicaciones, pagos mensuales, compras, ventas y eventos administrativos dirigidos al usuario;
- diagnóstico en vivo de la conexión OAuth, vencimiento del token, coincidencia del MP User ID e identidad por nombre, email y DNI;
- exposición explícita de la excepción autorizada para MP User ID `1157622469`, sin presentarla como una coincidencia ordinaria.

La ficha es de sólo lectura. No sincroniza órdenes, no crea preferencias, no cobra, no reembolsa y no modifica conexiones OAuth. Los tokens se usan únicamente en el servidor para consultar `/users/me` y nunca se incluyen en la respuesta. Cada lista se limita a los 200 registros recientes para mantener acotada la consulta; la próxima etapa deberá resolver vistas globales y paginadas de anomalías.

## Etapa 2C — Control global de operaciones

Implementada localmente el 15 de octubre de 2026 como una primera superficie exclusivamente de lectura. `/admin/operaciones` consulta desde una API administrativa hasta 500 órdenes recientes y cruza despachos, publicaciones y movimientos de pago auditados sin exponer direcciones, teléfonos, tokens OAuth ni secretos.

Incluye:

- filtros globales por estado de pago, texto y tipo de control;
- órdenes pendientes, aprobadas, rechazadas, canceladas y reembolsadas;
- detección de pendientes mayores a 24 horas;
- aprobaciones sin Payment ID, detalle de pago o movimiento en `audit_logs`;
- estados locales de orden y pago contradictorios;
- ventas aprobadas mayores a 24 horas sin seguimiento o sin avance de entrega;
- contratos mensuales activos sin vencimiento; el stock agotado no es anomalía porque la publicación queda correctamente fuera del catálogo y del checkout;
- actualización manual, sin polling ni consultas repetidas en segundo plano.

La pantalla no sincroniza Mercado Pago, no modifica órdenes, no crea despachos y no ejecuta cobros o reembolsos. Una mensual vencida no se marca como anomalía sólo porque conserve `publication_status=active`: su fecha de expiración ya la excluye correctamente de las lecturas públicas.

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
   - Implementado localmente en 2B: ver compras, ventas, productos publicados, cumplimiento y estado MP en la ficha 360.
   - Implementado: editar datos profundos con auditoría solicitada/completada/fallida.
   - Implementado localmente en 2A: bloquear acciones de usuario sin borrar cuenta.

2. Operacion
   - Implementado localmente en 2C: ver ordenes pendientes, aprobadas, rechazadas y reembolsadas.
   - Implementado localmente en 2C: detectar ordenes pendientes viejas.
   - Implementado localmente en 2C: detectar mensuales activas sin vencimiento sin confundir stock agotado con visibilidad pública.
   - Implementado localmente en 2C: detectar despachos faltantes despues de pagos aprobados.

3. Mercado Pago
   - Ver vendedores conectados/desconectados.
   - Implementado localmente en 2B por usuario: detectar token OAuth vencido y mostrar vencimiento.
   - Implementado localmente en 2C: ver compras con `payment_detail` incompleto.
   - Implementado localmente en 2C: ver pagos aprobados sin movimiento en `audit_logs`.
   - La vista del propio vendedor ya consulta sus pagos pendientes con OAuth y diferencia preferencias sin intento. Sigue pendiente una vista central equivalente para administradores.
   - Implementado localmente en 2B: exponer la coincidencia de nombre/apellido, email y DNI, el MP User ID real y la excepción `1157622469`.

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
3. Completado: código desplegado y acceso administrativo confirmado en `/admin/usuarios`.
4. Pendiente: otorgar y retirar un rol de base usando un motivo verificable.
5. Pendiente: suspender y restaurar una cuenta de prueba; confirmar que una API autenticada responde 403 durante la suspensión.
6. Pendiente: revisar que `audit_logs` contenga eventos `requested` y `completed` o `failed` para cada acción.
7. Regla permanente: no ejecutar estas pruebas sobre el último administrador persistido ni sobre permisos de Vercel.

## Validación de la Etapa 2B

1. No hay SQL adicional para ejecutar.
2. Pendiente: desplegar y abrir fichas de un comprador, un vendedor, una cuenta sin Mercado Pago y la cuenta exceptuada.
3. Pendiente: contrastar contadores y estados contra Supabase sin realizar cobros ni sincronizaciones.
4. Pendiente: revisar las cinco solapas y su adaptación mobile; confirmar que volver a una ficha ya cargada no repite la consulta.
5. Pendiente: comprobar que `Actualizar ficha` renueva los datos y que una caída de Mercado Pago sólo marca el diagnóstico como no verificable, sin ocultar la actividad local.

## Validación de la Etapa 2C

1. No requiere SQL adicional.
2. Pendiente: desplegar `/admin/operaciones` y comparar sus contadores con Supabase.
3. Revisar por separado los filtros de pagos, entregas y catálogo; una alerta es un diagnóstico local, no una autorización para mutar datos.
4. Confirmar responsive en escritorio y mobile, y que `Actualizar` sea la única recarga manual de la vista.
5. Contrastar cada alerta real antes de corregir datos o contactar a un usuario.

## Revisión de produccion

El panel muestra el entorno donde corre. Para produccion hay que revisar en Vercel:

- Variables `PUBLIC_*`, Supabase server y Mercado Pago.
- Variables privadas de Vercel Analytics si se quiere ver visitas dentro de `/admin`.
- Que `SITE_URL` sea HTTPS y corresponda al dominio real.
- Que el webhook configurado en Mercado Pago apunte al dominio real.
- Que `MERCADOPAGO_SEND_MARKETPLACE_FIELD=false`, salvo confirmacion formal de Mercado Pago.
- Que `MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=0` y `MERCADOPAGO_MARKETPLACE_FEE_PERCENT=1.5` para aplicar la comision objetivo del 1,5%. Un importe fijo mayor que cero anula el porcentaje.
- Que `MERCADOPAGO_DIAGNOSTIC_MODE=false`, salvo una prueba coordinada con cuenta propia o de test.

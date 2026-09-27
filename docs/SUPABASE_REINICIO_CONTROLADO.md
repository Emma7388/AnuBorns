# Supabase: reinicio controlado y revision de carga

Actualizado el 27 de septiembre de 2026.

Este documento prepara un reinicio manual de Supabase para observar si el swap vuelve a cero y si la presion de memoria reaparece. No propone cambios de schema, SQL ni acciones destructivas.

## Objetivo

- Registrar el estado antes del reinicio.
- Reiniciar en una ventana de bajo trafico.
- Verificar que AnuBorns vuelve a operar.
- Comparar swap, memoria, I/O, carga y conexiones despues del reinicio.

El reinicio puede aliviar procesos acumulados o conexiones colgadas, pero no corrige la causa si hay consultas pesadas, falta de memoria, demasiadas conexiones o I/O sostenido.

## Revision de codigo

Se reviso el codigo buscando procesos abiertos, loops, timers, suscripciones y llamadas repetitivas.

Resultado:

- No se encontro ningun worker server-side, `setInterval`, cron interno ni loop infinito en APIs.
- Las rutas de `src/pages/api/` trabajan por request y terminan.
- `src/lib/supabaseServer.js` cachea un cliente admin sin persistencia de sesion; no mantiene login ni refresco automatico de tokens.
- `src/lib/serverRequest.js` usa un `while (true)` acotado a leer el cuerpo del request y corta por `done` o limite de bytes.
- `src/lib/supabaseMetrics.js` usa timeout de 8 segundos para Metrics API.
- `src/lib/featuredProducts.js` usa timeout de 6 segundos para consultas de destacados.
- La limpieza de checkouts pendientes no corre sola: se ejecuta al validar compras o desde `/api/checkout-pending-cleanup`, con rate limit.

Suscripciones Realtime detectadas:

- `src/scripts/header-auth.js`: notificaciones de ventas en header; limpia canal con `supabase.removeChannel(...)` en cambio de pagina/sesion y usa debounce de 900 ms.
- `src/scripts/mis-ventas.js`: canal activo solo en `/mis-ventas` despues de cargar listas; limpia en `pagehide` o al salir de la pantalla y usa debounce de 900 ms.
- `src/scripts/orders.js`: canal activo en `/mis-compras`; limpia en `pagehide` o al salir de la pantalla y usa debounce de 900 ms.
- `src/scripts/purchase-status-notifications.js`: notificaciones globales de compras; evita rafagas con minimo de 2.5 segundos y limpia canal cuando no corresponde.

Observacion:

- Algunos canales escuchan `orders`, `order_items` o `sale_dispatches` sin filtro de usuario porque el filtrado fino depende de las relaciones/RLS y del cruce posterior en la app. Esto no es un proceso server-side abierto por AnuBorns, pero si hubiera mucho volumen puede aumentar eventos Realtime a clientes conectados. Si el swap vuelve a subir, conviene revisar volumen de Realtime, conexiones y consultas antes de culpar solo a memoria.

## Checklist antes del reinicio

1. Elegir horario de bajo trafico.
2. No iniciar pruebas de checkout durante la ventana.
3. Avisar internamente que puede haber un corte breve.
4. Abrir `/admin`, tocar `Consultar` en la seccion Supabase y anotar:
   - Memoria usada.
   - Swap usado.
   - Disco usado.
   - Carga 5 min.
   - I/O en curso.
   - Conexiones abiertas.
   - Reinicios Postgres.
   - Hora exacta de la muestra.
5. En Supabase Dashboard, revisar si hay incidentes o servicios en estado anormal.
6. Confirmar que no hay una operacion critica en curso: compra, pago, publicacion o migracion manual.

## Pasos para reiniciar

1. Entrar a Supabase Dashboard.
2. Abrir el proyecto de AnuBorns.
3. Ir a `Project Settings`.
4. Entrar en `General`.
5. Buscar la accion `Restart project` o `Restart database`.
6. Confirmar el reinicio.
7. Esperar a que Supabase muestre el proyecto saludable nuevamente.

La ubicacion exacta del boton puede cambiar en el dashboard, pero Supabase documenta el reinicio desde la pagina de configuracion general del proyecto. El reinicio puede cortar temporalmente Database y servicios que dependen de ella.

## Verificacion despues del reinicio

Esperar 5 a 10 minutos y revisar:

1. `/admin`: confirmar que los chequeos vuelven a cargar.
2. `/login`: iniciar sesion.
3. `/comprar/productos`: abrir catalogo.
4. `/producto/[id]`: abrir un producto real.
5. `/carrito`: verificar carga de carrito.
6. `/mis-compras`: verificar historial.
7. `/mis-ventas`: cargar ventas/publicaciones si corresponde.

Registrar otra muestra de `/admin` tocando `Consultar` otra vez:

- Memoria usada.
- Swap usado.
- Disco usado.
- Carga 5 min.
- I/O en curso.
- Conexiones abiertas.
- Reinicios Postgres.
- Hora exacta.

Revisar de nuevo a los 30 y 60 minutos.

## Interpretacion

- Si el swap baja a 0 y queda estable: probablemente habia presion acumulada o una situacion transitoria.
- Si el swap baja y vuelve a subir: investigar consultas pesadas, conexiones, Realtime y tamaño de compute.
- Si el swap no baja o vuelve con I/O alto: revisar Database Reports, Query Performance y considerar subir compute.
- Si hay errores luego del reinicio: revisar logs de Supabase y Vercel antes de ejecutar nuevas pruebas.

## Fuentes oficiales consultadas

- Supabase Troubleshooting: HTTP API issues.
- Supabase Troubleshooting: unhealthy services.
- Supabase Troubleshooting: connection timeout / overloaded database.

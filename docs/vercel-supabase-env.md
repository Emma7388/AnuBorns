# Vercel + Supabase environment

Para que el bundle del navegador tenga Supabase disponible en produccion, configurar estas variables en Vercel para el proyecto:

```text
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_PROJECT_REF=<project-ref>
SUPABASE_METRICS_SECRET_KEY=<secret-api-key-sb_secret>
```

Para que el panel interno pueda consultar visitas y paginas vistas desde Vercel Web Analytics, configurar:

```text
VERCEL_ANALYTICS_TOKEN=<token-privado-de-vercel>
VERCEL_ANALYTICS_PROJECT_ID=<project-id-de-vercel>
VERCEL_ANALYTICS_TEAM_ID=<team-id-si-el-proyecto-es-de-un-team>
```

`VERCEL_ANALYTICS_TOKEN` es privado y server-side. No usar prefijo `PUBLIC_`. `VERCEL_ANALYTICS_PROJECT_ID` puede omitirse solo si el runtime de Vercel expone `VERCEL_PROJECT_ID`, pero es mas claro cargarlo explicitamente. `VERCEL_ANALYTICS_TEAM_ID` es opcional; usarlo si el token consulta un proyecto dentro de un team.

Para que el checkout pueda crear preferencias validas de Mercado Pago, configurar tambien:

```text
SITE_URL=https://<dominio-publico-de-produccion>
MERCADOPAGO_ACCESS_TOKEN=<access-token-plataforma>
MERCADOPAGO_WEBHOOK_SECRET=<webhook-secret>
MERCADOPAGO_CLIENT_ID=<client-id-app>
MERCADOPAGO_CLIENT_SECRET=<client-secret-app>
MERCADOPAGO_OAUTH_REDIRECT_URI=https://<dominio-publico-de-produccion>/api/mp-oauth
MERCADOPAGO_MARKETPLACE_ID=<marketplace-id-si-corresponde>
MERCADOPAGO_SEND_MARKETPLACE_FIELD=false
MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=1
MERCADOPAGO_MARKETPLACE_FEE_PERCENT=0
MERCADOPAGO_DIAGNOSTIC_MODE=false
MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS=
MERCADOPAGO_DIAGNOSTIC_ALLOWED_MP_USER_IDS=
```

`SITE_URL` debe ser HTTPS y apuntar al dominio publico real. No dejarlo vacio: el checkout lo usa para `back_urls` y `notification_url`.

Despues de guardar las variables, hacer un redeploy. Las variables `PUBLIC_*` se incrustan durante `astro build`, asi que un despliegue anterior seguira fallando aunque las variables se agreguen despues.

La `SUPABASE_SERVICE_ROLE_KEY` es solo para APIs server-side en Vercel. No debe exponerse en codigo del navegador ni en variables con prefijo `PUBLIC_`.

`SUPABASE_PROJECT_REF` y `SUPABASE_METRICS_SECRET_KEY` habilitan la consulta manual read-only del servidor Supabase en `/admin`. La clave recomendada es una Secret API key de Supabase (`sb_secret_...`) guardada como Secret en Vercel. No usar prefijo `PUBLIC_` ni imprimir su valor.

`VERCEL_ANALYTICS_TOKEN`, `VERCEL_ANALYTICS_PROJECT_ID` y opcionalmente `VERCEL_ANALYTICS_TEAM_ID` habilitan el boton manual de Vercel Analytics en `/admin`. La app consulta visitas, page views, paginas, origenes, paises y dispositivos solo cuando un admin toca `Consultar`; no hay polling ni tarea en segundo plano.

`MERCADOPAGO_DIAGNOSTIC_MODE` debe quedar en `false` en operacion normal. Solo debe activarse para una prueba coordinada, con una cuenta de prueba o cuenta propia explicitamente incluida en `MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS` o `MERCADOPAGO_DIAGNOSTIC_ALLOWED_MP_USER_IDS`. Nunca usarlo para seleccionar automaticamente vendedores reales conectados.

Si Supabase SQL editor devuelve:

```text
ERROR: 42710: policy "<nombre>" for table "<tabla>" already exists
```

ejecutar los SQL actualizados de `docs/`, que borran la policy antes de crearla y son seguros para correr mas de una vez.

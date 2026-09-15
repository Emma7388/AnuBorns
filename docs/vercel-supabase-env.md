# Vercel + Supabase environment

Para que el bundle del navegador tenga Supabase disponible en produccion, configurar estas variables en Vercel para el proyecto:

```text
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

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
```

`SITE_URL` debe ser HTTPS y apuntar al dominio publico real. No dejarlo vacio: el checkout lo usa para `back_urls` y `notification_url`.

Despues de guardar las variables, hacer un redeploy. Las variables `PUBLIC_*` se incrustan durante `astro build`, asi que un despliegue anterior seguira fallando aunque las variables se agreguen despues.

La `SUPABASE_SERVICE_ROLE_KEY` es solo para APIs server-side en Vercel. No debe exponerse en codigo del navegador ni en variables con prefijo `PUBLIC_`.

Si Supabase SQL editor devuelve:

```text
ERROR: 42710: policy "<nombre>" for table "<tabla>" already exists
```

ejecutar los SQL actualizados de `docs/`, que borran la policy antes de crearla y son seguros para correr mas de una vez.

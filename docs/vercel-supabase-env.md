# Vercel + Supabase environment

Para que el bundle del navegador tenga Supabase disponible en produccion, configurar estas variables en Vercel para el proyecto:

```text
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Despues de guardar las variables, hacer un redeploy. Las variables `PUBLIC_*` se incrustan durante `astro build`, asi que un despliegue anterior seguira fallando aunque las variables se agreguen despues.

La `SUPABASE_SERVICE_ROLE_KEY` es solo para APIs server-side en Vercel. No debe exponerse en codigo del navegador ni en variables con prefijo `PUBLIC_`.

Si Supabase SQL editor devuelve:

```text
ERROR: 42710: policy "<nombre>" for table "<tabla>" already exists
```

ejecutar los SQL actualizados de `docs/`, que borran la policy antes de crearla y son seguros para correr mas de una vez.

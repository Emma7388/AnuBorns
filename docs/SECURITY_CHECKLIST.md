# Checklist de seguridad de la aplicación

Estado consolidado al 24 de octubre de 2026. Esta lista traduce los veinte controles generales revisados a la arquitectura real de AnuBorns. “Completo en código” no reemplaza la evidencia remota indicada al final.

## Estado de los 20 controles

1. **Ocultar API keys — completo.** Las claves privilegiadas sólo se leen en backend/Vercel. El navegador recibe únicamente variables `PUBLIC_*` deliberadamente públicas.
2. **Eliminar secretos de Git — completo.** Existe `pnpm run security:secrets`, su regresión automática y una revisión del historial completo sin hallazgos. Los secretos nunca deben pegarse en documentación ni commits.
3. **Usar una clave pública para la base — completo.** El cliente usa la anon key de Supabase; `service_role` queda exclusivamente en servidor.
4. **Row-Level Security — completo para las tablas y buckets operativos auditados.** Las migraciones dejan funciones sensibles sólo para `service_role`. Repetir auditorías después de cambios de esquema.
5. **Cifrar datos sensibles — completo y validado remotamente.** Access y refresh tokens OAuth de Mercado Pago se cifran con AES-256-GCM y autenticación de integridad. La verificación productiva confirmó 4 tokens cifrados y `legacy: 0`; el panel conserva una acción idempotente para futuras migraciones.
6. **Forzar autenticación — completo.** Las APIs privadas validan el Bearer token con Supabase y las administrativas además exigen rol y cuenta no suspendida.
7. **Restringir acceso a registros — completo.** RLS, validación de propietario y agregaciones server-side limitan lectura y escritura.
8. **Bloquear manipulación de campos — completo.** El servidor vuelve a leer productos, precios, vendedor, stock, publicación, entrega, identidad y comisión; no confía en los importes enviados por el navegador.
9. **Proteger cookies de sesión — no aplicable como cookie propia.** La app no crea `document.cookie`. Supabase Auth usa PKCE, refresco controlado y sesión persistente del SDK. Migrar a una cookie HttpOnly exigiría una arquitectura BFF completa y retirar todas las consultas Supabase del navegador; no se simula con una cookie parcial.
10. **Hashear contraseñas — completo mediante Supabase Auth.** La aplicación nunca guarda ni procesa hashes de contraseña propios.
11. **Rate limiting — completo y validado remotamente.** El contador distribuido es atómico, server-only y no guarda IPs en claro; el fallback en memoria es observable como degradación.
12. **Protección contra bots — completo y configurado remotamente por confirmación del usuario.** Turnstile entrega `captchaToken` a Supabase en registro, login y recuperación, y la CSP sólo habilita el dominio oficial. Conservar una prueba controlada de los tres recorridos después de cada cambio de dominio o clave.
13. **Parametrizar consultas — completo.** Las consultas operativas usan el SDK de Supabase/RPC con parámetros; no concatenan SQL recibido del usuario.
14. **Validar inputs — completo.** Hay validación cliente para experiencia y validación server-side para seguridad, límites de cuerpo y normalización.
15. **Sanitizar contenido — completo.** Los valores externos usados en plantillas HTML se escapan; se corrigió el detalle de venta y una regresión inventaría todos los sinks `innerHTML`/`document.write` para impedir altas silenciosas.
16. **Restringir archivos — completo y auditado remotamente.** Productos y avatares validan MIME, tamaño, decodificación y ruta propietaria. Avatar confirmó 5 MB, MIME JPEG/PNG/WebP, cuatro políticas `authenticated`, 12 objetos válidos y cero anomalías.
17. **Devolver sólo datos necesarios — completo.** Las APIs administrativas convierten tokens en booleanos/diagnósticos y no devuelven credenciales OAuth.
18. **Security headers — completo.** CSP por hash/origen, `frame-ancestors`, `nosniff`, política de referencia, permisos mínimos y respuestas privadas `no-store`.
19. **Forzar HTTPS — completo en producción.** Vercel sirve HTTPS y CSP solicita upgrade de recursos inseguros; `SITE_URL` se valida como HTTPS.
20. **Escanear dependencias — completo.** Dependencias actualizadas, overrides de seguridad, `pnpm audit --prod` sin vulnerabilidades y pruebas/build obligatorios antes de publicar.

## Estado de activación remota

### 1. Avatar Storage — completado

`docs/supabase-avatar-storage-hardening.sql` fue ejecutado. La auditoría devolvió cuatro políticas `authenticated`, `unexpected_policies: 0`, límite `5242880`, MIME JPEG/PNG/WebP, 12 objetos existentes y cero objetos con extensión o profundidad inesperada.

### 2. Cloudflare Turnstile con Supabase Auth — configurado

El usuario confirmó la creación/configuración del widget, la site key pública en Vercel y la secret key en Supabase Auth. Después de cambios de dominio, clave o Auth se deben repetir registro, credenciales inválidas, ingreso correcto y recuperación.

### 3. Cifrado de tokens Mercado Pago — completado

`MERCADOPAGO_TOKEN_ENCRYPTION_KEY` quedó configurada como variable Sensitive de Production y la versión que cifra altas y renovaciones fue desplegada. El 24 de octubre una consulta agregada de sólo lectura confirmó 2 cuentas OAuth, 4 tokens cifrados y `legacy: 0`; no se imprimieron ni expusieron valores. Conservar una copia segura de la clave en el gestor de secretos y no rotarla sin una migración de recifrado.

### 4. Separación de ambientes Vercel — verificada

El proyecto `anuborns` utiliza Node `24.x`. La enumeración remota confirmó que Preview no tiene variables de entorno y Production concentra la configuración operativa. El despliegue productivo inspeccionado quedó `Ready` desde la rama `V0.8`, commit `7c03326`.

El usuario también reemplazó el PAT sin vencimiento usado por `VERCEL_ANALYTICS_TOKEN` por uno nuevo con caducidad, conservó la variable como Secret limitada a Production, redesplegó, comprobó la consulta de Analytics y eliminó el token anterior. Los valores no se registran en el repositorio.

La cuenta propietaria ya tenía 2FA activo y el usuario habilitó su exigencia para los miembros del Team. Una solicitud HTTP anónima posterior a `https://anuborns.vercel.app/` devolvió `200 OK`, sin redirección a Vercel: la política del Team no dejó Production detrás de Vercel Authentication.

La revisión manual posterior confirmó un único miembro en el Team —la cuenta propietaria— y ningún evento desconocido en Activity. No se identificaron invitaciones, accesos, cambios de roles, variables, dominios ni despliegues ajenos.

GitHub conservaba `V0.7` como rama predeterminada aunque Vercel publicaba `V0.8`. El usuario cambió la referencia predeterminada a `V0.8`; una consulta remota confirmó `HEAD → refs/heads/V0.8` en el commit productivo `7c03326` y el clon local sincronizó `origin/HEAD`. Las ramas históricas no fueron eliminadas.

La revisión final del Security Dashboard de Vercel informó **All recommended protections in place**. Confirmó 2FA para todos los miembros, cantidad de owners equilibrada, todos los PAT con vencimiento, OIDC en proyectos elegibles, prevención de despliegues desde forks, protección de Preview, variables marcadas Sensitive/Secret y rotadas dentro de 90 días, y ausencia de variables expuestas mediante el framework. La comprobación HTTP anónima mantiene la evidencia separada de que Production continúa pública.

## Evidencia local

- `tests/authBotProtection.test.mjs`: CAPTCHA y CSP.
- `tests/avatarStorageSql.test.mjs`: límites y políticas del bucket avatar.
- `tests/mercadopagoTokenCrypto.test.mjs`: cifrado, integridad, compatibilidad de migración y clave inválida.
- `tests/dynamicHtmlSafety.test.mjs`: inventario de sinks y escape del detalle de venta.
- `tests/sessionArchitecture.test.mjs`: PKCE y ausencia de cookies JavaScript propias.
- `tests/repositorySecretsAudit.test.mjs` y `pnpm run security:secrets`: prevención de secretos versionados.

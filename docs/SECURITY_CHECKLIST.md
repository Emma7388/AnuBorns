# Checklist de seguridad de la aplicación

Estado consolidado al 20 de octubre de 2026. Esta lista traduce los veinte controles generales revisados a la arquitectura real de AnuBorns. “Completo en código” no reemplaza los pasos remotos indicados al final.

## Estado de los 20 controles

1. **Ocultar API keys — completo.** Las claves privilegiadas sólo se leen en backend/Vercel. El navegador recibe únicamente variables `PUBLIC_*` deliberadamente públicas.
2. **Eliminar secretos de Git — completo.** Existe `pnpm run security:secrets`, su regresión automática y una revisión del historial completo sin hallazgos. Los secretos nunca deben pegarse en documentación ni commits.
3. **Usar una clave pública para la base — completo.** El cliente usa la anon key de Supabase; `service_role` queda exclusivamente en servidor.
4. **Row-Level Security — completo para las tablas y buckets operativos auditados.** Las migraciones dejan funciones sensibles sólo para `service_role`. Repetir auditorías después de cambios de esquema.
5. **Cifrar datos sensibles — completo en código; activación remota pendiente.** Access y refresh tokens OAuth de Mercado Pago se cifran con AES-256-GCM y autenticación de integridad. Los registros legados se leen durante la migración y el panel ofrece una acción idempotente para cifrarlos.
6. **Forzar autenticación — completo.** Las APIs privadas validan el Bearer token con Supabase y las administrativas además exigen rol y cuenta no suspendida.
7. **Restringir acceso a registros — completo.** RLS, validación de propietario y agregaciones server-side limitan lectura y escritura.
8. **Bloquear manipulación de campos — completo.** El servidor vuelve a leer productos, precios, vendedor, stock, publicación, entrega, identidad y comisión; no confía en los importes enviados por el navegador.
9. **Proteger cookies de sesión — no aplicable como cookie propia.** La app no crea `document.cookie`. Supabase Auth usa PKCE, refresco controlado y sesión persistente del SDK. Migrar a una cookie HttpOnly exigiría una arquitectura BFF completa y retirar todas las consultas Supabase del navegador; no se simula con una cookie parcial.
10. **Hashear contraseñas — completo mediante Supabase Auth.** La aplicación nunca guarda ni procesa hashes de contraseña propios.
11. **Rate limiting — completo y validado remotamente.** El contador distribuido es atómico, server-only y no guarda IPs en claro; el fallback en memoria es observable como degradación.
12. **Protección contra bots — completo en código; activación remota pendiente.** Turnstile entrega `captchaToken` a Supabase en registro, login y recuperación, y la CSP sólo habilita el dominio oficial.
13. **Parametrizar consultas — completo.** Las consultas operativas usan el SDK de Supabase/RPC con parámetros; no concatenan SQL recibido del usuario.
14. **Validar inputs — completo.** Hay validación cliente para experiencia y validación server-side para seguridad, límites de cuerpo y normalización.
15. **Sanitizar contenido — completo.** Los valores externos usados en plantillas HTML se escapan; se corrigió el detalle de venta y una regresión inventaría todos los sinks `innerHTML`/`document.write` para impedir altas silenciosas.
16. **Restringir archivos — completo en código; avatar pendiente de aplicar remotamente.** Productos y avatares validan MIME, tamaño, decodificación y ruta propietaria. Productos ya fue auditado en Supabase; falta ejecutar la migración de avatar.
17. **Devolver sólo datos necesarios — completo.** Las APIs administrativas convierten tokens en booleanos/diagnósticos y no devuelven credenciales OAuth.
18. **Security headers — completo.** CSP por hash/origen, `frame-ancestors`, `nosniff`, política de referencia, permisos mínimos y respuestas privadas `no-store`.
19. **Forzar HTTPS — completo en producción.** Vercel sirve HTTPS y CSP solicita upgrade de recursos inseguros; `SITE_URL` se valida como HTTPS.
20. **Escanear dependencias — completo.** Dependencias actualizadas, overrides de seguridad, `pnpm audit --prod` sin vulnerabilidades y pruebas/build obligatorios antes de publicar.

## Activación remota necesaria

### 1. Avatar Storage

Ejecutar `docs/supabase-avatar-storage-hardening.sql` en Supabase. Debe devolver cuatro políticas `authenticated`, `unexpected_policies: 0`, límite `5242880`, MIME JPEG/PNG/WebP y cero objetos con extensión o profundidad inesperada. El script retira la antigua lectura global conocida, pero no borra ni reescribe archivos existentes.

### 2. Cloudflare Turnstile con Supabase Auth

1. Crear el widget Turnstile para los dominios de producción y preview que realmente se usen.
2. Guardar la site key como `PUBLIC_TURNSTILE_SITE_KEY` en Vercel. Es pública y no debe marcarse como secreto.
3. En Supabase Auth, habilitar CAPTCHA/Turnstile y guardar allí la secret key de Cloudflare. Esa secret no pertenece al repositorio ni a variables `PUBLIC_*`.
4. Redesplegar y probar registro, credenciales inválidas, ingreso correcto y recuperación. Sin completar el desafío, ninguna de esas acciones debe avanzar.

### 3. Cifrado de tokens Mercado Pago

1. Generar una clave de 32 bytes fuera del repositorio:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

2. Guardarla como variable **Sensitive** `MERCADOPAGO_TOKEN_ENCRYPTION_KEY`. Si Preview y Production comparten la misma base Supabase, deben usar exactamente la misma clave; perderla impide descifrar los tokens existentes.
3. Redesplegar, abrir `/admin/mercadopago` y pulsar **Cifrar tokens OAuth** una sola vez. La acción es idempotente y queda en `audit_logs`.
4. Volver a `/admin`: el chequeo `Tokens OAuth cifrados` debe quedar correcto con `legacy: 0`.
5. Conservar una copia segura de la clave en el gestor de secretos. No rotarla sin implementar una migración de recifrado.

## Evidencia local

- `tests/authBotProtection.test.mjs`: CAPTCHA y CSP.
- `tests/avatarStorageSql.test.mjs`: límites y políticas del bucket avatar.
- `tests/mercadopagoTokenCrypto.test.mjs`: cifrado, integridad, compatibilidad de migración y clave inválida.
- `tests/dynamicHtmlSafety.test.mjs`: inventario de sinks y escape del detalle de venta.
- `tests/sessionArchitecture.test.mjs`: PKCE y ausencia de cookies JavaScript propias.
- `tests/repositorySecretsAudit.test.mjs` y `pnpm run security:secrets`: prevención de secretos versionados.

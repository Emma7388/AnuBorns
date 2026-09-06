# Servicios: decisión de retiro temporal

Actualizado el 6 de septiembre de 2026.

El módulo de servicios se retiró por completo de la aplicación mientras se termina y valida el marketplace de productos. No debe reactivarse copiando los formularios, datos de ejemplo o rutas que existían antes: eran un MVP visual, sin un flujo de contratación persistente y consistente.

## Qué quedó fuera de la aplicación

- Accesos de compra, venta y oferta de servicios.
- Pantalla `Mis servicios` y su endpoint.
- Perfiles, catálogos y tarjetas mock de profesionales/proveedores.
- Formularios de contratar, publicar trabajo y vender un servicio.
- Dataset local de proveedores y estilos asociados.

Las URLs históricas se conservan sólo como redirecciones a pantallas vigentes. Esto evita errores para enlaces guardados, pero no muestra ninguna función de servicios.

## Base de datos

La tabla remota `public.user_services` no fue eliminada ni modificada. Actualmente la aplicación no la consulta. Se mantuvo para evitar una eliminación destructiva de datos y para poder diseñar una migración correcta cuando el módulo vuelva.

## Condiciones para reintroducirlo

Antes de crear pantallas, definir e implementar:

1. Modelo relacional de solicitudes, propuestas, contratación, estado y reseñas; evitar snapshots JSON como fuente principal.
2. Relación explícita por UUID entre solicitud, cliente y proveedor (`provider_user_id`).
3. RLS para que cada rol sólo pueda leer o modificar sus propios registros autorizados.
4. Contacto desde `profiles.phone` y validación de permisos antes de revelar datos.
5. Estados, auditoría y notificaciones persistentes; no simularlos en `localStorage`.
6. Pruebas de navegación, autorización y migración de cualquier dato existente antes de exponer enlaces públicos.

Mercado Pago no fue modificado por este retiro. Si en el futuro se cobran servicios, el diseño de pagos debe definirse aparte antes de conectarlo al flujo de productos.

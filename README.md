# AnuBorns

Marketplace argentino desarrollado con Astro para comprar y vender productos, publicar servicios y gestionar cobros entre compradores, vendedores y la plataforma.

## Estado actual

Actualizado al 15 de agosto de 2026 — rama `V0.7`.

El proyecto se encuentra en etapa de MVP avanzado/beta técnica. Los flujos principales de productos ya utilizan Supabase y el cobro se integra con Mercado Pago Checkout Pro. Aún quedan validaciones de producción, seguridad OAuth, renovación de tokens y una decisión definitiva para compras con múltiples vendedores.

### Implementado

- Registro, inicio de sesión, confirmación por correo y perfiles con Supabase Auth.
- Edición de datos personales y avatar.
- Categorías y productos dinámicos desde Supabase, con fallback local de categorías.
- Publicación de productos con imagen, precio, categoría, contacto y métodos de entrega.
- Catálogo por categoría, búsqueda, filtros y detalle de producto.
- Carrito híbrido: `localStorage` para visitantes, Supabase para usuarios autenticados y sincronización al iniciar sesión.
- Checkout autenticado con precios y disponibilidad validados en el servidor.
- Órdenes, items, historial de compras y panel de ventas persistidos en Supabase.
- Envío o retiro, estados de preparación, despacho, entrega y retiro confirmado.
- Prevención de compra de productos propios y de productos ya vendidos.
- Limpieza y recuperación de checkouts pendientes abandonados.
- Conexión OAuth de la cuenta Mercado Pago del vendedor.
- Checkout Pro creado con el token del vendedor y comisión configurable para AnuBorns.
- Webhook firmado, validación de monto/moneda e idempotencia.
- Sincronización del pago al regresar de Mercado Pago si el webhook demora.
- Productos destacados, notificaciones, tema claro/oscuro y navegación responsive.

### Limitaciones conocidas

- Cada checkout admite productos de un solo vendedor. Un carrito multiproveedor debe separarse antes de pagar o convertirse en varios checkouts.
- Se guardan `refresh_token` y `expires_at` de Mercado Pago, pero todavía no existe renovación automática del access token.
- La seguridad y las políticas RLS de la tabla de credenciales OAuth deben endurecerse antes de producción.
- Perfiles de profesionales, servicios y algunas rutas de proveedores todavía utilizan datos de demostración.
- Los flujos de oferta y contratación de servicios continúan como MVP/placeholder.
- Falta completar una prueba integral con cuentas de prueba o producción de Mercado Pago.

## Stack

- Astro 6 con salida server-side y adaptador Vercel.
- JavaScript y Astro, sin framework de cliente.
- Supabase Auth, Database, Storage y Realtime.
- Mercado Pago SDK y Checkout Pro.
- CSS propio compartido y estilos locales.
- pnpm y Node.js 22.12 o superior.

## Scripts

- `pnpm dev`: inicia el servidor local.
- `pnpm build`: valida variables requeridas y genera el build para Vercel.
- `pnpm preview`: sirve localmente el build generado.
- `pnpm astro`: ejecuta comandos de Astro.

## Configuración local

1. Instalar Node.js 22.12 o superior y pnpm.
2. Ejecutar `pnpm install`.
3. Copiar `.env.example` a `.env` y completar las variables.
4. Aplicar en Supabase los scripts SQL de `docs/` que correspondan al ambiente.
5. Ejecutar `pnpm dev`.

Variables requeridas para compilar:

```env
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Variables requeridas para Mercado Pago:

```env
SITE_URL=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_CLIENT_ID=
MERCADOPAGO_CLIENT_SECRET=
MERCADOPAGO_OAUTH_REDIRECT_URI=
MERCADOPAGO_MARKETPLACE_ID=MP
MERCADOPAGO_MARKETPLACE_FEE_AMOUNT=1
MERCADOPAGO_MARKETPLACE_FEE_PERCENT=0
```

Si el importe fijo es mayor que cero, tiene prioridad sobre el porcentaje. Los valores definitivos deben acordarse y probarse con la cuenta marketplace habilitada por Mercado Pago.

## Arquitectura funcional

### Compra de productos

1. `/comprar/productos`: categorías disponibles.
2. `/comprar/productos/[categoria]`: productos reales agrupados por vendedor.
3. `/producto/[id]`: detalle del producto.
4. `/carrito`: carrito local/remoto.
5. `/finalizar-compra`: datos de retiro o envío.
6. `/api/checkout`: valida el carrito, crea la orden y la preferencia de Mercado Pago.
7. `/compra-confirmada`: muestra y sincroniza el resultado.
8. `/mis-compras`: historial y seguimiento de entrega.

### Venta de productos

1. `/vender/productos`: conexión de Mercado Pago y publicación.
2. `/mis-ventas`: productos publicados, ventas y despacho.
3. `/proveedor-publico/[userId]`: vidriera pública del vendedor.

### Mercado Pago marketplace

El vendedor conecta su cuenta mediante OAuth. El backend crea la preferencia usando el access token de ese vendedor y agrega la comisión de AnuBorns. Actualmente no se divide un único pago entre varios vendedores: el backend exige un solo vendedor por checkout.

Archivos principales:

- `src/pages/api/checkout.js`
- `src/pages/api/mercadopago-webhook.js`
- `src/pages/api/mercadopago-payment-sync.js`
- `src/pages/api/mercadopago/oauth/`
- `src/scripts/mercadopago-connect.js`
- `src/lib/mercadopagoOAuthState.js`

## Datos

- Categorías, productos, perfiles, órdenes, items, carritos y despachos viven en Supabase.
- `src/data/categories.js` funciona como catálogo/fallback local.
- `src/data/providers.js` contiene datos de demostración utilizados por rutas legacy.
- Los scripts SQL de `docs/` documentan el esquema y sus ampliaciones incrementales.

## Documentación

- `docs/ARCHITECTURE.md`: responsabilidades generales por capa.
- `docs/LINEA_POR_LINEA.md`: inventario funcional de archivos.
- `docs/vercel-supabase-env.md`: variables de despliegue.
- `docs/supabase-*.sql`: esquema, migraciones, RLS y funciones de Supabase.
- `docs/PR_WORKFLOW.md`: criterios para ramas y pull requests.

## Pendientes prioritarios

1. Mantener el build limpio con variables reales.
2. Endurecer el almacenamiento de credenciales OAuth de Mercado Pago.
3. Implementar renovación automática de tokens OAuth.
4. Validar el flujo completo de Mercado Pago y comisiones.
5. Definir la experiencia para carritos multiproveedor.
6. Migrar los datos mock restantes a Supabase.
7. Completar servicios/ofertas y pruebas de regresión antes de producción.

# Guía de arquitectura

Actualizado el 6 de septiembre de 2026.

AnuBorns es una aplicación Astro 6 desplegada en Vercel. Supabase provee autenticación, base de datos y almacenamiento; Mercado Pago procesa cobros de productos por medio de OAuth por vendedor.

## Backend

- Supabase Auth administra registro, sesión y perfiles.
- Supabase Database guarda categorías, productos, carritos, órdenes, ventas y despachos.
- Supabase Storage almacena imágenes de productos y avatares.
- Las rutas de `src/pages/api/` autentican al usuario y usan el cliente admin sólo en el servidor.
- El checkout permite un vendedor por orden y la preferencia se crea con su conexión Mercado Pago.
- El webhook firmado y la sincronización de retorno actualizan el pago de forma idempotente.

## Capas principales

### Layouts y componentes

- `src/layouts/BaseLayout.astro`: documento HTML y metadatos base.
- `src/layouts/MainLayout.astro`: header, footer, estilos globales y navegación de regreso segura.
- `src/components/Header.astro`: sesión, carrito, avatar y cierre de sesión.
- `src/components/Footer.astro`: pie de página y navegación móvil.
- `src/components/ActionSwitch.astro`: acceso a productos en los flujos de compra y venta.
- `src/components/CategoryGrid.astro`: grilla dinámica de categorías de producto.

### Datos y lógica

- `src/data/categories.js`: catálogo canónico de categorías.
- `src/lib/supabaseClient.js`: cliente Supabase de navegador con validación de variables públicas.
- `src/lib/supabaseServer.js`: cliente admin de servidor.
- `src/lib/cart.js`: carrito de usuario y sincronización al iniciar sesión.
- `src/lib/checkoutServer.js`: validación de productos, vendedor, entrega y total antes de cobrar.
- `src/lib/saleDispatches.js` y `src/lib/fulfillmentStatus.js`: estados de venta, retiro y entrega.

### Flujos visibles

1. `comprar` muestra categorías y catálogo de productos.
2. El usuario agrega productos al carrito y completa una orden para un único vendedor.
3. Mercado Pago confirma el pago y la orden pasa al historial de compras y ventas.
4. `mis-ventas` permite administrar productos publicados y despachos.
5. El perfil público de vendedor se genera desde productos y perfiles reales de Supabase.

## Navegación

Las pantallas de detalle preservan la ruta de origen mediante el parámetro interno `from`. `MainLayout` valida que sea una ruta local antes de usarla. Las rutas antiguas de funciones retiradas redirigen a una pantalla vigente, sin mostrar contenido ni formularios obsoletos.

## Seguridad

- Las claves con privilegios se mantienen sólo en variables privadas de Vercel y en el servidor.
- Las claves públicas de Supabase se usan únicamente en el navegador con RLS activo.
- Las operaciones sensibles validan sesión y propietario en API antes de modificar datos.
- Las configuraciones y políticas de Supabase se documentan en los scripts de seguridad bajo `docs/`.

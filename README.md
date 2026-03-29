# AnuBorns

Marketplace MVP en Astro para flujos de compra/venta/oferta por categoría, con perfiles de proveedor y catálogo por proveedor.

## Stack

- Astro 5
- JavaScript (sin framework cliente)
- CSS global + estilos locales en componentes

## Scripts

- `pnpm dev`: servidor local
- `pnpm build`: build estático
- `pnpm preview`: preview del build

## Estado actual (21 de marzo 2026)

Implementado:

- Home con CTA a comprar, vender y ofertar.
- Navegación principal en header con Comprá/Vendé/Ofertá + navegación inferior mobile con acceso a volver/inicio/perfil.
- Flujo de compra de productos:
  - `/comprar`
  - `/comprar/productos`
  - `/comprar/productos/[categoria]`
  - `/proveedor/[slug]/productos`
  - `/proveedor/[slug]`
- Carrito simulado para productos:
  - `/carrito`
- Finalizar compra simulado (dirección + pago ficticio):
  - `/finalizar-compra`
- Confirmación con redirección a home:
  - `/compra-confirmada`
- Flujo de profesionales:
  - `/profesionales`
  - `/profesionales/[categoria]`
  - `/profesionales/[slug]`
  - `/profesionales/[slug]/productos`
- Inicio de contratación:
  - `/contratar/[slug]`
- Flujo de servicios:
  - `/comprar/servicios`
  - `/trabajos/publicar` (fecha/horario de visita + carga de imagen)
- Confirmación de publicación:
  - `/publicacion-confirmada`
- Flujos MVP de venta:
  - `/vender/productos`
  - `/vender/servicios`
- Flujos MVP de oferta (pantallas preparadas):
  - `/oferta/productos`
  - `/oferta/servicios`
- Registro y activación de perfil profesional:
  - `/registro`
  - `/cuenta/profesional`
- Perfil (usuario):
  - `/mis-compras`
  - `/mis-datos`
  - `/mis-servicios`
  - `/mis-ventas`

## Estructura de datos

- `src/data/categories.js`: categorías y slugs.
- `src/data/providers.js`: proveedores y metadatos.
  - `services` para perfil.
  - `products` para catálogo por proveedor/profesional.
  - `avatar`, `dailySold`, `rating`, `reviews` y datos de perfil.

## Rutas clave

- `src/pages/comprar/productos/[categoria].astro`: listado de proveedores filtrados por categoría.
- `src/pages/proveedor/[slug]/index.astro`: perfil del proveedor desde flujo de compra.
- `src/pages/proveedor/[slug]/productos.astro`: catálogo con filtros, paginado y copia de enlace.
- `src/pages/carrito.astro`: carrito simulado con cantidades y total.
- `src/pages/finalizar-compra.astro`: formulario simulado de entrega y pago.
- `src/pages/compra-confirmada.astro`: confirmación animada y vaciado de carrito.
- `src/pages/mis-compras.astro`: historial simulado de compras.
- `src/pages/mis-datos.astro`: datos personales simulados del usuario.
- `src/pages/mis-servicios.astro`: servicios activos e historial.
- `src/pages/mis-ventas.astro`: ventas activas e historial.
- `src/pages/profesionales/[categoria].astro`: listado de profesionales por categoría.
- `src/pages/profesionales/[slug]/index.astro`: perfil profesional con servicios destacados.
- `src/pages/profesionales/[slug]/productos.astro`: catálogo del profesional.
- `src/pages/contratar/[slug].astro`: pantalla MVP de solicitud.
- `src/pages/trabajos/publicar.astro`: formulario de publicación de trabajo con visita y carga de imagen.
- `src/pages/publicacion-confirmada.astro`: confirmación de publicación con animación.

## Criterios UX/UI aplicados

- CTA `Ver productos` desde `ProviderCard` lleva a catálogo real (`/proveedor/[slug]/productos` o `/profesionales/[slug]/productos`).
- El `from` en query mantiene el flujo de regreso entre categorías, perfiles y catálogos.
- El catálogo de proveedores incluye filtros de stock, orden y paginado con URL sync.
- Botones `Agregar` y `Comprar` del catálogo alimentan el carrito local (sin API).
- La confirmación final vacía el carrito local y redirige a home.
- Botones `Contactar (MVP)` abren WhatsApp a `1137915210`.
- Estilo de tarjetas y paneles unificado con clases `ab-*`.

## Limpieza aplicada

- Eliminados archivos legacy sin uso: `src/pages/anterior.txt`, `src/components/ProfessionalCard.astro`, `src/layouts/SplitLayout.astro`, `src/pages/productos.astro`.
- Quitada variable sin uso en `src/layouts/MainLayout.astro`.
- Depurados estilos globales sin referencias activas en `src/styles/global.css`.

## Verificación recomendada

1. Ejecutar `pnpm dev`.
2. Abrir `/comprar/productos/plomeria`.
3. Click en `Ver productos` de cualquier proveedor.
4. Confirmar llegada a `/proveedor/<slug>/productos` con grilla visible.
5. Probar filtros y paginación en el catálogo del proveedor.
6. Usar `Agregar` y `Comprar` para ver el carrito en `/carrito`.
7. Abrir `/profesionales/plomeria` y navegar a un perfil.
8. Verificar botón global `Volver` y navegación mobile.

## Nota sobre chequeo estático

`astro check` requiere instalar dependencias de tipado (`@astrojs/check` y `typescript`) para habilitar análisis adicional.

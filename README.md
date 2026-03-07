# AnuBorns

Marketplace MVP en Astro para flujos de compra/venta/oferta por categoria, con perfiles de proveedor y catalogo por proveedor.

## Stack

- Astro 5
- JavaScript (sin framework cliente)
- CSS global + estilos locales en componentes

## Scripts

- `pnpm dev`: servidor local
- `pnpm build`: build estatico
- `pnpm preview`: preview del build

## Estado actual (Marzo 2026)

Implementado:

- Home con accesos a comprar/vender/oferta.
- Flujo de compra por categoria:
  - `/comprar`
  - `/comprar/productos`
  - `/comprar/productos/[categoria]`
- Cards de proveedores por categoria.
- Perfil de proveedor:
  - `/proveedor/[slug]`
- Catalogo de productos por proveedor:
  - `/proveedor/[slug]/productos`
- Inicio de contratacion:
  - `/contratar/[slug]`
- Navegacion con boton global `Volver` por ruta (sin `history.back()`).

## Estructura de datos

- `src/data/categories.js`: categorias y slugs.
- `src/data/providers.js`: proveedores y metadatos.
  - Incluye `services` para perfil.
  - Incluye `products` para grilla de catalogo por proveedor.

## Rutas clave

- `src/pages/comprar/productos/[categoria].astro`: listado de proveedores filtrados por categoria.
- `src/pages/proveedor/[slug]/index.astro`: perfil del proveedor.
- `src/pages/proveedor/[slug]/productos.astro`: catalogo de productos del proveedor.
- `src/pages/contratar/[slug].astro`: pantalla MVP de solicitud.

## Criterios UX/UI aplicados

- CTA `Ver productos` desde `ProviderCard` lleva a catalogo real (`/proveedor/[slug]/productos`).
- En catalogo se dejo solo `Ver perfil` como accion secundaria.
- Se removio `Ver catalogo completo` del perfil para evitar duplicidad.
- Estilo de tarjetas de proveedor alineado con clases `ab-provider-card*`.

## Verificacion recomendada

1. Ejecutar `pnpm dev`.
2. Abrir `/comprar/productos/plomeria`.
3. Click en `Ver productos` de cualquier proveedor.
4. Confirmar llegada a `/proveedor/<slug>/productos` con grilla visible.
5. Verificar boton global `Volver` en paginas internas.

## Nota sobre chequeo estatico

`astro check` requiere instalar dependencias de tipado (`@astrojs/check` y `typescript`) para habilitar analisis adicional.


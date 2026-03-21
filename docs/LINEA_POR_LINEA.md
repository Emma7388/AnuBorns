# Documentacion tecnica (actualizada)

Este documento reemplaza la version linea por linea para mantener una referencia clara y sustentable.
Actualizado al 16 de marzo de 2026.

## Layouts

- `src/layouts/BaseLayout.astro`: estructura HTML base y `title` dinamico.
- `src/layouts/MainLayout.astro`: integra `Header`, `Footer`, estilos globales y navegacion mobile; calcula `backHref` con fallback.

## Componentes

- `src/components/Header.astro`: barra superior con logo y rutas principales.
- `src/components/Footer.astro`: pie de pagina con copy institucional.
- `src/components/SecondLevel.astro`: accesos de segundo nivel para comprar/vender/ofertar.
- `src/components/CategoryGrid.astro`: grilla de categorias con iconos y links dinamicos.
- `src/components/ProviderCard.astro`: card de proveedor/profesional con CTAs y rutas base configurables.

## Data

- `src/data/categories.js`: categorias con `name`, `slug` e `icon`.
- `src/data/providers.js`: proveedores con perfil, productos, servicios, ratings, avatar y datos de exhibicion.

## Paginas

- `src/pages/index.astro`: home con CTA a comprar, vender y ofertar.
- `src/pages/comprar.astro`: entrada al flujo de compra (segundo nivel).
- `src/pages/comprar/productos.astro`: grilla de categorias de productos.
- `src/pages/comprar/servicios.astro`: explicacion del flujo de servicios con CTA a publicar trabajo.
- `src/pages/comprar/productos/[categoria].astro`: listado de proveedores por categoria.
- `src/pages/proveedor/[slug]/index.astro`: perfil de proveedor desde flujo de compra.
- `src/pages/proveedor/[slug]/productos.astro`: catalogo con filtros, paginacion y copia de enlace.
- `src/pages/contratar/[slug].astro`: solicitud MVP de contratacion.
- `src/pages/carrito.astro`: carrito simulado basado en `localStorage`.
- `src/pages/finalizar-compra.astro`: cierre de compra con formulario simulado.
- `src/pages/compra-confirmada.astro`: confirmacion con animacion y redireccion.
- `src/pages/mis-compras.astro`: historial simulado de compras.
- `src/pages/mis-datos.astro`: datos personales simulados del usuario.
- `src/pages/profesionales.astro`: grilla de categorias de profesionales.
- `src/pages/profesionales/[categoria].astro`: listado de profesionales por categoria.
- `src/pages/profesionales/[slug]/index.astro`: perfil profesional con servicios destacados.
- `src/pages/profesionales/[slug]/productos.astro`: catalogo del profesional.
- `src/pages/vender.astro`: entrada al flujo de venta (segundo nivel).
- `src/pages/vender/productos.astro`: formulario MVP para publicar producto.
- `src/pages/vender/servicios.astro`: formulario MVP para crear perfil profesional.
- `src/pages/oferta.astro`: entrada al flujo de oferta (segundo nivel).
- `src/pages/oferta/productos.astro`: placeholder del flujo de ofertas de productos.
- `src/pages/oferta/servicios.astro`: placeholder del flujo de ofertas de servicios.
- `src/pages/registro.astro`: registro MVP de usuario.
- `src/pages/cuenta/profesional.astro`: activacion de perfil profesional.
- `src/pages/trabajos/publicar.astro`: publicacion MVP de trabajos.
- `src/pages/publicacion-confirmada.astro`: confirmacion de publicacion con redireccion.

## Estilos globales

- `src/styles/global.css`: reset, variables, paneles, tarjetas y formularios compartidos.

## Limpieza aplicada

- Eliminados archivos legacy: `src/pages/anterior.txt`, `src/components/ProfessionalCard.astro`, `src/layouts/SplitLayout.astro`, `src/pages/productos.astro`.
- Removida variable sin uso en `src/layouts/MainLayout.astro`.
- Depurados estilos globales sin uso en `src/styles/global.css`.

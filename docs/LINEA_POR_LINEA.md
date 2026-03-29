# Documentación técnica (actualizada)

Este documento reemplaza la versión línea por línea para mantener una referencia clara y sustentable.
Actualizado al 21 de marzo de 2026.

## Layouts

- `src/layouts/BaseLayout.astro`: estructura HTML base y `title` dinámico.
- `src/layouts/MainLayout.astro`: integra `Header`, `Footer`, estilos globales y navegación mobile; calcula `backHref` con fallback.

## Componentes

- `src/components/Header.astro`: barra superior con logo y rutas principales.
- `src/components/Footer.astro`: pie de página con copy institucional.
- `src/components/SecondLevel.astro`: accesos de segundo nivel para comprar/vender/ofertar.
- `src/components/CategoryGrid.astro`: grilla de categorías con iconos y links dinámicos.
- `src/components/ProviderCard.astro`: card de proveedor/profesional con CTAs y rutas base configurables.

## Data

- `src/data/categories.js`: categorías con `name`, `slug` e `icon`.
- `src/data/providers.js`: proveedores con perfil, productos, servicios, ratings, avatar y datos de exhibición.

## Páginas

- `src/pages/index.astro`: home con CTA a comprar, vender y ofertar.
- `src/pages/comprar.astro`: entrada al flujo de compra (segundo nivel).
- `src/pages/comprar/productos.astro`: grilla de categorías de productos.
- `src/pages/comprar/servicios.astro`: explicación del flujo de servicios con CTA a publicar trabajo.
- `src/pages/comprar/productos/[categoria].astro`: listado de proveedores por categoría.
- `src/pages/proveedor/[slug]/index.astro`: perfil de proveedor desde flujo de compra.
- `src/pages/proveedor/[slug]/productos.astro`: catálogo con filtros, paginación y copia de enlace.
- `src/pages/contratar/[slug].astro`: solicitud MVP de contratación.
- `src/pages/carrito.astro`: carrito simulado basado en `localStorage`.
- `src/pages/finalizar-compra.astro`: cierre de compra con formulario simulado.
- `src/pages/compra-confirmada.astro`: confirmación con animación y redirección.
- `src/pages/mis-compras.astro`: historial simulado de compras.
- `src/pages/mis-datos.astro`: datos personales simulados del usuario.
- `src/pages/mis-servicios.astro`: servicios activos e historial.
- `src/pages/mis-ventas.astro`: ventas activas e historial.
- `src/pages/profesionales.astro`: grilla de categorías de profesionales.
- `src/pages/profesionales/[categoria].astro`: listado de profesionales por categoría.
- `src/pages/profesionales/[slug]/index.astro`: perfil profesional con servicios destacados.
- `src/pages/profesionales/[slug]/productos.astro`: catálogo del profesional.
- `src/pages/vender.astro`: entrada al flujo de venta (segundo nivel).
- `src/pages/vender/productos.astro`: formulario MVP para publicar producto.
- `src/pages/vender/servicios.astro`: formulario MVP para crear perfil profesional.
- `src/pages/oferta.astro`: entrada al flujo de oferta (segundo nivel).
- `src/pages/oferta/productos.astro`: placeholder del flujo de ofertas de productos.
- `src/pages/oferta/servicios.astro`: placeholder del flujo de ofertas de servicios.
- `src/pages/registro.astro`: registro MVP de usuario.
- `src/pages/cuenta/profesional.astro`: activación de perfil profesional.
- `src/pages/trabajos/publicar.astro`: publicación MVP de trabajos con fecha/horario de visita y carga de imagen.
- `src/pages/publicacion-confirmada.astro`: confirmación de publicación con redirección.

## Estilos globales

- `src/styles/global.css`: reset, variables, paneles, tarjetas y formularios compartidos.

## Limpieza aplicada

- Eliminados archivos legacy: `src/pages/anterior.txt`, `src/components/ProfessionalCard.astro`, `src/layouts/SplitLayout.astro`, `src/pages/productos.astro`.
- Removida variable sin uso en `src/layouts/MainLayout.astro`.
- Depurados estilos globales sin uso en `src/styles/global.css`.

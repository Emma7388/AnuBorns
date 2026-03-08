# Architecture Guide

Este documento explica que hace cada archivo y que responsabilidad cumple cada bloque funcional.

## Layouts

### src/layouts/BaseLayout.astro
- Bloque de props: recibe `title` con fallback.
- Bloque de documento base: define estructura HTML general (`head`, `body`) y punto de insercion (`slot`).

### src/layouts/MainLayout.astro
- Bloque de imports compartidos: integra `Header`, `Footer` y estilos globales.
- Bloque de navegacion de regreso: calcula `backHref` automatico y permite override por prop.
- Bloque de composicion de pagina: envuelve contenido con header, boton volver y footer.

### src/layouts/SplitLayout.astro
- Bloque de props: titulo y ruta de regreso.
- Bloque de estructura en dos columnas: `left` y `right` mediante slots nombrados.
- Bloque de estilos locales: distribucion responsive y estilo del boton volver.

## Componentes

### src/components/Header.astro
- Bloque de barra superior: logo y navegacion principal del sitio.
- Bloque de estilos locales: colores, espaciado y hover.

### src/components/Footer.astro
- Bloque de pie de pagina con texto institucional.
- Bloque de estilos locales para fondo, color y separacion.

### src/components/SecondLevel.astro
- Bloque de normalizacion de ruta base.
- Bloque de opciones secundarias: acceso a productos y servicios.
- Bloque de estilos de tarjetas grandes.

### src/components/CategoryGrid.astro
- Bloque de datos: categorias y props de contexto (`basePath`, `type`).
- Bloque de render dinamico: genera links de categoria segun contexto.
- Bloque de estilos de grilla responsive.

### src/components/ProviderCard.astro
- Bloque de props del proveedor.
- Bloque visual de badges condicionales (ranking/sponsor).
- Bloque de acciones: `Ver productos` y `Ver perfil`, propagando `from` para conservar flujo de regreso.

### src/components/ProfessionalCard.astro
- Bloque de props de profesional.
- Bloque de contenido de card (imagen + metadatos).
- Bloque de estilos de card con hover.

## Data Layer

### src/data/categories.js
- Lista canonica de categorias (`name`, `slug`) usada por grids y rutas dinamicas.

### src/data/providers.js
- Lista de proveedores con metadatos de perfil y pricing promedio.
- Incluye `services` para perfil.
- Incluye `products` para catalogo por proveedor.

## Paginas

### src/pages/index.astro
- Hero principal con CTAs a comprar, vender y oferta.

### src/pages/comprar.astro
- Segundo nivel del flujo de compra.

### src/pages/vender.astro
- Segundo nivel del flujo de venta.

### src/pages/oferta.astro
- Segundo nivel del flujo de oferta.

### src/pages/productos.astro
- Entrada general a grilla de categorias de productos.

### src/pages/comprar/productos.astro
- Grilla de categorias para compra de productos.

### src/pages/comprar/servicios.astro
- Grilla de categorias para compra de servicios.

### src/pages/vender/productos.astro
- Grilla de categorias para venta de productos.

### src/pages/vender/servicios.astro
- Grilla de categorias para venta de servicios.

### src/pages/oferta/productos.astro
- Grilla de categorias para oferta de productos.

### src/pages/oferta/servicios.astro
- Grilla de categorias para oferta de servicios.

### src/pages/comprar/productos/[categoria].astro
- `getStaticPaths`: genera una pagina por categoria.
- Bloque de seleccion de contexto: resuelve categoria actual.
- Bloque de filtrado: reduce proveedores por categoria.
- Bloque de render: lista de `ProviderCard`.

### src/pages/proveedor/[slug]/index.astro
- `getStaticPaths`: genera perfil por proveedor.
- Bloque de recuperacion de proveedor/categoria.
- Bloque de navegacion de regreso: usa `from` y fallback seguro.
- Bloque de render principal: datos, bio, servicios y acciones.
- Bloque de fallback de error si el proveedor no existe.

### src/pages/proveedor/[slug]/productos.astro
- `getStaticPaths`: genera catalogo por proveedor.
- Bloque de recuperacion y fallback de datos de productos.
- Bloque de navegacion de regreso basada en `from`.
- Bloque de grilla de productos: cards con precio, descripcion y botones de maqueta.
- Bloque de fallback de error si el proveedor no existe.

### src/pages/contratar/[slug].astro
- `getStaticPaths`: genera una pagina de contratacion por proveedor.
- Bloque de recuperacion de contexto de proveedor.
- Bloque de navegacion de regreso basada en `from`.
- Bloque de formulario MVP de solicitud.
- Bloque de fallback de error.

## Estilos globales

### src/styles/global.css
- Reset base y variables compartidas.
- Tipografia y colores globales.
- Componentes utilitarios (`ab-*`) para paneles, botones y enlaces.
- Estilos de tarjetas de proveedor y catalogo de productos.
- Estilos de formulario de contratacion.

## Flujo de navegacion clave

1. Categoria: `/comprar/productos/[categoria]`.
2. Proveedor (catalogo): `/proveedor/[slug]/productos?from=...`.
3. Volver global resuelve ruta de origen por query param o fallback.
4. Perfil y contratacion mantienen consistencia de regreso con `from`.


# Architecture Guide

Este documento explica que hace cada archivo y que responsabilidad cumple cada bloque funcional.

## Layouts

### src/layouts/BaseLayout.astro
- Bloque de props: recibe `title` con fallback.
- Bloque de documento base: define estructura HTML general (`head`, `body`) y punto de insercion (`slot`).

### src/layouts/MainLayout.astro
- Bloque de imports compartidos: integra `Header`, `Footer` y estilos globales.
- Bloque de navegacion de regreso: calcula `backHref` automatico y permite override por prop.
- Bloque de composicion de pagina: envuelve contenido con header, contenido principal, footer y barra mobile.

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
- Bloque de datos: categorias y props de contexto (`basePath`, `type`, `title`, `hrefBase`).
- Bloque de render dinamico: genera links de categoria segun contexto y muestra iconos por categoria.
- Bloque de estilos de grilla responsive con tarjetas cuadradas.

### src/components/ProviderCard.astro
- Bloque de props del proveedor.
- Bloque visual de badges condicionales (ranking/sponsor).
- Bloque de acciones: `Ver productos` y `Ver perfil` usando rutas base configurables y `from`.

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

### src/pages/profesionales.astro
- Entrada general a grilla de categorias de profesionales.
- Panel de acceso a `Mis compras` y `Mis datos`.

### src/pages/registro.astro
- Formulario MVP de registro.

### src/pages/cuenta/profesional.astro
- Activacion del perfil profesional (MVP).

### src/pages/trabajos/publicar.astro
- Formulario MVP de publicacion de trabajos para servicios.

### src/pages/publicacion-confirmada.astro
- Confirmacion con animacion y redireccion a home.

### src/pages/comprar/productos.astro
- Grilla de categorias para compra de productos.

### src/pages/comprar/servicios.astro
- Pantalla de flujo de servicios con CTA a publicar trabajo.

### src/pages/vender/productos.astro
- Formulario MVP de publicacion de producto.

### src/pages/vender/servicios.astro
- Formulario MVP de alta de perfil profesional.

### src/pages/oferta/productos.astro
- Pantalla placeholder del flujo de ofertas de productos.

### src/pages/oferta/servicios.astro
- Pantalla placeholder del flujo de ofertas de servicios.

### src/pages/comprar/productos/[categoria].astro
- `getStaticPaths`: genera una pagina por categoria.
- Bloque de seleccion de contexto: resuelve categoria actual.
- Bloque de filtrado: reduce proveedores por categoria.
- Bloque de render: lista de `ProviderCard`.

### src/pages/profesionales/[categoria].astro
- `getStaticPaths`: genera una pagina por categoria.
- Bloque de filtrado/orden: filtra profesionales y ordena por promedio/reseñas.
- Bloque de render: lista de `ProviderCard` con rutas base de profesionales.

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
- Bloque de grilla de productos con filtros, paginacion y copia de enlace.
- Bloque de fallback de error si el proveedor no existe.

### src/pages/profesionales/[slug]/index.astro
- `getStaticPaths`: genera perfil por profesional.
- Bloque de recuperacion de proveedor/categoria.
- Bloque de navegacion de regreso: usa `from` y fallback seguro.
- Bloque de render principal: datos, bio, servicios y acciones.
- Bloque de fallback de error si el profesional no existe.

### src/pages/profesionales/[slug]/productos.astro
- `getStaticPaths`: genera catalogo por profesional.
- Bloque de recuperacion y fallback de datos de productos.
- Bloque de navegacion de regreso basada en `from`.
- Bloque de grilla de productos simple.
- Bloque de fallback de error si el profesional no existe.

### src/pages/contratar/[slug].astro
- `getStaticPaths`: genera una pagina de contratacion por proveedor.
- Bloque de recuperacion de contexto de proveedor.
- Bloque de navegacion de regreso basada en `from`.
- Bloque de formulario MVP de solicitud.
- Bloque de fallback de error.

### src/pages/carrito.astro
- Carrito simulado basado en `localStorage`.
- Render de items con cantidades y total.
- Acciones MVP: sumar/restar, quitar y finalizar compra.

### src/pages/finalizar-compra.astro
- Formulario simulado de entrega y pago con resumen.
- Redirecciona a confirmacion.

### src/pages/compra-confirmada.astro
- Animacion de tilde y mensaje de cierre.
- Limpia el carrito local y redirige a home.

### src/pages/mis-compras.astro
- Historial simulado de compras desde `localStorage`.

### src/pages/mis-datos.astro
- Ficha simulada de datos personales.

## Estilos globales

### src/styles/global.css
- Reset base y variables compartidas.
- Tipografia y colores globales.
- Componentes utilitarios (`ab-*`) para paneles, botones y enlaces.
- Estilos de tarjetas de proveedor y catalogo de productos.
- Estilos de formulario de contratacion.

## Flujo de navegacion clave

1. Categoria (compra): `/comprar/productos/[categoria]`.
2. Proveedor (catalogo): `/proveedor/[slug]/productos?from=...`.
3. Profesional (catalogo): `/profesionales/[slug]/productos?from=...`.
4. Volver global resuelve ruta de origen por query param o fallback.
5. Carrito simulado en `/carrito` usando datos locales.
6. Finalizacion en `/finalizar-compra`.
7. Confirmacion en `/compra-confirmada` con redireccion.
8. Perfil y contratacion mantienen consistencia de regreso con `from`.


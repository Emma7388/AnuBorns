diff --git a/README.md b/README.md
index 817dd80690254ec75c227497a46150b5c623d566..a2b75f236e3e54d8cbc458692fe3aad2d2ad68a0 100644
--- a/README.md
+++ b/README.md
@@ -1,43 +1,119 @@
-# Astro Starter Kit: Minimal
+# AnuBorns — Briefing operativo (MVP en construcción)
 
-```sh
-pnpm create astro@latest -- --template minimal
-```
+## Naturaleza del proyecto
 
-> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!
+AnuBorns es un **marketplace vertical de servicios** (oficios / construcción).
 
-## 🚀 Project Structure
+- No es e-commerce tradicional.
+- No hay carrito.
+- No hay checkout inmediato como flujo principal.
+- Es contratación directa con validación previa.
 
-Inside of your Astro project, you'll see the following folders and files:
+Repositorio: GitHub (usuario `emma7388`).
+Deploy activo: Vercel.
+Proveedor de pago objetivo: **Mercado Pago** (no Stripe).
 
-```text
-/
-├── public/
-├── src/
-│   └── pages/
-│       └── index.astro
-└── package.json
-```
+---
 
-Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.
+## Estado actual vs objetivo
 
-There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.
+### ✅ Lo que YA está implementado (coincide con código actual)
+- Flujo principal en construcción: `Comprar → Productos → Categorías → [categoria]`.
+- Ruta dinámica de categorías en `src/pages/comprar/productos/[categoria].astro`.
+- Render de proveedores por categoría con `ProviderCard`.
 
-Any static assets, like images, can be placed in the `public/` directory.
+### 🚧 Lo que está definido pero AÚN no cerrado en código
+- Página de perfil individual del proveedor (`/proveedor/[slug]`).
+- Inicio de contratación desde el perfil del proveedor.
+- Modelo de contratación con estados persistidos.
+- Integración completa con Mercado Pago + webhooks.
+- Modelo de comisión doble (cliente y profesional).
 
-## 🧞 Commands
+---
 
-All commands are run from the root of the project, from a terminal:
+## Flujo de usuario objetivo (producto)
 
-| Command                   | Action                                           |
-| :------------------------ | :----------------------------------------------- |
-| `pnpm install`             | Installs dependencies                            |
-| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
-| `pnpm build`           | Build your production site to `./dist/`          |
-| `pnpm preview`         | Preview your build locally, before deploying     |
-| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
-| `pnpm astro -- --help` | Get help using the Astro CLI                     |
+1. Cliente entra a `/comprar/productos`.
+2. Elige categoría (`/comprar/productos/[categoria]`).
+3. Ve lista de proveedores filtrados.
+4. Al seleccionar proveedor, navega a `/proveedor/[slug]`.
+5. Desde ese perfil inicia la contratación.
 
-## 👀 Want to learn more?
+> Nota: la selección de servicios específicos no vive en la lista de categorías; es una capa posterior del flujo.
 
-Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
+---
+
+## Modelo económico (regla de negocio)
+
+No se modela una única comisión descontada a una sola parte.
+El esquema objetivo es de comisión por ambos lados:
+
+- Precio base profesional: `100`
+- Cliente paga: `100 + % plataforma`
+- Profesional recibe: `100 - % plataforma`
+
+Esto debe quedar explícito en backend y trazable por operación.
+
+---
+
+## Pagos (Mercado Pago)
+
+No usar Stripe.
+Integración objetivo con Mercado Pago:
+
+- Crear preferencia de pago al iniciar contratación.
+- Registrar contratación interna en estado inicial.
+- Validación/aceptación profesional antes de confirmar etapa final.
+- Confirmación de estados con webhooks.
+
+### Estados de contratación esperados
+- `pending`
+- `accepted`
+- `rejected`
+- `paid`
+- `completed`
+
+Regla: no hay estados implícitos; todo estado debe persistirse explícitamente.
+
+---
+
+## Criterios técnicos del proyecto
+
+- No mezclar UI con lógica de negocio.
+- `ProviderCard` solo renderiza información (sin disparar pagos).
+- El perfil del proveedor concentra el inicio de contratación.
+- El pago final no debe ejecutarse automáticamente por un click de UI.
+- Confirmaciones sensibles por webhooks / backend.
+
+---
+
+## Pendientes arquitectónicos priorizados
+
+1. Página individual de proveedor (`/proveedor/[slug]`).
+2. Modelo de contratación y estados.
+3. Modelo de comisión doble.
+4. Integración Mercado Pago.
+5. Definición de base de datos.
+6. Dashboard profesional.
+
+---
+
+## Reglas de implementación
+
+- No romper el layout actual.
+- No hardcodear rutas innecesarias.
+- Componentización obligatoria.
+- Mantener flujo simple.
+- Backend limpio y escalable.
+
+---
+
+## Filosofía
+
+No es una landing.
+Es un marketplace estructurado con:
+
+- Validación previa.
+- Comisión inteligente.
+- Control de estados.
+- Escalabilidad futura.

# Flujo de Pull Requests

Actualizado al 23 de abril de 2026.

## Objetivo

Mantener PRs pequeños, testeables y con contexto suficiente para revisar rápido sin romper flujos clave (auth, carrito, compra y publicación).

## Convención de ramas

Usar ramas cortas con prefijo:

- `feat/` para funcionalidad nueva.
- `fix/` para correcciones.
- `refactor/` para cambios estructurales sin cambio funcional esperado.
- `docs/` para documentación.
- `chore/` para tareas operativas (scripts, config, limpieza).

Ejemplos:

- `feat/checkout-mercadopago`
- `fix/mis-compras-delete-modal`
- `docs/linea-por-linea-abril-2026`

## Tamaño y alcance

- Un PR por problema.
- Evitar mezclar frontend + backend + docs sin relación directa.
- Si el cambio toca más de un flujo (ejemplo: auth + carrito), explicitar impacto por flujo en la descripción.

## Checklist antes de abrir PR

- `pnpm dev` levanta sin errores.
- Se probó manualmente el/los flujo(s) tocados.
- No hay secretos en código ni en commits.
- Variables nuevas están documentadas en `.env.example` (si aplica).
- Si cambia esquema de Supabase, incluir SQL en `docs/` y pasos de migración.
- Documentación actualizada (`README.md`, `docs/LINEA_POR_LINEA.md`, u otra relevante).

## Smoke tests mínimos sugeridos

Según el tipo de cambio, validar al menos:

- Auth: `/registro` -> confirmación -> `/auth/callback` -> `/mis-datos`.
- Compra: `/comprar/productos/[categoria]` -> agregar al carrito -> `/carrito` -> `/finalizar-compra`.
- Perfil: editar datos y avatar en `/mis-datos`.
- Publicación: alta de producto en `/vender/productos` y visualización en `/mis-ventas`.
- Órdenes: ver historial en `/mis-compras`.

## Estructura sugerida del PR

Incluir secciones claras:

1. Contexto: qué problema resuelve.
2. Cambios: qué se modificó (archivo o módulo).
3. Pruebas: qué se probó y resultado.
4. Riesgos: posibles efectos colaterales y cómo mitigarlos.
5. Rollback: cómo deshacer rápido si hay incidente.

## Guía de commits

- Commits atómicos y descriptivos.
- Mensajes en imperativo y con alcance.
- Evitar `WIP` en commits finales del PR.

Ejemplos:

- `fix: validar returnTo en login y callback`
- `feat: guardar orden local en checkout fallback`
- `docs: actualizar flujo PR y linea por linea`

## Reglas de revisión

- Priorizar revisión funcional: regresiones, seguridad, estados vacíos, errores de red.
- Verificar consistencia de navegación (especialmente `backHref` y `returnTo`).
- Si hay cambios en API (`src/pages/api`), revisar también autenticación y manejo de errores.
- Si hay cambios en scripts de cliente, confirmar que no haya listeners duplicados ni roturas con navegación Astro.

## Criterio de merge

Merge cuando:

- El alcance está acotado y aprobado.
- Las pruebas declaradas son reproducibles.
- No quedan TODOs críticos sin issue asociado.

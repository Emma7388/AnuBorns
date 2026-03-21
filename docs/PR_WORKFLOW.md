# Flujo de Pull Requests

Este documento define un flujo simple para trabajar por pull request en este repositorio.

**Objetivo**
Trabajar en ramas cortas, con cambios acotados y documentados, para que cada PR sea facil de revisar.

**Convenciones de ramas**
Usa el prefijo segun el tipo de trabajo:
- `docs/` para documentacion.
- `refactor/` para reestructuras de carpetas o codigo.
- `feat/` para nuevas pantallas o flujos.
- `fix/` para correcciones puntuales.

Ejemplos:
- `docs/linea-por-linea-layouts`
- `refactor/rutas-comprar`
- `feat/flujo-contratacion`

**Checklist de PR**
Antes de abrir un PR, verificar:
- El cambio es autocontenido y no mezcla tareas.
- La navegacion sigue funcionando.
- Se actualizo la documentacion relevante en `docs/`.
- Se explica el contexto en la descripcion del PR.

**Estructura sugerida del PR**
Inclui en la descripcion:
- Que problema resuelve.
- Que archivos toca.
- Como se prueba (manual o no aplica).

**Reglas de revision**
- Un PR por tema.
- Evitar commits con cambios no relacionados.
- Si el PR reestructura rutas, incluir un mapa de rutas actualizado.

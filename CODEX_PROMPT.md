# Prompt reutilizable para Codex

Trabajá directamente sobre el repositorio actual de `tournament-management`. Inspeccioná primero el estado real, los cambios locales, `schema.sql`, migraciones, controladores, modelos, rutas, colección Bruno, Docker Compose, `package.json` y README. Conservá cambios locales no relacionados y modificá los archivos existentes; no dupliques controladores, modelos, rutas ni esquemas.

Implementá o verificá los siguientes requisitos:

1. Un nombre de torneo no puede repetirse en la misma localidad, ignorando mayúsculas y espacios al inicio/final. El mismo nombre sí puede existir en otra localidad.
2. Las localidades válidas son exactamente `Firmat`, `Venado Tuerto`, `Rosario` y `Elortondo`.
3. Los nombres de torneos y equipos, y las ubicaciones de partidos, deben ser texto no vacío y no exclusivamente numérico.
4. El único formato de torneo es `knockout`.
5. `max_teams` sólo acepta `4`, `8`, `16` o `32`. No se puede registrar más equipos que la capacidad ni reducirla por debajo de los equipos registrados.
6. Las modalidades válidas son exactamente `futbol_5`, `futbol_7` y `futbol_11`. No aceptar `futbol_8`.
7. El reglamento es compartido por modalidad y no admite texto libre: `official_rules_football_5`, `official_rules_football_7` y `official_rules_football_11`, respectivamente. Exigí `rules` en el POST y validá que coincida con `modality`. Documentá que fútbol 7 requiere un anexo regional porque no tiene un reglamento universal único.
8. Los equipos no tienen `city` ni `captain`.
9. Límites de plantel: `futbol_5` entre 5 y 10, `futbol_7` entre 7 y 14, `futbol_11` entre 11 y 22. Esta validación depende del torneo y debe hacerse en aplicación, con transacción para evitar exceder capacidad.
10. Rondas válidas: `round_of_32`, `round_of_16`, `quarter_final`, `semi_final`, `final`. Validá que la ronda corresponda a la capacidad del torneo.
11. Estados de torneo: `open`, `in_progress`, `finished`. Estados de partido: `scheduled`, `live`, `finished`, `suspended`.
12. Validá IDs positivos, fechas reales, goles enteros no negativos, equipos distintos y pertenecientes al torneo, duplicados de partidos y consistencia entre estado, goles y ganador.
13. En partidos finalizados, calculá el ganador desde los goles y rechazá un `winner_team_id` contradictorio. Si los goles empatan, exigí `home_penalties` y `away_penalties`, rechazá otro empate y calculá el ganador desde los penales.
14. Los penales sólo son válidos en partidos `finished` empatados en goles. No agregues `starting_round`.
15. Usá `CHECK` para reglas de una fila, índices únicos para duplicados, claves foráneas para relaciones y validación de aplicación para reglas que consultan otras filas/tablas. No consultes otras tablas desde un `CHECK`.
16. Actualizá `src/db/schema.sql` para instalaciones limpias y creá la siguiente migración numerada para bases existentes. No borres tablas, filas, volúmenes ni datos no relacionados. No ejecutes automáticamente migraciones destructivas.
17. Conservá las rutas HTTP públicas actuales. Actualizá Bruno y README.
18. Eliminá sólo dependencias realmente sin uso, agregá scripts de `build`, `start`, `test` y `typecheck`, e inicializá el esquema para volúmenes nuevos. No agregues un healthcheck a Docker Compose.
19. Agregá pruebas automatizadas para las validaciones críticas y ejecutá compilación, pruebas, auditoría de dependencias, validación de Compose y una verificación SQL transaccional con `ROLLBACK`.

Al finalizar, informá archivos modificados, verificaciones ejecutadas, decisiones de diseño, riesgos de datos históricos y los comandos exactos para aplicar las migraciones manualmente. No hagas commit, push, merge, reset, checkout ni cambios de rama.

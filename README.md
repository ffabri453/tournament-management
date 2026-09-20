# Gestión de Torneos Deportivos

API REST en TypeScript, Express y PostgreSQL para administrar torneos regionales de fútbol con formato de eliminación directa.

## Requisitos

- Node.js
- Docker con Docker Compose

## Inicio rápido

1. Copiar `.env.example` como `.env` y completar las variables.
2. Instalar dependencias con `npm install`.
3. Iniciar PostgreSQL con `docker compose -f docker-compose/docker-compose.yml up -d`.
4. Iniciar la API con `npm run dev`.

El contenedor aplica `src/db/schema.sql` automáticamente sólo cuando PostgreSQL inicializa un volumen nuevo. No elimina ni modifica volúmenes existentes.

## Scripts

- `npm run dev`: servidor con recarga.
- `npm run typecheck`: comprobación de TypeScript.
- `npm test`: pruebas automatizadas de validación.
- `npm run build`: compilación en `dist/`.
- `npm start`: ejecución de la compilación.

## Dominio

### Torneos

- Localidades: `Firmat`, `Venado Tuerto`, `Rosario`, `Elortondo`.
- Formato: `knockout`.
- Modalidades: `futbol_5`, `futbol_7`, `futbol_11`.
- Capacidad máxima: `4`, `8`, `16` o `32` equipos.
- Estados: `open`, `in_progress`, `finished`.
- El nombre no puede ser vacío ni exclusivamente numérico.
- El mismo nombre no puede repetirse en una localidad, ignorando mayúsculas y espacios exteriores.

En el POST, `rules` debe enviarse con el identificador correspondiente a la modalidad. El servidor valida la relación y guarda el mismo valor de forma automática:

| Modalidad | `rules` | Referencia |
| --- | --- | --- |
| `futbol_5` | `official_rules_football_5` | Reglas FIFA de futsal y reglamentos AFA de futsal |
| `futbol_7` | `official_rules_football_7` | Reglas IFAB con las adaptaciones regionales que debe definir la organización |
| `futbol_11` | `official_rules_football_11` | Reglas de juego IFAB |

Referencias: [reglamentos de futsal AFA](https://www.afa.com.ar/reglamentos/reglaments/futsal?s=9), [documentos IFAB](https://www.theifab.com/documents/) y [adaptaciones IFAB para fútbol base](https://www.theifab.com/laws/latest/general-modifications/).

### Equipos

Los equipos no tienen ciudad ni capitán. El nombre debe ser texto no numérico y es único por torneo ignorando mayúsculas y espacios exteriores.

| Modalidad | Mínimo | Máximo |
| --- | ---: | ---: |
| `futbol_5` | 5 | 10 |
| `futbol_7` | 7 | 14 |
| `futbol_11` | 11 | 22 |

Sólo se pueden registrar o editar equipos mientras el torneo esté `open`, y nunca se puede superar `max_teams`.

### Partidos

- Estados: `scheduled`, `live`, `finished`, `suspended`.
- Fecha y hora: `YYYY-MM-DD HH:mm`; por ejemplo, `2026-08-09 17:00`.
- Rondas: `round_of_32`, `round_of_16`, `quarter_final`, `semi_final`, `final`.
- Las rondas disponibles dependen de `max_teams`.
- Ambos equipos deben existir, ser distintos y pertenecer al torneo.
- Los goles son enteros no negativos.
- En un partido `finished`, el ganador se calcula automáticamente.
- Si los goles son distintos, `home_penalties` y `away_penalties` deben ser `null`.
- Si los goles terminan empatados, ambos penales son obligatorios, deben ser enteros no negativos y no pueden volver a empatar.
- El equipo con más penales se guarda como `winner_team_id` y avanza a la siguiente ronda.

## Rutas actuales

- Torneos: `/tournaments` y `/tournaments/:id`.
- Inicio del torneo: `POST /tournaments/:id/start` con `match_date` futuro.
- Avance de ronda: `POST /tournaments/:id/next-round` con `match_date` futuro. Genera sólo la ronda siguiente cuando todos los partidos de la ronda actual están finalizados y tienen ganador.
- Equipos: `/api/teams` y `/api/teams/:id`.
- Partidos: `/matches` y `/matches/:id`.

Se conservaron las rutas existentes para no romper consumidores actuales.

## Decisiones preparadas para una expansión

El `CHECK` de localidades es adecuado mientras el alcance sea regional y la lista cambie muy poco. Si la aplicación crece, conviene reemplazarlo por una tabla `locations` administrable, con identificador estable, nombre, provincia, país y estado activo; los torneos deberían guardar `location_id`. Así se agregan localidades sin desplegar una migración por cada cambio.

No se guarda un capitán como texto del equipo. Si más adelante se administran jugadores, la identidad debería vivir en una tabla `players` con un identificador propio y la capitanía debería ser una relación entre la inscripción del jugador y el equipo. Los nombres repetidos dejarían de ser un problema de identidad.

## Migraciones para una base existente

Las migraciones son transaccionales y no eliminan tablas ni filas. Ejecutarlas en orden desde la raíz del repositorio:

```powershell
Get-Content -Raw .\src\db\migrations\001_tournament_name_location_and_team_columns.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\002_domain_validation.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\003_penalty_shootouts.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\004_rename_official_rules.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
```

La migración `002` instala los nuevos `CHECK` como `NOT VALID`: protege inmediatamente las filas nuevas o modificadas sin borrar datos históricos incompatibles. Después de corregir datos antiguos, cada restricción puede validarse con `ALTER TABLE ... VALIDATE CONSTRAINT ...`.

Los índices únicos sí requieren que no existan duplicados previos. Si los hay, la transacción falla sin aplicar cambios parciales.

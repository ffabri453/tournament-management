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

Si ya tenés una base, aplicá las migraciones pendientes antes de iniciar la API. En particular, el flujo con campeón requiere `005_tournament_champion.sql`; encender Docker no actualiza un volumen existente.

## Pruebas con Bruno

Abrí la colección de la carpeta `bruno`, con el backend en `http://localhost:3000`.

- `01 CRUD`: ejecutá la carpeta completa en orden. Crea sus propios torneos, equipos y partidos, verifica las operaciones y elimina sus datos al terminar. Incluye rechazos esperados `400`, `404` y `409`, que tienen tests para distinguirlos de fallos.
- `02 Flujo completo`: ejecutá del 01 al 11 para crear un torneo de fútbol 5, registrar cuatro equipos, iniciar las semifinales, cargar resultados, generar la final y consultar el campeón. Los pasos 12 a 14 comprueban protecciones y esperan `409`.

Los scripts guardan los IDs en variables de ejecución y generan nombres únicos y fechas dinámicas. También podés enviar las solicitudes una por una respetando ese orden. Para repetir, comenzá nuevamente por la creación del torneo; no hace falta editar IDs. Cada ejecución del flujo completo deja un torneo `Copa Bruno ...` terminado como ejemplo consultable.

En estas pruebas el PUT de resultado coloca la fecha un minuto en el pasado para simular un partido jugado, mientras que el inicio y las rondas se programan para mañana.

El botón de ejecutar toda la colección recorre ambas carpetas. Desde Bruno CLI, dentro de `bruno`: `bru run --bail`. El runner permite indicar otro servidor con `--env-var baseUrl=http://localhost:3000`.

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
- `champion_team_id` permanece `null` hasta que termina la final y se completa automáticamente.
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

Sólo se pueden registrar equipos o cambiar su estructura mientras el torneo esté `open`, y nunca se puede superar `max_teams`. Después del inicio, únicamente se permite cambiar su nombre.

### Partidos

- Estados: `scheduled`, `live`, `finished`, `suspended`.
- Fecha y hora: `YYYY-MM-DD HH:mm`; por ejemplo, `2026-08-09 17:00`.
- Rondas: `round_of_32`, `round_of_16`, `quarter_final`, `semi_final`, `final`.
- Las rondas disponibles dependen de `max_teams`.
- Ambos equipos deben existir, ser distintos y pertenecer al torneo.
- Los goles son enteros no negativos.
- En un partido `finished`, el ganador se calcula automáticamente.
- El POST no permite crear una final ya terminada: debe finalizarse por PUT dentro del flujo del torneo para guardar el campeón de forma atómica.
- Los nombres de torneos/equipos y la ubicación del partido admiten hasta 100 caracteres, sin contar espacios exteriores.
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

Una vez iniciado el torneo, el CRUD general no permite cambiar su estructura, agregar o eliminar participantes, crear partidos manuales, alterar la estructura de los cruces ni modificar o borrar partidos finalizados. Los resultados de partidos todavía no finalizados se cargan mediante el CRUD existente.

Al finalizar correctamente el partido `final`, su `winner_team_id` se guarda automáticamente como `champion_team_id` y el torneo pasa a `finished`. El campeón y el estado no pueden modificarse mediante el CRUD general.

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
Get-Content -Raw .\src\db\migrations\005_tournament_champion.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
```

La migración `002` instala los nuevos `CHECK` como `NOT VALID`: protege inmediatamente las filas nuevas o modificadas sin borrar datos históricos incompatibles. Después de corregir datos antiguos, cada restricción puede validarse con `ALTER TABLE ... VALIDATE CONSTRAINT ...`.

Los índices únicos sí requieren que no existan duplicados previos. Si los hay, la transacción falla sin aplicar cambios parciales.

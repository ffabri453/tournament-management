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

La coleccion `bruno` contiene 18 solicitudes en ingles, organizadas en `tournaments`, `teams` y `match`: los 15 endpoints CRUD, `Start tournament`, `Next round` y `GET tournament bracket`.

Para probar el flujo basico de cuatro equipos, enviar individualmente en este orden:

1. `tournaments / Create tournament`.
2. `teams / Create team`, cuatro veces. Cada envio exitoso guarda el ID y prepara el siguiente nombre.
3. `tournaments / Start tournament`.
4. `match / Update match`, dos veces, para finalizar las semifinales.
5. `tournaments / Next round`.
6. `match / Update match`, una vez, para finalizar la final.
7. `tournaments / Get tournament by ID`, reemplazando el `1` de la URL por el ID del torneo creado, para consultar el estado `finished` y el campeon.

Los GET individuales (`Get tournament by ID`, `Get team by ID` y `Get match by ID`) usan un ID editable directamente en la URL. Cambiar el `1` de ejemplo por el ID que se quiere consultar; no dependen del ultimo registro creado.

Los scripts guardan los IDs y seleccionan el siguiente partido pendiente despues de un resultado exitoso. `Update match` usa un resultado de ejemplo 2-1 y una fecha un minuto en el pasado para simular un partido jugado; podes editar los goles y agregar penales si hay empate.

`Create match` es solo para probar el CRUD manual en un torneo abierto separado; no debe ejecutarse antes de `Start tournament` en el recorrido automatico. Los DELETE son pruebas manuales opcionales y respetan las restricciones del historial. No ejecutar toda la coleccion como una suite: las carpetas agrupan recursos, no el orden del flujo.

El servidor predeterminado es `http://localhost:3000`; se puede cambiar con la variable de entorno Bruno `baseUrl`. Para repetir el recorrido, comenzar de nuevo en `Create tournament`.

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

### Consulta del bracket

`GET /tournaments/:id/bracket` devuelve `{ tournament, rounds }` sin modificar datos. `tournament` conserva sus campos actuales y agrega `champion: { id, name } | null`, obtenido de `champion_team_id`. Cada elemento de `rounds` contiene `{ round, matches }`: solo rondas existentes en orden competitivo, con partidos por `id ASC`. Cada partido conserva todos sus campos (incluidos goles, penales y `winner_team_id`) y agrega `home_team`, `away_team` y `winner_team` con `{ id, name }`; sin ganador, `winner_team` es `null`.

Disponible en `open`, `in_progress` y `finished`; sin partidos devuelve `rounds: []`. Un ID invalido responde `400`, un torneo inexistente `404`. No genera rondas ni recalcula ganadores o campeon. En Bruno, usar `tournaments / GET tournament bracket` y reemplazar el `1` de la URL por el ID deseado.

## Usuarios: base de datos y modelo

La tabla `users` contiene `id`, `name`, `email`, `password_hash`, `role` y `created_at`, sin relaciones con los torneos. El email es unico ignorando mayusculas y espacios exteriores; los roles permitidos son `admin` y `organizer`, con `organizer` por defecto. Nombre, email y hash no pueden estar vacios.

`User.ts` recibe `password_hash` ya preparado y no calcula hashes. `createUser` y `findUserById` devuelven campos publicos; `findUserByEmail` es una consulta interna que tambien devuelve el hash. Esta etapa no agrega endpoints ni autenticacion. El modelo no verifica que el valor recibido sea un hash criptografico: nunca debe recibir una contrasena en texto plano.

`npm test` incluye los tests unitarios del modelo sin requerir PostgreSQL. Para comprobar los constraints reales, usar una base desechable llamada `users_test`, nunca `torneos_db`:

```powershell
$env:USER_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/users_test'
node --test --require ts-node/register tests/userDatabase.integration.ts
Remove-Item Env:USER_TEST_DATABASE_URL
```

La suite de integracion prueba tanto la migracion `006` como el esquema inicial, crea sus propios esquemas temporales y los elimina al terminar. Los valores de hash de los tests son ficticios, no credenciales reales.

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
Get-Content -Raw .\src\db\migrations\006_create_users.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
```

La migración `002` instala los nuevos `CHECK` como `NOT VALID`: protege inmediatamente las filas nuevas o modificadas sin borrar datos históricos incompatibles. Después de corregir datos antiguos, cada restricción puede validarse con `ALTER TABLE ... VALIDATE CONSTRAINT ...`.

Los índices únicos sí requieren que no existan duplicados previos. Si los hay, la transacción falla sin aplicar cambios parciales.

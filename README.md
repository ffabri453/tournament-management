# Gestión de Torneos Deportivos

API REST en TypeScript, Express y PostgreSQL para administrar torneos regionales de fútbol con formato de eliminación directa.

## Estructura del proyecto

```text
tournament-management/
  backend/       # API, migraciones, tests, Bruno y configuracion de Docker
  frontend/      # Aplicacion Angular, servicios y componentes
  README.md
  LICENSE
  .gitignore
```

El backend completo esta en `backend` y la aplicacion Angular esta en `frontend`.

Para iniciar Angular, abrir otra terminal desde la raiz del repositorio:

```powershell
cd frontend
npm install
npm start
```

## Requisitos

- Node.js
- Docker con Docker Compose

## Inicio rápido

Desde la raiz del repositorio, entrar primero a la carpeta del backend. Los comandos del backend en este README se ejecutan desde alli:

```powershell
cd backend
```

1. Copiar `.env.example` como `.env` y completar las variables.
2. Instalar dependencias con `npm install`.
3. Iniciar PostgreSQL con `docker compose -f docker-compose/docker-compose.yml up -d`.
4. Iniciar la API con `npm run dev`.

El contenedor aplica `src/db/schema.sql` automáticamente sólo cuando PostgreSQL inicializa un volumen nuevo. No elimina ni modifica volúmenes existentes.

Si ya usabas el proyecto antes de separar las carpetas, abrir una terminal nueva en `backend` y ejecutar Docker Compose desde esa ubicacion. Se conserva el mismo nombre de proyecto y volumen de PostgreSQL; no ejecutar `down -v` ni borrar el volumen. El cambio de carpetas no requiere volver a aplicar migraciones ya instaladas.

Si ya tenés una base, aplicá las migraciones pendientes antes de iniciar la API. En particular, el flujo con campeón requiere `005_tournament_champion.sql`; encender Docker no actualiza un volumen existente.

## Pruebas con Bruno

La coleccion `backend/bruno` contiene 20 solicitudes en ingles, organizadas en `tournaments`, `teams`, `match` y `auth`: los 15 endpoints CRUD, `Start tournament`, `Next round`, `GET tournament bracket`, `Register` y `Login`. Si Bruno tenia abierta la ubicacion anterior, volver a abrir la coleccion desde `backend/bruno`.

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

`User.ts` recibe `password_hash` ya preparado y no calcula hashes. `createUser` y `findUserById` devuelven campos publicos; `findUserByEmail` es una consulta interna que tambien devuelve el hash. El modelo no verifica que el valor recibido sea un hash criptografico: nunca debe recibir una contrasena en texto plano.

### Registro

`POST /auth/register` crea un usuario; no inicia sesion ni devuelve tokens. Requiere la migracion `006` en bases existentes. No se agrega otra migracion ni se modifican los torneos.

```json
{
  "name": "Fabrizio",
  "email": "fabri@example.com",
  "password": "ClaveSegura123",
  "role": "organizer"
}
```

- `name`: obligatorio, texto no numerico, entre 1 y 100 caracteres despues de `trim`.
- `email`: obligatorio, formato de email y hasta 254 caracteres; se guarda con `trim` y minusculas.
- `password`: obligatorio, minimo 8 caracteres y maximo 72 bytes UTF-8 (los caracteres Unicode pueden ocupar varios bytes). No admite solo espacios ni caracteres nulos; no se recorta ni se normaliza. No exige simbolos, numeros o mayusculas.
- `role`: opcional, solo `organizer`, que tambien es el valor predeterminado. El registro publico rechaza `admin`; ese rol sigue existiendo en la base para asignacion controlada futura.
- No se aceptan campos adicionales como `id` o `password_hash`.

El controlador usa bcrypt asincrono con costo 12 y sal aleatoria. Responde `201` con `{ message, data: { id, name, email, role, created_at } }`, sin contrasena ni hash. Datos invalidos: `400`; email duplicado: `409`, incluso ante registros simultaneos; error interno: `500` sin detalles sensibles.

En Bruno, enviar `auth / Register` a `http://localhost:3000/auth/register`. El primer envio devuelve `201`; repetir el mismo email devuelve `409`. Para crear otro usuario, cambiar el email. La contrasena de ejemplo es ficticia.

### Login

`POST /auth/login` comprueba las credenciales de un usuario existente. En Bruno, enviar `auth / Login` despues de `Register`; ambas requests usan las mismas credenciales de ejemplo:

```json
{
  "email": "fabri@example.com",
  "password": "ClaveSegura123"
}
```

Acepta solo `email` y `password`, ambos strings obligatorios. El email usa la misma validacion (hasta 254 caracteres) y normalizacion `trim` + minusculas que register. La contrasena no se recorta ni se normaliza: solo se exige que no este vacia, sin volver a imponer el minimo de 8 caracteres.

El controlador busca con `findUserByEmail` y usa `await bcrypt.compare(password, user.password_hash)`. Si coincide, responde `200` con los campos publicos existentes y la credencial JWT:

```json
{
  "message": "Login successful",
  "access_token": "<JWT firmado>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "data": {
    "id": 1,
    "name": "Fabrizio",
    "email": "fabri@example.com",
    "role": "organizer",
    "created_at": "2026-01-01T00:00:00.000Z"
  }
}
```

Usuario inexistente o contrasena incorrecta: `401` con exactamente `{ "error": true, "message": "Invalid credentials" }`. Las contrasenas de mas de 72 bytes UTF-8 tambien devuelven `401` para evitar coincidencias por truncamiento de bcrypt. Para probar un fallo en Bruno, cambiar la contrasena de `Login` por `wrong`.

Body o tipos invalidos: `400` con `Invalid login data` y `errors`. Errores internos: `500` con `{ "error": true, "message": "Error logging in" }`. No se devuelven contrasenas, hashes ni detalles internos. El login emite un JWT firmado; las rutas de gestion requieren autenticacion (ver el flujo siguiente). No se agrego mitigacion avanzada de diferencias de tiempo de respuesta.

### Autenticacion persistente

Antes de iniciar el backend, configurar `JWT_SECRET` en `backend/.env` con un secreto aleatorio de al menos 32 bytes. Para generarlo directamente en el archivo sin imprimirlo, ejecutar desde `backend` una sola vez (si ya existe, conservar su valor):

```powershell
node -e "const fs = require('node:fs'); const crypto = require('node:crypto'); fs.appendFileSync('.env', '\nJWT_SECRET=' + crypto.randomBytes(32).toString('hex') + '\n');"
npm.cmd run dev
```

El servidor rechaza el arranque si falta el secreto o es demasiado corto. No guardar `.env` en Git. No se requieren migraciones adicionales. En otra terminal, desde `frontend`, ejecutar `npm.cmd start` y abrir `http://localhost:4200`.

Se usa `jsonwebtoken` para firmar y verificar JWT HS256 con expiracion de una hora, issuer y audience `tournament-management`. El payload contiene solo `sub` (ID de usuario) y los claims tecnicos `iat`, `exp`, `iss`, `aud`; no contiene contrasena, hash ni role, porque no hay autorizacion por roles en este alcance. Referencia de la biblioteca: https://github.com/auth0/node-jsonwebtoken.

El middleware valida firma, algoritmo y expiracion, y consulta que el usuario siga existiendo. Protege todas las operaciones de `/tournaments`, `/matches`, `/api/teams`, ademas de `GET /auth/me` y el diagnostico `GET /db-test`. Son las APIs de las pantallas de gestion; no existe actualmente una pantalla publica de consulta. Login, registro y `GET /` siguen publicos. No se agregan permisos por propietario ni cambios en reglas de torneos, equipos o partidos.

Angular conserva solo el token en `sessionStorage`: sobrevive a F5 dentro de la pesta?a y se elimina al cerrar su sesion de navegador. Si el navegador bloquea storage, la sesion funciona en memoria hasta recargar. No se guardan contrasenas ni datos de usuario en storage. Esta eleccion mantiene el protocolo Bearer simple, pero el token es accesible a JavaScript y puede ser robado ante XSS; en produccion usar HTTPS y prevenir XSS. No hay refresh token: al expirar hay que iniciar sesion otra vez.

El interceptor envia `Authorization: Bearer <token>` solo a las rutas relativas `/api/tournaments`, `/api/teams`, `/api/matches` y `/api/auth/me`, incluidos sus recursos. No envia la credencial a login, registro, assets ni URLs externas. Un 401 de una peticion de la sesion actual limpia la credencial y navega a `/login`.

El guard conserva todas las rutas existentes y protege `/tournaments` y sus rutas de detalle, creacion, edicion, equipos, partidos y bracket. Comprueba la expiracion local para descartar tokens vencidos y llama a `/api/auth/me` en cada navegacion para validar la sesion en el servidor y recuperar el usuario. Los datos locales nunca son la prueba definitiva. Ante falta de credencial o fallo de verificacion redirige a `/login`.

El boton **Cerrar sesion** elimina token y usuario y navega a `/login`. No hay endpoint de logout: el cierre es local; una copia previamente robada del JWT sigue valida hasta su expiracion (sin lista de revocacion).

Prueba manual:

1. Abrir `/tournaments` sin login: debe redirigir a `/login`.
2. Iniciar sesion con un usuario existente o registrado mediante `POST /auth/register`: debe abrir `/tournaments`. Un password incorrecto debe mostrar el error seguro y permitir reintentar.
3. Navegar a detalle, equipos, partidos y bracket; sus flujos existentes deben funcionar.
4. Pulsar F5 en una ruta protegida: debe conservar la sesion y validar `/api/auth/me`.
5. En Network de DevTools, comprobar que `/api/auth/me` y las peticiones de gestion llevan Authorization y responden correctamente. No copiar ni publicar el token. Una peticion a `http://localhost:3000/tournaments` sin Authorization debe devolver 401.
6. Pulsar **Cerrar sesion**: debe volver a `/login` y eliminar `tournament.accessToken` de Session Storage.
7. Escribir `/tournaments` o una URL de bracket directamente, y probar Volver: no debe abrir una ruta protegida sin iniciar sesion.

`npm test` incluye los tests unitarios del modelo sin requerir PostgreSQL. Para comprobar los constraints reales, usar una base desechable llamada `users_test`, nunca `torneos_db`:

```powershell
$env:USER_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/users_test'
node --test --require ts-node/register tests/userDatabase.integration.ts
node --test --require ts-node/register tests/authRegister.integration.ts
node --test --require ts-node/register tests/authLogin.integration.ts
Remove-Item Env:USER_TEST_DATABASE_URL
```

La suite de usuarios prueba tanto la migracion `006` como el esquema inicial. La suite de registro prueba HTTP, bcrypt real, duplicados y concurrencia contra PostgreSQL. La suite de login registra un usuario, verifica su hash almacenado y comprueba credenciales correctas e incorrectas sin modificarlo. Las tres crean esquemas temporales y los eliminan al terminar. Los tests del modelo usan hashes ficticios; los de registro y login calculan hashes reales de contrasenas de prueba.

## Decisiones preparadas para una expansión

El `CHECK` de localidades es adecuado mientras el alcance sea regional y la lista cambie muy poco. Si la aplicación crece, conviene reemplazarlo por una tabla `locations` administrable, con identificador estable, nombre, provincia, país y estado activo; los torneos deberían guardar `location_id`. Así se agregan localidades sin desplegar una migración por cada cambio.

No se guarda un capitán como texto del equipo. Si más adelante se administran jugadores, la identidad debería vivir en una tabla `players` con un identificador propio y la capitanía debería ser una relación entre la inscripción del jugador y el equipo. Los nombres repetidos dejarían de ser un problema de identidad.

## Migraciones para una base existente

Ejecutar solo las migraciones pendientes, en orden, desde `backend` (no desde la raiz del repositorio):

Antes de aplicar una migracion, confirmar que el destino sea `torneos_db` y crear un respaldo completo en formato personalizado con `pg_dump -Fc`, guardado fuera del repositorio. No volver a ejecutar migraciones que ya esten instaladas.

```powershell
Get-Content -Raw .\src\db\migrations\001_tournament_name_location_and_team_columns.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\002_domain_validation.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\003_penalty_shootouts.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\004_rename_official_rules.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\005_tournament_champion.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\006_create_users.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\007_team_logos.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
```

La migracion `007_team_logos.sql` es incremental y no destructiva: agrega `logo_data BYTEA` y `logo_mime_type VARCHAR(10)` como columnas opcionales, por lo que los equipos existentes conservan todos sus datos y quedan sin escudo (`NULL`). Tambien agrega y valida `chk_team_logo_consistency`, que limita cada imagen a 1 MB y admite solo PNG, JPEG o WebP. La migracion se ejecuta dentro de una transaccion y `ON_ERROR_STOP=1` detiene el proceso ante el primer error; si falla, no intentar repararla automaticamente ni restaurar el respaldo sin revisar primero el mensaje de PostgreSQL.

La migración `002` instala los nuevos `CHECK` como `NOT VALID`: protege inmediatamente las filas nuevas o modificadas sin borrar datos históricos incompatibles. Después de corregir datos antiguos, cada restricción puede validarse con `ALTER TABLE ... VALIDATE CONSTRAINT ...`.

Los índices únicos sí requieren que no existan duplicados previos. Si los hay, la transacción falla sin aplicar cambios parciales.

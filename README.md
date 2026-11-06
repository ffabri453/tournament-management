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

## Interfaz web

La ruta `/` muestra la pagina publica de inicio del sistema. Desde alli se puede crear un torneo —iniciando sesion cuando sea necesario— o consultar los torneos existentes. El frontend utiliza una estetica futbolistica adaptable a distintos tamanos de pantalla, con fondos fotograficos optimizados, navegacion publica y acciones de gestion visibles segun los permisos del usuario.

La pantalla de partidos conserva las pestanas **Partidos** y **Cuadro**. La primera permite consultar y cargar resultados; la segunda presenta el bracket de eliminacion directa con desplazamiento horizontal, nombres completos, escudos, ganadores y rondas pendientes.

Las fotografias ubicadas en `frontend/public/images` forman parte del diseno recibido. El repositorio no incluye una atribucion ni una licencia especifica para esos archivos; antes de una publicacion fuera del ambito academico, sus responsables deben confirmar su origen y permiso de uso.

La interfaz usa **Inter** para textos y controles y **Barlow Condensed** para titulos y marcadores, cargadas desde Google Fonts con alternativas del sistema si el recurso externo no esta disponible. Ambas familias se distribuyen bajo SIL Open Font License: [metadatos de Inter](https://github.com/google/fonts/blob/main/ofl/inter/METADATA.pb) y [proyecto Barlow](https://github.com/jpt/barlow/blob/main/README.md).

Para iniciar Angular, abrir otra terminal desde la raiz del repositorio:

```powershell
cd frontend
npm.cmd ci
npm.cmd start
```

## Instalacion en Windows PowerShell

### Requisitos previos

- Git.
- Node.js con npm (los dos directorios incluyen `package-lock.json`).
- Docker Desktop con Docker Compose.

La plantilla incluye `DB_PASSWORD=1234` porque es la credencial de desarrollo local definida en Docker Compose. Es exclusiva para este entorno y no debe reutilizarse en produccion. No copies contrasenas reales ni secretos de produccion al README, a `.env.example` ni a ningun archivo versionado.

### 1. Clonar la rama correspondiente

Actualmente el trabajo y la verificacion previa se realizan sobre `develop`. Para revisar esa version antes de integrarla, abrir Windows PowerShell en la carpeta donde se quiera guardar el proyecto y ejecutar:

```powershell
git clone --branch develop --single-branch https://github.com/ffabri453/tournament-management.git
Set-Location .\tournament-management
git branch --show-current
```

El ultimo comando debe mostrar `develop`.

La **entrega final** debe clonarse desde `main`, pero solamente despues de integrar `develop` en `main` y verificar el resultado. Este procedimiento no realiza ese merge. Cuando la integracion ya este aprobada, el comando de clonacion para la entrega sera:

```powershell
git clone --branch main --single-branch https://github.com/ffabri453/tournament-management.git
Set-Location .\tournament-management
git branch --show-current
```

En ese caso, el ultimo comando debe mostrar `main`.

### 2. Configurar PostgreSQL y JWT

Crear el archivo local del backend a partir de la plantilla y abrirlo para revisar PostgreSQL y completar `JWT_SECRET`:

```powershell
Copy-Item .\backend\.env.example .\backend\.env
notepad .\backend\.env
```

La configuracion debe respetar estas reglas:

- `PORT`: puerto HTTP del backend; para el entorno local se usa `3000`.
- `DB_HOST`: `127.0.0.1` cuando el backend se ejecuta en Windows y PostgreSQL en Docker.
- `DB_PORT`: puerto publicado por Docker; por defecto, `5432`.
- `DB_NAME`: debe coincidir con `POSTGRES_DB` de `backend/docker-compose/docker-compose.yml`.
- `DB_USER`: debe coincidir con `POSTGRES_USER` del mismo archivo.
- `DB_PASSWORD`: `1234` coincide con `POSTGRES_PASSWORD` de Docker Compose y se usa exclusivamente para desarrollo local. Debe reemplazarse por una credencial segura y no versionada en cualquier entorno de produccion.
- `JWT_SECRET`: secreto aleatorio de al menos 32 bytes. No debe ser una frase de ejemplo ni reutilizar una contrasena.

Para generar `JWT_SECRET` y escribirlo directamente en `backend/.env` sin mostrarlo en la consola, ejecutar una sola vez desde la raiz del repositorio, despues de copiar la plantilla:

```powershell
node -e "const fs=require('node:fs');const crypto=require('node:crypto');const p='backend/.env';const v=crypto.randomBytes(32).toString('hex');const s=fs.readFileSync(p,'utf8').replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+v);fs.writeFileSync(p,s);"
```

`backend/.env` es local y no debe agregarse a Git. Si ya existe y contiene un secreto en uso, conservarlo en lugar de ejecutar nuevamente el comando.

### 3. Instalar dependencias reproducibles

Desde la raiz, instalar exactamente las versiones registradas en cada lockfile:

```powershell
Set-Location .\backend
npm.cmd ci
Set-Location ..\frontend
npm.cmd ci
Set-Location ..
```

### 4. Iniciar Docker y PostgreSQL

Iniciar Docker Desktop desde PowerShell (ruta predeterminada de instalacion) y esperar hasta que el motor indique que esta listo:

```powershell
Start-Process "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
docker info
```

Luego iniciar PostgreSQL:

```powershell
Set-Location .\backend
docker compose -f .\docker-compose\docker-compose.yml up -d
docker compose -f .\docker-compose\docker-compose.yml ps
```

En una **instalacion limpia**, el volumen de PostgreSQL todavia no existe y el contenedor aplica `src/db/schema.sql` automaticamente una sola vez. No hay que ejecutar tambien las migraciones sobre esa base nueva.

### 5. Iniciar el backend

En la misma terminal, desde `backend`:

```powershell
npm.cmd run dev
```

La API queda disponible en `http://localhost:3000`. El arranque falla de forma intencional si `JWT_SECRET` falta o tiene menos de 32 bytes.

### 6. Iniciar Angular

Abrir una segunda terminal PowerShell en la raiz del repositorio:

```powershell
Set-Location .\frontend
npm.cmd start
```

Abrir `http://localhost:4200`. Angular usa su proxy de desarrollo para comunicarse con el backend.

### Instalacion limpia frente a una base existente

- **Instalacion limpia:** Docker crea un volumen nuevo y ejecuta el esquema completo actual. No aplicar las migraciones incrementales despues.
- **Base existente:** Docker conserva el volumen y no vuelve a ejecutar `schema.sql`. Crear primero un respaldo, identificar que migraciones ya fueron aplicadas y ejecutar solamente las pendientes, en orden, como se indica en [Migraciones para una base existente](#migraciones-para-una-base-existente).
- No ejecutar `docker compose down -v`, no borrar el volumen y no recrear la base para intentar actualizarla: esas acciones eliminan datos locales.

GitHub conserva el codigo y los archivos versionados, pero **no** las cuentas, roles, torneos, equipos, partidos ni resultados guardados en PostgreSQL local o en el volumen de Docker. Tampoco conserva `backend/.env`. Por eso, clonar el repositorio en otra computadora crea una instalacion sin los datos locales anteriores; para trasladarlos se necesita un respaldo de PostgreSQL gestionado por separado y de forma segura.

## Permisos de gestion

- Visitante: consulta torneos, equipos, logos, resultados, bracket y campeon sin registrarse.
- Organizador: cualquier cuenta registrada puede crear torneos y gestionar solamente los propios.
- Admin: puede gestionar todos los torneos, incluidos los anteriores sin propietario. Las reglas deportivas siguen aplicandose, tambien para admins.
- `organizer_id` se asigna desde la sesion al crear, nunca desde el cuerpo enviado por el navegador. No hay transferencia de propietario ni asignacion publica de admins.
- La API devuelve `401` sin sesion y `403` al intentar gestionar un torneo ajeno. Controla tambien equipos, logos, partidos, inicio y siguiente ronda, dentro de las transacciones. Mover un equipo o partido requiere permiso sobre ambos torneos.
- Los torneos anteriores quedan con `organizer_id = NULL`, gestionables solo por admins. Para promover una cuenta, un responsable con acceso a PostgreSQL debe confirmar su email exacto, verificar que corresponde a esa persona y actualizar su rol. No se asignan roles por nombre ni por coincidencias parciales. Las cuentas y sus roles se configuran en cada base de datos; no se transfieren mediante Git. Nunca subir contrasenas ni archivos de credenciales al repositorio.

Prueba de integracion de permisos (desde `backend`, con las variables `DB_*` de una instancia PostgreSQL de desarrollo):

```powershell
$env:RUN_DB_TESTS = '1'
node --test --require ts-node/register tests/tournamentOwnership.integration.test.ts
Remove-Item Env:RUN_DB_TESTS
```

La prueba crea y elimina un esquema temporal unico: no escribe en las tablas de la aplicacion. Comprueba la migracion `008`, la consulta publica, permisos de propietario y admin, logos y el flujo hasta campeon. `npm.cmd test` la omite cuando `RUN_DB_TESTS` no vale `1`.

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

- `npm.cmd run dev`: servidor con recarga.
- `npm.cmd run typecheck`: comprobación de TypeScript.
- `npm.cmd test`: pruebas automatizadas de validación.
- `npm.cmd run build`: compilación en `dist/`.
- `npm.cmd start`: ejecución de la compilación.

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

La tabla `users` contiene `id`, `name`, `email`, `password_hash`, `role` y `created_at`. Desde la migracion `008`, `tournaments.organizer_id` referencia al usuario creador. El email es unico ignorando mayusculas y espacios exteriores; los roles permitidos son `admin` y `organizer`, con `organizer` por defecto. Nombre, email y hash no pueden estar vacios.

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

Tambien se puede registrar un organizador desde Angular: abrir `http://localhost:4200/register`, completar nombre, email y contrasena, y enviar el formulario. Toda cuenta creada por este formulario o por `POST /auth/register` recibe el rol `organizer`. El backend rechaza `role: "admin"`; no existe registro publico de administradores.

### Habilitar un administrador de forma controlada

Primero registrar a la persona como organizador. Despues, un responsable con acceso a PostgreSQL debe verificar su email exacto y promover esa unica cuenta. Desde `backend`, ejecutar la consulta de verificacion:

```powershell
$AdminEmail = Read-Host 'Email exacto de la cuenta que se promovera'
"SELECT id, name, email, role FROM users WHERE email = :'admin_email';" |
  docker compose -f .\docker-compose\docker-compose.yml exec -T postgres `
  psql -U postgres -d torneos_db -v ON_ERROR_STOP=1 -v admin_email="$AdminEmail"
```

Continuar solo si la consulta devuelve exactamente la cuenta esperada y su rol actual es `organizer`. La promocion se realiza en una transaccion y muestra la fila modificada:

```powershell
@'
BEGIN;
UPDATE users
SET role = 'admin'
WHERE email = :'admin_email' AND role = 'organizer'
RETURNING id, name, email, role;
COMMIT;
'@ | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres `
  psql -U postgres -d torneos_db -v ON_ERROR_STOP=1 -v admin_email="$AdminEmail"
Remove-Variable AdminEmail
```

El resultado debe indicar `UPDATE 1`. `UPDATE 0` significa que no se promovio ninguna cuenta y se debe revisar el email o el rol, sin ampliar la condicion SQL. Esta operacion se realiza por separado en cada base de datos: el rol no se guarda en GitHub ni viaja al clonar el repositorio.

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

Antes de iniciar el backend, configurar `JWT_SECRET` en `backend/.env` con el procedimiento del paso 2 de la instalacion. El servidor rechaza el arranque si falta el secreto o es demasiado corto. No guardar `.env` en Git. Las bases existentes requieren las migraciones pendientes, incluida `008` para propietarios. Para iniciar ambos servicios, seguir los pasos 5 y 6 y abrir `http://localhost:4200`.

Se usa `jsonwebtoken` para firmar y verificar JWT HS256 con expiracion de una hora, issuer y audience `tournament-management`. El payload contiene solo `sub` (ID de usuario) y los claims tecnicos `iat`, `exp`, `iss`, `aud`; no contiene contrasena, hash ni role. El backend consulta el rol actual en PostgreSQL en cada peticion protegida. Referencia de la biblioteca: https://github.com/auth0/node-jsonwebtoken.

El middleware valida firma, algoritmo y expiracion, y consulta que el usuario siga existiendo. Las siguientes consultas de torneos son publicas y no requieren JWT:

- `GET /tournaments` y `GET /tournaments/:id`.
- `GET /tournaments/:id/bracket`, con partidos, resultados y campeon.
- `GET /api/teams` y `GET /api/teams/:id`; el detalle usa este ultimo para resolver el nombre del campeon.
- `GET /matches`.

Todas las mutaciones de esas familias siguen protegidas, incluidos iniciar torneo y generar la siguiente ronda. Tambien siguen protegidos `GET /matches/:id`, `GET /auth/me`, `GET /db-test` y rutas desconocidas dentro de esas familias. Login, registro y `GET /` conservan su acceso publico. Se aplican los permisos por propietario descritos abajo sin cambiar las reglas deportivas.

Angular conserva solo el token en `sessionStorage`: sobrevive a F5 dentro de la pesta?a y se elimina al cerrar su sesion de navegador. Si el navegador bloquea storage, la sesion funciona en memoria hasta recargar. No se guardan contrasenas ni datos de usuario en storage. Esta eleccion mantiene el protocolo Bearer simple, pero el token es accesible a JavaScript y puede ser robado ante XSS; en produccion usar HTTPS y prevenir XSS. No hay refresh token: al expirar hay que iniciar sesion otra vez.

El interceptor envia `Authorization: Bearer <token>` cuando hay credencial, solo a las rutas relativas `/api/tournaments`, `/api/teams`, `/api/matches` y `/api/auth/me`, incluidos sus recursos. Los GET publicos funcionan sin token y el backend no valida las credenciales opcionales de esas lecturas. No envia la credencial a login, registro, assets ni URLs externas. Un 401 de una peticion protegida de la sesion actual limpia la credencial y navega a `/login`.

Angular permite consultar sin AuthGuard `/`, `/tournaments`, `/tournaments/:id`, `/tournaments/:id/teams`, `/tournaments/:id/matches` y `/tournaments/:id/bracket`. Las dos ultimas rutas reutilizan la misma pantalla con las pestanas Partidos y Cuadro. `/login` y `/register` siguen publicas; `/` muestra la pagina Home. El guard protege `/tournaments/new`, `/tournaments/:id/edit`, `/tournaments/:id/teams/new` y `/tournaments/:id/teams/:teamId/edit`: comprueba la expiracion local y valida la sesion con `/api/auth/me` antes de abrir los formularios.

La UI muestra acciones de gestion solo para el propietario o un admin despues de validar la sesion. Sin usuario muestra datos, resultados, seleccion de partidos y campeon. El enlace Crear torneo dirige al visitante a `/login?returnUrl=%2Ftournaments%2Fnew`; despues de ingresar abre el formulario de creacion. No permite modificar sin sesion. Al recargar, la aplicacion restaura la sesion mediante `/api/auth/me` si existe un token local vigente. Esta validacion inicial es opcional para la consulta publica: ante un error limpia la sesion y conserva la pantalla publica, sin redirigir a login.

El boton **Cerrar sesion** elimina token y usuario y navega a `/login`. No hay endpoint de logout: el cierre es local; una copia previamente robada del JWT sigue valida hasta su expiracion (sin lista de revocacion).

Prueba manual:

1. Iniciar backend y frontend como se indica arriba. Abrir una ventana privada en `http://localhost:4200/tournaments`: debe mostrar el listado sin editar ni eliminar. Crear torneo debe pedir login.
2. Abrir el detalle de un torneo, sus equipos, `/tournaments/:id/matches` y `/tournaments/:id/bracket`. Deben verse datos, resultados y campeon cuando corresponda. Seleccionar partidos en el cuadro debe mostrar sus datos sin abrir formularios de resultado. Recargar debe conservar la consulta sin pedir login.
3. Abrir `/tournaments/new`, `/tournaments/:id/edit`, `/tournaments/:id/teams/new` o `/tournaments/:id/teams/:teamId/edit` sin sesion: deben redirigir a `/login`. `/login` y `/register` deben permanecer accesibles.
4. Iniciar sesion como organizador y crear un torneo de prueba. Deben aparecer sus acciones de gestion segun el estado deportivo, pero no las de otro organizador. Un admin puede gestionar ambos. Probar equipos, inicio y resultados en ese torneo. Recargar una ruta publica debe validar `/api/auth/me` y recuperar los controles; un token rechazado debe dejar esa consulta en modo visitante.
5. En otra terminal ejecutar `curl.exe -i -X POST http://localhost:3000/tournaments -H "Content-Type: application/json" -d "{}"` sin Authorization: debe devolver `401 Authentication required`. Comprobar tambien PUT, PATCH y DELETE de torneos, equipos y partidos. `GET http://localhost:3000/tournaments` debe devolver 200; `/auth/me` y `/db-test` sin JWT deben devolver 401.
6. Pulsar **Cerrar sesion**: debe volver a `/login` y eliminar `tournament.accessToken` de Session Storage. Volver al listado o al bracket debe funcionar en modo visitante; las rutas de modificacion deben continuar bloqueadas.

`npm.cmd test` incluye los tests unitarios del modelo sin requerir PostgreSQL. Para comprobar los constraints reales, usar una base desechable llamada `users_test`, nunca `torneos_db`:

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

Esta seccion no corresponde a una instalacion limpia inicializada con el `schema.sql` actual. Antes de aplicar una migracion a una base existente, confirmar que el destino sea `torneos_db` y crear un respaldo completo en formato personalizado con `pg_dump -Fc`, guardado fuera del repositorio. No volver a ejecutar migraciones que ya esten instaladas.

```powershell
Get-Content -Raw .\src\db\migrations\001_tournament_name_location_and_team_columns.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\002_domain_validation.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\003_penalty_shootouts.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\004_rename_official_rules.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\005_tournament_champion.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\006_create_users.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\007_team_logos.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
Get-Content -Raw .\src\db\migrations\008_tournament_organizer.sql | docker compose -f .\docker-compose\docker-compose.yml exec -T postgres psql -U postgres -d torneos_db -v ON_ERROR_STOP=1
```

La migracion `007_team_logos.sql` es incremental y no destructiva: agrega `logo_data BYTEA` y `logo_mime_type VARCHAR(10)` como columnas opcionales, por lo que los equipos existentes conservan todos sus datos y quedan sin escudo (`NULL`). Tambien agrega y valida `chk_team_logo_consistency`, que limita cada imagen a 1 MB y admite solo PNG, JPEG o WebP. La migracion se ejecuta dentro de una transaccion y `ON_ERROR_STOP=1` detiene el proceso ante el primer error; si falla, no intentar repararla automaticamente ni restaurar el respaldo sin revisar primero el mensaje de PostgreSQL.

La migración `002` instala los nuevos `CHECK` como `NOT VALID`: protege inmediatamente las filas nuevas o modificadas sin borrar datos históricos incompatibles. Después de corregir datos antiguos, cada restricción puede validarse con `ALTER TABLE ... VALIDATE CONSTRAINT ...`.

Los índices únicos sí requieren que no existan duplicados previos. Si los hay, la transacción falla sin aplicar cambios parciales.

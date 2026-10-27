# Run MARKOS locally

This guide runs the web app, API, and AI service on your computer without paid providers. Run commands from the repository root unless stated otherwise. Deployment is covered separately in the [Railway guide](staging-deploy.md).

## First-time setup

You need Git, Node.js 22.13 or newer in the 22.x series with Corepack, Python 3.11, and Docker with Compose (Docker Desktop with WSL 2 on Windows). Start Docker before continuing. Dependency and container-image downloads require internet access.

### 1. Install dependencies

Clone the repository, open its directory, then run:

```sh
corepack pnpm install --frozen-lockfile
```

Corepack selects the pnpm version pinned by the repository. Do not change that version just to set up the project.

On Windows (PowerShell):

```powershell
py -3.11 -m venv services/ai/.venv
services/ai/.venv/Scripts/python.exe -m pip install -e "./services/ai[dev]"
```

On macOS/Linux:

```sh
python3.11 -m venv services/ai/.venv
services/ai/.venv/bin/python -m pip install -e './services/ai[dev]'
```

### 2. Configure local values

Copy `.env.example` to `.env` only if you do not already have one. In `.env`, replace `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `INTERNAL_SERVICE_TOKEN` with distinct local-only values of at least 32 characters. Create `services/ai/.env` containing the same `INTERNAL_SERVICE_TOKEN` value as the root file.

Keep the remaining local defaults. No OpenAI, email, storage, or Instagram credentials are needed. Both `.env` files are ignored by Git; never commit them or copy their values to a hosted environment.

```sh
corepack pnpm local:check
```

This checks local configuration, not whether dependencies or servers are healthy.

### 3. Prepare the database

```sh
docker compose up -d postgres redis opensearch
docker compose exec -T postgres pg_isready -U markos -d markos
```

Wait until PostgreSQL reports that it accepts connections. Then initialize its required extensions and UUID helper:

```sh
docker compose exec -T postgres psql --set=ON_ERROR_STOP=1 -U markos -d markos --file=/docker-entrypoint-initdb.d/001-init.sql
```

Set the Prisma database target in the same terminal. This URL is for the local Compose database only.

PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://markos:markos@localhost:5432/markos"
```

macOS/Linux:

```sh
export DATABASE_URL='postgresql://markos:markos@localhost:5432/markos'
```

Apply the database structure and create the four built-in plans:

```sh
corepack pnpm --filter api prisma generate
corepack pnpm --filter api prisma migrate deploy
corepack pnpm --filter api prisma db seed
corepack pnpm --filter api prisma migrate status
```

Stop if any command fails. The final command should report that the database is up to date. No users or sample content are seeded; create your own account in the app.

## Daily startup

```sh
docker compose up -d postgres redis opensearch
corepack pnpm dev
```

Keep the terminal open. Visit [English](http://localhost:3000/en) or [Arabic](http://localhost:3000/ar). If startup looks incomplete, check [API health](http://localhost:4000/v1/health) and [AI health](http://localhost:8000/ai/health).

Offline text responses are deterministic; AI image/video generation and provider-required document analysis are unavailable. Email stays local, uploads stay on disk, and Instagram publishing/analytics use dry-run behavior. Google sign-in and real Instagram connection still require external services. The background worker is not started by this command.

After pulling changes, reinstall dependencies only when their manifests/lockfile changed. If Prisma files changed, stop the app, set the local database target as above, and rerun generate, migrate, and seed. Do not delete migration files or reset your data for an ordinary update.

## Shutdown and common problems

Stop the app with Ctrl+C, then run `docker compose down`. This preserves your database and search data. Do not add `-v` unless you deliberately want to delete those volumes.

- **Cannot reach PostgreSQL:** check Docker is running and `docker compose ps` shows PostgreSQL healthy.
- **An application port is occupied:** stop the previous MARKOS session before starting another. The app uses ports 3000, 4000, and 8000.
- **Configuration rejected:** run `corepack pnpm local:check`; check the three replaced values and matching API/AI token.
- **Python is missing:** use Python 3.11 and the virtual-environment command for your operating system above.

Automated database tests need a separate disposable database. Do not run `test` or `verify` against the `markos` development database. See [testing guidance](../AGENTS.md#testing) before running suites.

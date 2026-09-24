# Windows handover with Railway data

Updated September 21, 2026. The local checkout is based on GitHub `main` at
`e3d51e4` (PR #35), matching the current Railway deployment. The workstation
launcher/configuration changes remain uncommitted locally.

## Default: use Railway

**Run MARKOS.cmd** now opens <https://web-production-94e63.up.railway.app/en/login>.
The user selected the hosted app on September 21; localhost is no longer the default.
The remaining sections describe the optional developer setup only.

## Optional local development on this PC

1. Explicitly run `powershell -File scripts/run-local.ps1` in the project folder.
2. Wait for readiness. The launcher opens <http://localhost:3000/en>.
3. Log in with an existing verified MARKOS account to use its current workspace.

The prepared `.env` selects `MARKOS_RUN_MODE=railway`. The local web and API use
the team's existing Railway production database, hosted AI and shared media.
Changes made through this local application affect that shared data. An internet
connection and the configured Railway access are required.

The first visit can take longer while Next.js compiles pages. A second Run reuses
the healthy launcher session. **Stop MARKOS.cmd** stops only its local API, web and
SSH tunnel. The hosted worker and AI keep running; local Redis/OpenSearch and
their Docker volumes remain available.

The launcher can start installed Docker Desktop in the background, checks
configuration and service readiness, and refuses unrelated listeners on its
application ports. It does not apply migrations, seed or reset databases, or
upgrade dependencies.

## What runs where

| Component | Active location |
| --- | --- |
| Web | Local `http://localhost:3000/en` or `/ar` |
| API | Local `http://localhost:4000`, bound with `API_HOST=127.0.0.1` |
| API health | `/v1/health` and `/v1/health/deep` on the local API |
| PostgreSQL/pgvector | Existing Railway production database `railway` |
| Database connection | Launcher-owned SSH tunnel, `127.0.0.1:15432` to the database service's `127.0.0.1:5432` |
| AI service | <https://ai-production-bc53.up.railway.app> |
| Background jobs | Existing hosted Railway worker; local processing is disabled and no local worker starts |
| Media | Existing private S3-compatible storage shared with Railway |
| Public media base | `https://api-production-dbba.up.railway.app` |
| Redis / OpenSearch | Local Docker services, ports 6379 / 9200 |
| Hosted web | <https://web-production-94e63.up.railway.app> |
| Application configuration | Ignored repository-root `.env` |
| SSH identity and known hosts | Workstation files under `C:/Users/mohamed.yusuf/.ssh/markos_railway*` |
| Launcher state and logs | Ignored `var/local-run/` |

The database has no new public TCP port. SSH uses the configured identity and
pinned known-hosts file. Internal API-to-AI authentication, database credentials,
encryption keys and storage access remain in ignored configuration. Do not copy
their values into Git, chat or reports.

The configured hosted media base allows the hosted worker and providers to reach
the same stored assets. Local file storage is not active in this profile. Models
and generation providers follow the hosted AI configuration; no local Python AI
service is started.

Relevant local logs include `web.log`, `api.log`, `database-tunnel.log` and their
`.error.log` counterparts, plus Docker and supervisor logs in `var/local-run/`.
Logs can contain application data; review them before sharing.

## Accounts, email and Instagram

Existing verified accounts can sign in locally. The SendGrid credential was not
available through the Railway handover. The local API retains
the SendGrid provider, but verification email delivery currently returns 503.
There is no local verification bypass in this profile.

For a new account or email verification, use the
[hosted MARKOS web app](https://web-production-94e63.up.railway.app), complete
verification there, then sign in locally. The hosted flow uses the existing
provider configuration; local setup does not establish that email was delivered.

The approved Instagram OAuth redirect returns to the hosted application. Connect
or reconnect Instagram through hosted Settings, then reload the local app to read
the shared connection. Existing permissions, account eligibility, MFA and owner
approval requirements still apply. Scheduling in MARKOS is not confirmation of
publication; the hosted worker must complete the real provider flow.

This handover connects the current project and its data. It does not make every
planned feature complete. Current source has no complete live billing flow, and
commercial quotas/billing eligibility remain deferred during private development.

The subsequent [showcase checks](showcase-readiness.md) verified live hosted text,
profile, Campaign, document, image and video generation. They also found no active
Instagram connections. These direct AI checks do not establish authenticated UI
generation or real publishing; the showcase note records the successful runtime
recovery drill and remaining validation.

## Data preservation and transfer

The user approved direct access to the existing Railway production database.
Read-only catalog checks found the current 20 applied migrations, pgvector,
37 RLS-enabled tables and a `markos_app` role without RLS bypass. This is a
configuration inventory, not proof of every workspace boundary through that role.
Those checks did not write application data, apply migrations or run seeds.

The previously prepared local `markos` database in `markos-ai_postgres-data`,
disposable test databases and older `markosai` volumes remain preserved. They are
inactive in the Railway profile. The active project reads current Railway data
directly; it does not use a local backup or the empty local development database.

The September 16 authoring migrations discard old disposable content. Any future
schema work on shared data needs an explicit migration/preservation plan and
matching API, web, AI and worker versions. Do not use resets or
`docker compose down -v` for routine startup recovery.

Copying the Git repository alone does not transfer this working connection.
Another PC needs dependencies, secure delivery of the required ignored `.env`
configuration, an authorized SSH identity and verified known-hosts configuration,
plus Railway and storage access. The SSH private key is outside the repository.
The cloud database, hosted AI, worker and media remain cloud dependencies.

Node dependencies use pnpm 11.5.2. This workstation has Node 24.14.1 and Docker
Desktop's Linux engine. Python 3.11 is needed only when developing/running the
local AI service; its existing environment is preserved but inactive here.

The `safe` and `live-ai` profiles remain available for separately configured local
development. They require a local database and their own compatible environment;
changing only the mode does not convert the shared Railway setup into a test
environment. Start Railway mode through **Run MARKOS.cmd** (or
`scripts/run-local.ps1 -Mode railway`) so tunnel and worker ownership are applied.

## Verification and limits

The Railway launcher passed startup, healthy-session reuse, Stop and restart
through the `.cmd` entry points. The final Run opened the browser and was left
running. API deep health reported PostgreSQL, Redis, OpenSearch and hosted AI
healthy. API/web listeners use `127.0.0.1`; the owned SSH tunnel uses port 15432.
Stop released ports 3000/4000/15432 and left Docker dependencies available. No
local AI listener on port 8000 or local worker was started.

Read-only browser checks returned HTTP 200 for `/en`, `/en/login` and `/ar/login`.
The two login fields rendered, English/Arabic document language and LTR/RTL
direction were correct, and there was no horizontal overflow at 1440×900 or
browser page error. No sign-in or application mutation was performed against the
shared database during these checks.

Shared storage listing and an existing object's HEAD request passed. A subsequent
unique temporary marker also passed Put, identical-byte Get, Delete and HEAD 404,
without changing database rows or existing assets. A presence-only hosted API
check confirmed SendGrid key/sender and Instagram app/encryption configuration;
it exported no secret values and did not send or test email delivery. The local
SendGrid credential remains unavailable.

The initial
hosted AI authentication probe returned 404 for a nonexistent route with
authentication, versus 401 anonymously. That initial probe made no generation
request. Subsequent live provider checks are recorded separately in
[Showcase readiness](showcase-readiness.md); they returned real generated content,
an image and a completed video, with token usage where provided. The read-only
database inventory is recorded above.

All 15 local-preflight tests passed, including the occupied-port check. The
focused API environment tests (23), processor tests (3) and API typecheck passed.
These checks do not claim a full repository suite.

An initial stale Next.js cache produced page 404s. The old `.next` cache was
preserved under ignored `var/railway-handover/next-cache-before-restart`, then the
web app recompiled. Subsequent restart and browser checks passed.

Earlier verification used isolated local databases and deterministic providers:

- API/web typechecks, Python dependency checks and local configuration checks
  passed during the source sync and local setup.
- Five focused API files passed 72 tests against `markos_handover_test`, covering
  baseline, RLS, workspace isolation, authentication and content.
- Real browser interactions against `markos_browser_test` passed signup/local
  verification, manual onboarding, profile generation/approval, Instagram
  postponement, caption editing, JPEG upload, Mark Ready, reload persistence,
  scheduling and Calendar detail/reload persistence. No mocked API responses or
  injected application state were used.
- English Insights showed the honest unsynced state. Arabic rendered with
  `lang=ar`, `dir=rtl` and no horizontal overflow at 1440×900. Evidence is in ignored
  `_analysis/browser-handover/`.
- The earlier local Run/Stop profile passed first startup, healthy reuse, Stop
  and restart. Seven existing local-preflight tests, PowerShell syntax checks and
  process-ownership checks also passed for that profile.

The earlier local browser results do not establish authenticated journeys on the
shared Railway database, real provider generation, Instagram publishing or hosted
worker delivery. Campaign generation, paid media generation and worker delivery
were not covered by that browser smoke. The subsequent showcase checks exercise
real hosted AI directly, without shared business-data writes or Library uploads.
Authenticated application generation and publication remain separate verification.

The initial launcher lifecycle checks passed, but a later showcase check found
the long-lived SSH tunnel still listening while database requests stalled.
Automatic recovery now passed a controlled drill that paused only the verified
launcher-owned SSH process. The launcher reported degraded at 10 seconds,
recovering at 55.7 seconds and Ready at 65.6 seconds, with full health confirmed
at 70 seconds. It kept the supervisor/web process and replaced only the tunnel
and API. Repeated Run waited through recovery and reused the same session.
PostgreSQL, Redis, OpenSearch and hosted AI recovered without shared database
writes. See [Showcase readiness](showcase-readiness.md) for the evidence and its
scope.

The final Stop/Run after that drill also passed: owned ports were freed, Docker
remained, Run opened the browser and all dependency health checks passed. The
app was left running.

Run focused tests only with an explicitly named disposable database and separate
test configuration. **Do not run `pnpm verify`, persistent API tests, seeds or
migrations against this workstation's shared Railway `.env`.** Broad regression
coverage belongs in CI or a separately prepared verification environment.

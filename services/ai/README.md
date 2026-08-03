# MARKOS AI Service

Status date: 2026-08-03.

This Python 3.11 FastAPI service exposes the current AI-shaped HTTP contract. It is useful local scaffolding and a deployable health target, but it is **not currently OpenAI-backed or production-ready AI**.

## Current behavior

The service currently provides:

- `GET /ai/health`: shallow process health returning `ok`;
- `GET /ai/health/deep`: deliberately returns `degraded` because database, provider, and embedding dependencies are `not_checked`;
- `POST /ai/vault/embed`: deterministic 1,536-dimension local embeddings;
- `POST /ai/strategy/generate`: fixed local strategy construction;
- `POST /ai/content/generate`: fixed local bilingual draft construction;
- `POST /ai/images/generate`: deterministic local SVG generation;
- `POST /ai/agents/run`: fixed output shapes for the eight configured MARKOS agent names.

The API gateway already calls these endpoints and supplies workspace-scoped Vault context for several flows. The FastAPI service itself does not retrieve from pgvector, call an AI provider, validate a provider response, or report real provider token usage.

Important current gaps:

- `OPENAI_API_KEY` appears in the repository environment inventory but is not read by `app/core/config.py` or used by `app/main.py`.
- No OpenAI SDK or provider HTTP call exists in the service.
- `INTERNAL_SERVICE_TOKEN` is loaded into settings but is not enforced on any route, and the API clients do not send it.
- The Docker image listens on fixed port 8000; Railway port/routing behavior must be verified during deployment.
- Deep health cannot support a production-ready claim while every dependency remains `not_checked`.

Do not expose the service publicly or describe backend connectivity as secure until the internal service boundary is authenticated and tested.

## Delivery phases

### Phase 1A: deploy and connect the service

Sarah owns the Railway service, networking, health, availability, and secret configuration for this phase. The smallest acceptable result is:

1. Review the current Dockerfile and Railway port contract.
2. Deploy the current service without claiming provider inference.
3. Configure a health check for `/ai/health`.
4. Give the API a reachable `AI_BASE_URL`, preferably through the reviewed Railway network path.
5. Protect the API-to-AI boundary and verify unauthorized requests fail.
6. Send one simple API-to-AI request and receive a response.
7. Document deployment and troubleshooting.

### Phase 1B: add one real provider-backed response

OpenAI is the intended initial provider, with other providers possible later. This phase requires an explicit implementation change, tests, and an authorized OpenAI API Platform project credential. A ChatGPT or Codex subscription is billed and managed separately from API use; it is not application API access.

Prefer a project-owned service-account credential over a personal shared key. Inject the credential only into the AI service through the deployment secret manager. Never commit, print, return, or place it in build arguments, client-side variables, logs, screenshots, or evidence artifacts.

Official references:

- [OpenAI API and ChatGPT billing are separate](https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api)
- [OpenAI project API keys and service-account ownership](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys)

Completion requires one real provider response through the deployed service and gateway, plus safe error handling and usage reporting. Merely setting `OPENAI_API_KEY` does nothing in the current source.

### Phase 2: generate the first onboarding draft

Khalid owns the product behavior and application integration. The intentionally small milestone is: take the user's onboarding/business information and produce a draft business profile for review. It is not the complete eight-agent platform.

### Phase 3: mature grounded retrieval and generation

Connect provider-backed embeddings, pgvector storage, workspace-scoped similarity retrieval, prompt assembly, provider generation, structured validation, metering, and broader agent behavior. The build specification's full RAG and cost-governance design remains the target; advanced retries and production-scale governance may follow the first safe provider path unless a critical safeguard is required earlier.

## Local development

Python must satisfy `>=3.11,<3.12`.

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

From the repository root, `corepack pnpm dev` also starts the AI service through `scripts/python-runner.mjs` when the local environment is installed.

## Current configuration names

Current FastAPI settings consume these names:

- `AI_PORT`
- `INTERNAL_SERVICE_TOKEN` (configured but not enforced)
- `DATABASE_URL` (configured but not used by current request handlers)
- `LLM_PRIMARY_MODEL`
- `LLM_FLAGSHIP_MODEL`
- `LLM_LONGFORM_MODEL`
- `LLM_CHEAP_MODEL`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `IMAGE_MODEL_PRIMARY`
- `IMAGE_MODEL_FALLBACK`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`

`OPENAI_API_KEY` is a future provider variable, not a current runtime dependency. Add it to the service settings only in the provider implementation that actually consumes it.

## Verification

Use the repository package scripts:

```bash
corepack pnpm --filter ai typecheck
corepack pnpm --filter ai lint
corepack pnpm --filter ai test
corepack pnpm --filter ai build
```

After deployment, verify `/ai/health` directly and then verify `/v1/health/deep` from the API. A reachable shallow health endpoint proves process availability only; it does not prove providers, embeddings, database access, authentication, or onboarding behavior.

See `../../docs/project-status.md` for the current roadmap and ownership, and `../../docs/staging-deploy.md` for the Railway service runbook.

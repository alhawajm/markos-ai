# MARKOS AI Service

Status date: 2026-08-05.

This Python 3.11 FastAPI service now contains the first provider-capable vertical slice. Strategy generation can use the OpenAI Responses API when explicitly configured; deterministic local generation remains the default for development. The OpenAI path is locally tested with a fake client, but it has not yet been exercised with a real credential or verified in Railway.

## Current behavior

The service currently provides:

- `GET /ai/health`: shallow process health returning `ok`;
- `GET /ai/health/deep`: deliberately returns `degraded` because database, provider, and embedding dependencies are `not_checked`;
- `POST /ai/vault/embed`: deterministic 1,536-dimension local embeddings;
- `POST /ai/strategy/generate`: strict, locale-aware Strategy generation through either the local adapter or the OpenAI adapter;
- `POST /ai/content/generate`: fixed local bilingual draft construction;
- `POST /ai/images/generate`: deterministic local SVG generation;
- `POST /ai/agents/run`: fixed output shapes for the eight configured MARKOS agent names;
- every non-health `/ai/*` route requires the shared API-to-AI bearer token.

The API gateway retrieves workspace-scoped Vault context, sends the requested locale and the configured long-form model, authenticates the request, applies a bounded timeout, and validates the Strategy response at runtime. The OpenAI adapter uses Structured Outputs, disables response storage, and reports the provider-returned model and input/output token counts. The FastAPI service does not retrieve directly from pgvector.

Important current gaps:

- No live OpenAI call, billing observation, or deployed gateway smoke test has been recorded yet.
- Content, images, embeddings, and the generic eight-agent route remain deterministic scaffolding.
- API interaction rows record real provider token counts for Strategy, but `costMinor` remains zero until a reviewed pricing calculation exists.
- The Docker image listens on fixed port 8000; Railway port/routing behavior must be verified during deployment.
- Deep health cannot support a production-ready claim while every dependency remains `not_checked`.

Do not describe backend connectivity or provider inference as production-verified until the deployed path is tested with independently configured secrets.

## Delivery phases

### Phase 1A: deploy and connect the service

Sarah owns the Railway service, networking, health, availability, and secret configuration for this phase. The smallest acceptable result is:

1. Review the current Dockerfile and Railway port contract.
2. Deploy the current service without claiming provider inference.
3. Configure a health check for `/ai/health`.
4. Give the API a reachable `AI_BASE_URL`, preferably through the reviewed Railway network path.
5. Configure the same non-default `INTERNAL_SERVICE_TOKEN` in both services and verify unauthorized requests fail.
6. Send one simple API-to-AI request and receive a response.
7. Document deployment and troubleshooting.

### Phase 1B: add one real provider-backed response

OpenAI is the initial Strategy provider, behind a narrow adapter so other providers remain possible later. The implementation and local fake-client tests now exist. The remaining phase evidence requires an authorized OpenAI API Platform project credential and one controlled live response. A ChatGPT or Codex subscription is billed and managed separately from API use; it is not application API access.

Prefer a project-owned service-account credential over a personal shared key. Inject the credential only into the AI service through the deployment secret manager. Never commit, print, return, or place it in build arguments, client-side variables, logs, screenshots, or evidence artifacts.

Official references:

- [OpenAI API and ChatGPT billing are separate](https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api)
- [OpenAI project API keys and service-account ownership](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys)

Completion requires one real provider response through the deployed service and gateway. Set `AI_TEXT_PROVIDER=openai`, configure a model slot, and provide `OPENAI_API_KEY` only to the AI service; merely creating a key does not prove the path.

### Phase 2: generate the first onboarding draft

Khalid owns the product behavior and application integration. The intentionally small milestone takes the user's seven onboarding modules and produces a bilingual draft business profile for review, editing, and approval. It is implemented as onboarding orchestration rather than a ninth public agent, and it is not the complete eight-agent platform.

The local provider remains deterministic for development. With `AI_TEXT_PROVIDER=openai`, both Strategy and onboarding profile resolution use the Responses API with strict JSON Schema output, provider-side storage disabled, and sanitized lifecycle logging.

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

For a controlled local OpenAI smoke test, keep the credential in the ignored `services/ai/.env` file, not the repository-root `.env`. The AI service file needs:

```dotenv
AI_TEXT_PROVIDER=openai
OPENAI_API_KEY=<project-service-account-key>
LLM_LONGFORM_MODEL=gpt-5.6-sol
INTERNAL_SERVICE_TOKEN=<same-local-token-as-api>
```

The repository-root `.env` should contain the matching `INTERNAL_SERVICE_TOKEN` and `LLM_LONGFORM_MODEL` for the API gateway, but not `OPENAI_API_KEY`. Railway must inject the key only into the AI service.

## Current configuration names

Current FastAPI settings consume these names:

- `AI_PORT`
- `INTERNAL_SERVICE_TOKEN` (enforced on every non-health AI route)
- `DATABASE_URL` (configured but not used by current request handlers)
- `AI_TEXT_PROVIDER` (`local` by default; set to `openai` for provider-backed Strategy and onboarding profile resolution)
- `AI_STRATEGY_TIMEOUT_SECONDS`
- `AI_PROFILE_TIMEOUT_SECONDS`
- `OPENAI_API_KEY`
- `OPENAI_TIMEOUT_SECONDS`
- `OPENAI_MAX_RETRIES`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `OPENAI_REASONING_EFFORT`
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

`OPENAI_API_KEY` is required only when `AI_TEXT_PROVIDER=openai`. Never place it in the API service, web environment, repository, command output, logs, screenshots, or test fixtures.

## Verification

Use the repository package scripts:

```bash
corepack pnpm --filter ai typecheck
corepack pnpm --filter ai lint
corepack pnpm --filter ai test
corepack pnpm --filter ai build
```

Pull-request CI explicitly uses `AI_TEXT_PROVIDER=local`, installs the production and test dependencies, runs the repository gates, builds the AI image, and smoke-tests health, authentication rejection, and one authorized synthetic Strategy response. It does not receive an OpenAI key or make paid provider calls.

After deployment, verify `/ai/health` directly and then verify `/v1/health/deep` from the API. A reachable shallow health endpoint proves process availability only; it does not prove providers, embeddings, database access, authentication, or onboarding behavior.

See `../../docs/project-status.md` for the current roadmap and ownership, and `../../docs/staging-deploy.md` for the Railway service runbook.

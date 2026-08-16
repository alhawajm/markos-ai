# MARKOS AI Service

Status date: 2026-08-16.

This Python 3.11 FastAPI service contains the first provider-capable vertical slices. Strategy and onboarding-profile resolution can use the OpenAI Responses API when explicitly configured; deterministic local behavior remains the default for development and for the other AI routes.

External evidence is narrower than the source capability: on 2026-08-06 a controlled direct Responses request from the Railway AI container succeeded and appeared in the OpenAI project logs, proving that request's credential, model access, billing, and outbound connectivity. The then-deployed application Strategy adapter still returned `AI_PROVIDER_UNAVAILABLE`. Current source replaced that adapter path with shared strict JSON Schema handling, but the replacement has not yet been deployed and verified through the browser-to-API-to-AI journey.

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

- The current shared provider adapter has no completed deployed browser-to-API-to-AI response and persisted-result evidence yet.
- Content, images, embeddings, and the generic eight-agent route remain deterministic scaffolding.
- Strategy/profile interaction rows can record provider token counts, but `costMinor` remains zero until a reviewed pricing calculation exists.
- The Docker image listens on fixed port 8000. A 2026-08-16 Railway screenshot shows a service-level `PORT` variable, but the current Docker command and Python settings do not consume that name; routing must therefore be verified rather than inferred from variable presence.
- Deep health cannot support a production-ready claim while every dependency remains `not_checked`.

Describe only the direct 2026-08-06 provider request as externally verified. Do not extend that evidence to Strategy, onboarding approval, RAG, or the eight-agent platform until the current deployed application path is tested.

## Delivery phases

### Phase 1A: deploy and connect the service

Sarah owns the Railway service, networking, health, availability, and secret configuration for this phase. The smallest acceptable result is:

1. Verify the fixed-port Docker/Railway routing contract and `/ai/health` check.
2. Confirm the API reaches the intended deployment through `AI_BASE_URL`.
3. Keep the same non-default `INTERNAL_SERVICE_TOKEN` in API and AI and verify unauthorized requests fail.
4. Deploy the current shared structured-output adapter.
5. Send one synthetic Strategy request through API to AI, confirm a validated persisted result and usage, and retain sanitized evidence.

### Phase 1B: add one real provider-backed response

OpenAI is the initial Strategy/profile provider behind a narrow adapter so other providers remain possible later. The authorized project credential and direct container call are externally evidenced; the remaining phase evidence is one controlled response through the current protected application path. A ChatGPT or Codex subscription is billed and managed separately from API use; it is not application API access.

Prefer a project-owned service-account credential over a personal shared key. Inject the credential only into the AI service through the deployment secret manager. Never commit, print, return, or place it in build arguments, client-side variables, logs, screenshots, or evidence artifacts.

Official references:

- [OpenAI API and ChatGPT billing are separate](https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api)
- [OpenAI project API keys and service-account ownership](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys)

Completion requires one real provider response through the deployed service and gateway. Set `AI_TEXT_PROVIDER=openai`, configure a model slot, and provide `OPENAI_API_KEY` only to the AI service; the prior direct request does not by itself prove this path.

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

Railway's platform-level `PORT` may exist, but current FastAPI settings use `AI_PORT` and the Docker command is fixed to 8000. Treat `PORT` as an externally supplied but currently unconsumed name for this service until the runtime contract is deliberately changed.

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

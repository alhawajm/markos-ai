# MARKOS AI Service

Status date: 2026-08-20.

This Python 3.11 FastAPI service contains the first provider-capable vertical slices. Strategy, onboarding-profile resolution, and bilingual content-copy generation can use the OpenAI Responses API when explicitly configured. Image generation can separately use the OpenAI Images API. Deterministic local behavior remains the default for development.

External evidence is narrower than the source capability: on 2026-08-06 a controlled direct Responses request from the Railway AI container succeeded and appeared in the OpenAI project logs, proving that request's credential, model access, billing, and outbound connectivity. The then-deployed application Strategy adapter still returned `AI_PROVIDER_UNAVAILABLE`. Current source replaced that adapter path with shared strict JSON Schema handling, but the replacement has not yet been deployed and verified through the browser-to-API-to-AI journey.

## Current behavior

The service currently provides:

- `GET /ai/health`: shallow process health returning `ok`;
- `GET /ai/health/deep`: deliberately returns `degraded` because database, provider, and embedding dependencies are `not_checked`;
- `POST /ai/vault/embed`: deterministic 1,536-dimension local embeddings;
- `POST /ai/strategy/generate`: strict, locale-aware Strategy generation through either the local adapter or the OpenAI adapter;
- `POST /ai/content/generate`: strict, grounded bilingual content generation through either the local adapter or the OpenAI adapter;
- `POST /ai/images/generate`: provider-selected JPEG generation with exact Instagram-oriented dimensions, provider usage, and validated bytes;
- `POST /ai/agents/run`: fixed output shapes for the eight configured MARKOS agent names;
- every non-health `/ai/*` route requires the shared API-to-AI bearer token.

The API gateway retrieves workspace-scoped Vault context, authenticates the request, selects configured prompt/model inputs, applies bounded timeouts, and validates provider responses at runtime. The OpenAI adapter uses Structured Outputs, stores response application state when `OPENAI_STORE_RESPONSES=true`, and reports the provider-returned model and input/output token counts. The FastAPI service does not retrieve directly from pgvector.

Important current gaps:

- The current shared provider adapter has no completed deployed browser-to-API-to-AI response and persisted-result evidence yet.
- Embeddings and the generic eight-agent route remain deterministic scaffolding. The image adapter is implemented but still needs a controlled deployed browser-to-provider proof.
- Strategy/profile/content interaction rows can record provider token counts, but `costMinor` remains zero until a reviewed pricing calculation exists.
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

OpenAI is the initial Strategy/profile/content-copy/image provider behind narrow adapters so other providers remain possible later. The authorized project credential and direct container call are externally evidenced; each application route still needs its own controlled protected-path result before it is called live-verified. A ChatGPT or Codex subscription is billed and managed separately from API use; it is not application API access.

Prefer a project-owned service-account credential over a personal shared key. Inject the credential only into the AI service through the deployment secret manager. Never commit, print, return, or place it in build arguments, client-side variables, logs, screenshots, or evidence artifacts.

Official references:

- [OpenAI API and ChatGPT billing are separate](https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api)
- [OpenAI project API keys and service-account ownership](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys)
- [OpenAI API data controls and Responses retention](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint)
- [OpenAI image-generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image 2 model](https://developers.openai.com/api/docs/models/gpt-image-2)

Completion requires one real provider response through the deployed service and gateway. Set the relevant provider selector (`AI_TEXT_PROVIDER` or `AI_IMAGE_PROVIDER`) to `openai`, configure its model slot, and provide `OPENAI_API_KEY` only to the AI service; the prior direct request does not by itself prove either path.

### Phase 2: generate the first onboarding draft

Khalid owns the product behavior and application integration. The intentionally small milestone takes the user's seven onboarding modules and produces a bilingual draft business profile for review, editing, and approval. It is implemented as onboarding orchestration rather than a ninth public agent, and it is not the complete eight-agent platform.

The local provider remains deterministic for development. With `AI_TEXT_PROVIDER=openai`, Strategy, onboarding profile resolution, and bilingual content-copy generation use the Responses API with strict JSON Schema output and sanitized application lifecycle logging. During the current quality-tuning phase, `OPENAI_STORE_RESPONSES=true` keeps provider inputs and outputs available in the OpenAI API dashboard for human review.

### Phase 3: mature grounded retrieval and generation

Connect provider-backed embeddings, pgvector storage, workspace-scoped similarity retrieval, prompt assembly, provider generation, structured validation, metering, and broader agent behavior. The build specification's full RAG and cost-governance design remains the target; advanced retries and production-scale governance may follow the first safe provider path unless a critical safeguard is required earlier.

## Local development

Python must satisfy `>=3.11,<3.12`.

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

From the repository root, MARKOS has two explicit local modes. Both start the AI service through `scripts/python-runner.mjs` when the local environment is installed:

```powershell
# Default: deterministic local text and image providers; no OpenAI key required.
corepack pnpm dev
# Equivalent explicit name:
corepack pnpm dev:safe

# OpenAI text generation; image generation remains local.
corepack pnpm dev:live-ai
```

The launcher validates the local URLs, database, internal token, email provider, media storage, Instagram modes, provider choice, and model names before starting anything. Run only the preflight when you do not want to start servers:

```powershell
corepack pnpm local:check:safe
corepack pnpm local:check:live-ai
```

Keep the OpenAI credential only in the ignored `services/ai/.env` file. The committed `.env.example` files remain secret-free, and the repository-root `.env` must not contain `OPENAI_API_KEY`. Local live-AI mode currently enables provider-backed text only; email, image generation, media storage, and Instagram publishing/analytics remain local or dry-run.

Use a dedicated local-development OpenAI project and project service-account key. The local AI environment should use:

```dotenv
AI_TEXT_PROVIDER=local
AI_IMAGE_PROVIDER=local
OPENAI_API_KEY=<dedicated-local-project-service-account-key>
OPENAI_STORE_RESPONSES=true
LLM_PRIMARY_MODEL=gpt-5.6-terra
LLM_LONGFORM_MODEL=gpt-5.6-sol
IMAGE_MODEL_PRIMARY=gpt-image-2
AI_DOCUMENT_TIMEOUT_SECONDS=50
AI_IMAGE_TIMEOUT_SECONDS=120
INTERNAL_SERVICE_TOKEN=<same-local-token-as-api>
```

The mode launcher overrides `AI_TEXT_PROVIDER` to `openai` only for `dev:live-ai`; keeping the file default at `local` makes accidental direct starts fail safely. The root and AI environment files must agree on the model names and internal token. These local files and values must never be copied to a hosted environment.

## Current configuration names

Current FastAPI settings consume these names:

- `AI_PORT`
- `INTERNAL_SERVICE_TOKEN` (enforced on every non-health AI route)
- `DATABASE_URL` (configured but not used by current request handlers)
- `AI_TEXT_PROVIDER` (`local` by default; set to `openai` for provider-backed Strategy, onboarding profile resolution, and content-copy generation)
- `AI_IMAGE_PROVIDER` (`local` by default; set to `openai` for provider-backed JPEG generation)
- `AI_STRATEGY_TIMEOUT_SECONDS`
- `AI_PROFILE_TIMEOUT_SECONDS`
- `AI_DOCUMENT_TIMEOUT_SECONDS`
- `AI_CONTENT_TIMEOUT_SECONDS`
- `AI_IMAGE_TIMEOUT_SECONDS`
- `OPENAI_API_KEY`
- `OPENAI_TIMEOUT_SECONDS`
- `OPENAI_MAX_RETRIES`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_STORE_RESPONSES` (`true` by default during the quality-tuning phase)
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

`OPENAI_API_KEY` is required when either provider selector is `openai`. Content generation prefers `LLM_PRIMARY_MODEL`; image generation prefers the gateway-selected `IMAGE_MODEL_PRIMARY` and falls back to the AI service's matching setting when the gateway still supplies a synthetic `local-*` default. Configure both primary model slots deliberately. Never place the key in the API service, web environment, repository, command output, logs, screenshots, or test fixtures.

With `OPENAI_STORE_RESPONSES=true`, the OpenAI project stores the request and response application state so the team can inspect generation quality, latency, and token usage in the API dashboard. This includes the business context deliberately sent to the model, so never send secrets, credentials, or raw private identifiers. Keep storage enabled throughout private development and reassess or disable it as part of the public-launch privacy and retention review. OpenAI Zero Data Retention projects override the value to `false`.

`OPENAI_STORE_RESPONSES` applies to the Responses API text adapters, not the Images API. Image requests still belong to the selected OpenAI project and are visible in its image usage; do not infer prompt-retention behavior from the text setting. The image adapter sends a pseudonymous hash rather than a raw workspace ID and never logs prompts or returned image bytes.

Railway's platform-level `PORT` may exist, but current FastAPI settings use `AI_PORT` and the Docker command is fixed to 8000. Treat `PORT` as an externally supplied but currently unconsumed name for this service until the runtime contract is deliberately changed.

## Verification

Use the repository package scripts:

```bash
corepack pnpm --filter ai typecheck
corepack pnpm --filter ai lint
corepack pnpm --filter ai test
corepack pnpm --filter ai build
```

Pull-request CI explicitly uses local text and image providers, installs the production and test dependencies, runs the repository gates, builds the AI image, and smoke-tests health, authentication rejection, and one authorized synthetic Strategy response. It does not receive an OpenAI key or make paid provider calls.

After deployment, verify `/ai/health` directly and then verify `/v1/health/deep` from the API. A reachable shallow health endpoint proves process availability only; it does not prove providers, embeddings, database access, authentication, or onboarding behavior.

See `../../docs/project-status.md` for the current roadmap and ownership, and `../../docs/staging-deploy.md` for the Railway service runbook.

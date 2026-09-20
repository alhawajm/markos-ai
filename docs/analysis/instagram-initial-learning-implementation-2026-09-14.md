# Initial Instagram learning — implementation checkpoint

## Approved scope

This implements the September 14 decisions made after the technical and product audits. Their earlier proposal for a separate authoritative Instagram baseline is superseded: Instagram exploration is an extension of onboarding, and the owner approves its useful additions into the existing Business Profile.

The flow is `approve business onboarding → Instagram setup → MFA enrollment if needed → Instagram authorization → exploration → review/edit/select → save to Business Profile → Overview`.

Before connecting, **Do this later** allows normal app exploration. Overview and Business Profile show a connection banner while disconnected. The Settings Connect action also enters setup. Existing connected accounts can visit setup once to run this first exploration; completed learning does not run again on ordinary visits.

## Implementation passes

1. **Guided entry and security:** add `/{locale}/instagram-setup`, onboarding handoff and disconnected banners. Reuse MFA enrollment inline; OAuth start requires enabled MFA, not a fresh 15-minute step-up. Existing Settings refresh/disconnect protections remain.
2. **Evidence collection:** reuse the Instagram Login v25.0 Graph client, encrypted workspace credential and original permission set. Bounded discovery and optional metric fallback; no additional worker or scheduled crawl.
3. **Interpretation and review:** one structured, multimodal AI request proposes supported Brand & Voice / Marketing Strategy fields. English and Arabic review supports selecting, editing, keeping existing values, and retrying failed operations.
4. **Approval and grounding:** reuse the versioned authoritative profile, atomic module writer and derived Vault projections. Verify changes reach future Create and Campaign requests.
5. **Focused verification:** evidence/security tests, disposable database tests, AI provider tests, targeted browser journeys, type checks, lint/format and web build. No production mutation or real publish is part of this pass.

## Evidence limits and API decisions

- Scan up to **50 media records / five pages**, using provider cursors with the existing v25.0 transport. Never follow arbitrary pagination URLs. Disclose bounded history; do not promise an all-time top five.
- Choose five latest posts, then five distinct strongest found using available likes, comments, saves and shares. For fewer than ten posts, include all available posts. Reach/views provide supporting context; missing values stay unavailable rather than becoming measured zero.
- Preserve IMAGE / CAROUSEL_ALBUM / REELS distinctions. Analyze a representative image or video thumbnail only, not every slide, full video, audio, or expired Stories.
- Optional profile fields are requested separately. Error 100 on an optional field does not discard discovery. A combined insights request rejected for an unsupported metric falls back to individual metrics. Rate/auth limits stop further insights requests and disclose partial evidence.
- Collection permits at most 100 requests, three concurrent media insight requests, and stops launching requests after 75 seconds. An already running Graph request retains the shared timeout. These are operational bounds, not commercial quotas.
- Provider-owned HTTPS cover URLs are transient input to the vision call; signed cover URLs and access tokens are not stored in the learning record. Stored evidence contains captions, normalized available metrics, source IDs and safe Instagram permalinks.
- Keep `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_insights`. No Facebook Page workflow, new permission, version upgrade, or credential change.

The repository's current v25.0 tests and existing analytics implementation are the executable contract. During this pass, Meta's reference pages returned HTTP 429; the fetched [official Meta Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) also includes Facebook Login examples and is not proof of every optional Instagram Login field. Do not claim a fresh live Meta contract check passed. Optional fields/metrics degrade explicitly, and designated-account testing must confirm actual availability.

The vision request uses the existing structured OpenAI provider and its configured primary model, with labelled cover images at low detail following the [official image-input guide](https://developers.openai.com/api/docs/guides/images-vision). A vision-capable configured model is required for real interpretation.

## Ownership and persistence

An existing workspace-scoped `AiInteraction` records the one-time run and visible PENDING / COLLECTING / ANALYZING / READY / APPROVED / SKIPPED / FAILED states. This is proposal/workflow evidence, not another authoritative profile. No new table or migration is needed.

The four permitted proposed targets are:

| Business Profile area | Field | Purpose |
| --- | --- | --- |
| Brand & Voice | Tone | Supported tone terms |
| Brand & Voice | Writing preferences | Languages/order, caption structure, CTA/hashtag habits |
| Brand & Voice | Personality & visual direction | Cover-supported presentation preferences |
| Marketing Strategy | Content direction | Useful themes and format direction alongside owner goals |

Content direction is one optional field in the existing objectives module, not a separate strategy model. The model sees current approved target values and must preserve their explicit requirements in proposed replacements. Every proposal needs references to supplied posts. Facts, offering records, prices, contacts and business goals are not AI-editable here. The subsequent September 14 review pass adds an optional observed palette only when brand colors are absent; saved colors are protected.

One approval transaction validates all selected fields, checks the profile revision, writes reviewed values and derived projections, retires stale summary data, and marks approval. No AI call is required to save. Repeated approval cannot increment the profile again. Workspace filtering and claim locking prevent cross-workspace access and duplicate active calls. Failed saves keep edits visible; late progress results cannot reset reviewed text. Existing retrieval behavior indexes committed facts on demand. Current brand/tone/objective context is included in future generation; historical posts and campaigns remain unchanged.

## Explicitly deferred

- Interrupted-process recovery, leases, resume/reminder UX and durable background execution. Analysis is request-owned, with status polling for display; leaving/redeployment can interrupt it. The UI asks the user to stay through review. Do not deploy this as a continuously running learning job.
- Different-account connection, disconnect/reconnect semantics, source deletion and historical reconciliation.
- Multiple learning versions, rerun controls, source history UI, retention/export refinements.
- Continuous Intelligence, autonomous strategy changes, recommendations, campaign feedback learning and establishment-based challenge frequency.
- Full-history rankings, normalized cross-format performance models, demographics, full Reel/carousel analysis and comments.
- Removal/redesign of the existing Settings 15-minute authorization window. Only the initial OAuth enrollment gate changes here.

## Verification and live boundary

Tests use `markos_local_test` on loopback, mocked Meta/provider requests, and the installed Chrome browser. The ordinary `markos` database and fixed manual accounts are untouched.

Passed locally:

- `prisma migrate deploy` against the test database: no pending migrations (17 existing migrations).
- API Vitest: **37 tests / 6 files** — `instagram-learning.integration`, `business-knowledge`, `instagram-routes.integration`, `instagram-learning-evidence`, `instagram-setup-security`, and `instagram-security-foundation`.
- AI pytest: **3 tests** in `tests/test_instagram_learning.py`; focused Ruff and strict mypy passed.
- New guided-setup browser file: **3 tests**, covering inline MFA without step-up, duplicate connection prevention, failed connection, late progress, edited-value preservation, failed save/retry, selected-field approval, and Arabic/dark review with skip.
- Existing affected browser journeys: **3 tests** selected from Settings and presentation journeys (Settings Connect, reviewed onboarding approval, completed-onboarding redirect). The other 25 tests in those files were intentionally not run.
- API and web TypeScript, plus shared-types, validation and API-client TypeScript checks.
- ESLint on the changed web components/routes/tests and Prettier on the changed TypeScript files.
- Web production build: compiled and generated **59 routes/pages**, including both `/en/instagram-setup` and `/ar/instagram-setup`.

The first OAuth integration run failed because this test process lacked the test-only encryption key required by the existing fixture. Re-running with the repository CI fixture configuration passed; no production credential or product behavior was changed to bypass encryption.

No full-repository verification suite, broad visual audit, screenshot baseline update, or deployment was performed. The temporary browser-test web server was stopped after the focused tests. PostgreSQL and Redis remain available.

No real Instagram account exploration, provider-backed interpretation, or Railway deployment has been verified by these checks. The first established-business exercise must confirm actual optional fields/metric availability, cover fetches, recognizable proposals, and their effect on a newly generated campaign and Create request.


## Staging feedback and focused review refinement

Khalid reported successful first-connection learning in staging, useful cited evidence, and successful integration into Business Profile. This is operator-reported hosted evidence for the initial implementation; the following refinement still needs deployment/review.

The approved follow-up introduces compact setup chrome, two review steps, independent content scrolling and always-visible action controls. The existing summary and limitations become expandable. Post references and the Posts examined analytics remain accessible. Optional observed colors use the existing brand field, remain unselected initially, require image references, and cannot replace saved colors.

Focused verification: 7 API integration tests, 4 AI tests, and 4 browser tests passed. Coverage includes existing-color protection, missing-image rejection, invalid palette values, explicit palette selection, synchronized picker values, mobile footer visibility, selected-field persistence through step navigation and failed saves, inline MFA, and Arabic/dark review. The first browser run hit the documented sandbox Next.js false-404 issue; the same test server restarted outside the sandbox served the routes and passed. No hosted account mutations or real provider generation were performed for this refinement.

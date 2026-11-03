# Instagram Integration and App Review Status

Current overlay: 2026-11-03. Earlier investigations and checkpoints below are retained as dated evidence.

Meta submission preparation began on **28 October 2026**. The formal App Review request was submitted on **1 November 2026 at 09:14 Bahrain time** and Meta now shows **Review in progress**. This is submission confirmation, not approval or public availability. Dates in these checkpoints use Bahrain time (UTC+03:00).

The 3 November saved-session check reconfirmed **Verified** company status, **Review in progress** for the three Instagram permissions, and an **Unpublished** app. The checked alert was the submission confirmation; no reviewer correction or additional action was requested. The existing review was preserved.

## Current submission preparation

- On 28 October the owner confirmed that the existing Meta app connected an eligible demo account and successfully published. The account still has to be added as an app tester before it can connect. This is owner-confirmed functional evidence, not Advanced Access approval; do not treat connection or publishing implementation as the current blocker or repeat a live publish as a routine test.
- The current goal is the decision on the submitted Advanced Access request and any actual reviewer feedback. Preserve the existing Meta app, request and demo connection. Do not create a replacement app, invite each customer as a tester, change login families or add unrelated permissions as a workaround. Public access remains a separate action after approval and the release gates.
- Operator: **Raedat Software Company W.L.L**. Public support/privacy contact: **support@raedat.online**. The registered address was matched to the supplied certificate and existing company account; see [company metadata](../apps/mobile/store/company.json). Final legal review remains pending.
- Railway hosts the website, API, AI, workers, private media and CPU Motion Reels. Current deployment/recovery evidence is in [release readiness](release-readiness.md) and the [recovery runbook](recovery-runbook.md).
- The deployed request set is exactly `instagram_business_basic`, `instagram_business_content_publish` and `instagram_business_manage_insights`. Comments and messaging are outside this release.
- On 27 October the stored review-account connection was CONNECTED with an unexpired token and the canonical requested scopes. Read-only requests for reach, views and profile_views each returned HTTP 200, and live worker snapshots are stored. Requested scopes and successful account insights do not establish publishing permission or Advanced Access approval.
- The application supports reviewed Post, Carousel, Reel and eligible Story workflows. Generation and marking ready do not publish. A controlled JPEG Post publication is now verified on the authorized dummy account; other formats retain their separate acceptance gates. Formal App Review approval remains pending.

### Direct Meta dashboard checkpoint — 28 October

- Opened the existing MarkOS AI app under the `raedat.bh` business portfolio using the owner's saved Facebook sign-in. The app is **Unpublished**; no public-access approval was inferred from the working demo account.
- Saved the current privacy policy, Terms of Service and account-deletion instructions URLs. A fresh page load matched all three values, and Meta's Publish page now says **All required app settings are complete**.
- The permissions table initially had only `instagram_business_basic` ready for testing. Added `instagram_business_content_publish` and `instagram_business_manage_insights`; all three now show **Ready for testing**. No comments, messaging, ads or Facebook-Page permissions were added. Testing readiness is not Advanced Access.
- After owner approval, completed Meta's Tech Provider designation. The Verification and App Review sections are now available, and a review draft contains the three Instagram permissions plus Meta's default `public_profile` entry. No review request has been submitted or approved, and the app remains Unpublished.
- Uploaded the existing 1024-pixel MARKOS app icon and selected **Business and pages** in the review settings. Permission explanations were being entered; verify the saved text before repeating any fields. The last open permission dialog was Insights. Screencast uploads, remaining data-handling questions and reviewer instructions are incomplete. Meta explicitly instructs reviewers to connect their own professional account and says not to supply Instagram credentials; use only the isolated MARKOS review login in its protected forms.
- Meta shows the `raedat.bh` business portfolio as **Unverified**. Completed the separate account-email confirmation and opened the business-verification wizard. Selected Bahrain and **Institution**, matching the owner's supplied CR certificate's **Non Profit Company** registration type. Stopped at **Add business details** before entering the registered company name; company verification has not been submitted. The certificate was supplied in chat, but an original local file may still be needed if Meta requires document upload. Do not fabricate or reconstruct a certificate.
- The owner confirmed the existing Raedat Instagram account is connected, has published, and displays live Insights in mobile screenshots. Preserve that connection. Meta still requires real recording evidence of the permission workflows; screenshots alone were not treated as satisfying the video requirement.
- **Paused at the owner's request.** Saved the Facebook browser profile and closed the remote browser. Resume business verification with the supplied CR details, verify saved permission explanations, complete the remaining review questions and capture the required real screencasts before submission. No new Instagram post or account reconnection was performed during this preparation.

### Direct Meta dashboard checkpoint — 29 October

- Resumed the saved Facebook session and entered the CR's registered company name and address, Bahrain and the owner-supplied website/contact details. The owner completed Meta's CAPTCHA. Selected the public-registry record whose legal name and complete address match the certificate. After inspecting the identity-document alternative, the owner chose the registered phone route. Later on 29 October, the colleague became available: requested the authorized SMS, entered the supplied code without saving it to a file, and Meta accepted the company-verification submission. A fresh Security Center load shows **In review**, with Meta estimating about **2 business days**. No identity document was uploaded. This is Business Verification submission, not company approval, Tech Provider access verification or Instagram permission-review submission.
- Added the Railway website as the app's **Website** platform and verified the saved URL after reloading. Saved and securely read back the website testing instructions and App Review reviewer fields, including the isolated MARKOS review login, connection/publishing/Insights walkthrough, free access and geographic-access details. The submission summary no longer marks reviewer instructions **Needs your review**. Facebook Login is declared **No**: account sign-in uses MARKOS credentials and the Instagram integration uses Instagram Login.
- Read back the three saved Instagram permission descriptions. Publishing and Insights allowed-usage agreements are saved; Meta's automatically included `public_profile` confirmation is also saved. No extra Instagram permissions were requested.
- Saved the legal controller, Bahrain, owner-confirmed authority-request answers and the processor entries **Railway Corporation**, **Brevo SAS** and **OpenAI, OpCo, LLC**. Processing locations were prepared from [Railway's DPA](https://railway.com/legal/dpa), [Brevo's DPA](https://www.brevo.com/legal/termsofuse/#appendix-3-data-processing-agreement-dpa), [Brevo's storage disclosure](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location) and [OpenAI's current API subprocessor list](https://openai.com/policies/sub-processor-list/). The OpenAI entry includes its published global API processing footprint, rather than claiming US-only processing or regional residency. Form values were read back; this does not establish a new company policy or provider approval.
- Meta shows the Insights API testing requirement as **Completed**, while publishing shows **0 of 1 API call(s) required**. Preserve the owner's existing successful publishing evidence; the current provider test counter is a separate submission requirement. The required genuine permission screencasts remain unuploaded.
- Continued through Meta's Testing page: its test entries are valid for 30 days and successful calls can take up to 24 hours to appear. On 29 October, a workspace-scoped, read-only call to `GET /{IG_USER_ID}/content_publishing_limit` succeeded for the existing authorized Raedat account through MARKOS's normal publishing provider. [Meta lists the publishing permission as required for that endpoint](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit). This establishes current endpoint access; credit in Meta's App Review counter remains unconfirmed. No public post was created. Genuine workflow recordings still require the owner's MARKOS session for the already-connected workspace; that sign-in was opened in the browser for the owner to complete privately.
- The app remains **Unpublished** and the review is an unsubmitted draft. Completing the forms does not grant Advanced Access. No new Instagram post, reconnection, public rollout or paid plan change was performed during this continuation.
- The owner subsequently signed into the connected workspace. Captured a genuine 96-second Insights screencast showing the connected Instagram identity, navigation to Insights, the 30-day selector, account metrics, content performance and top posts. Uploaded and saved it in the `instagram_business_manage_insights` permission form; that card now shows **Edit**. The recording keeps the actual partial-sync warning visible. This completes the recorded Insights usage evidence, not a claim that every provider request succeeded or that Meta approved access.
- The deployed navigation is **Settings > Channels**, rather than the earlier Connections label. Instagram connection management requires enabled MFA and a fresh 15-minute verification window. Reviewer instructions must explain and support that security requirement; an ordinary password-only reviewer login does not establish connection-management readiness.
- Provisioned a separate, preverified Meta review account with its own fictional workspace and approved fictional business profile. Enabled MFA through the normal authentication endpoints and confirmed a fresh MFA login plus Instagram authorization start with exactly the three requested scopes. This did not connect Instagram, change the owner's workspace or alter the Google Play review login. Its credentials and authenticator setup key are stored with Windows DPAPI outside Git. Saved the replacement **Website** testing instructions and verified the login, protected authenticator key, Security/Channels walkthrough and Facebook Login **No** after a fresh reload on 29 October. The basic-permission explanation and the review draft's inherited reviewer fields still need alignment/readback; the latest basic-notes update did not complete.
- Requested the owner's fresh security verification for the connection screencast. Prepared a local JPEG/logo and exact caption for a proposed publishing check, and requested approval before making any public post. The proposed post has not been created in MARKOS, scheduled or published. Account-connection and publishing recordings remain pending.
- The owner completed the security check and explicitly declined any test publication on the official company account. **Do not publish or schedule review content on that account.** Recorded the real Reconnect action up to Instagram's private login; authentication is excluded and the connection walkthrough still needs its continuation. The existing connection was not disconnected.
- Ran one workspace/account-checked `POST /{IG_USER_ID}/media` using an existing public image and no caption. Meta accepted an **unpublished container**; the publishing endpoint was not called, no application publishing job was created, and published quota usage remained 0 before and after. [Meta documents container creation separately from publication](https://developers.facebook.com/documentation/instagram-platform/content-publishing). This is permission-specific preparation evidence, not a public publication or proof that Meta credited the review test counter. Do not replay a container-creation attempt after a timeout without inspecting its private attempt receipt.
- The owner supplied a separate dummy account and confirmed **@the.snacklab** is authorized for content creation, publication and scheduling. Its Instagram tester role already exists on the correct Meta app; no role changes were needed. Abandoned the unfinished official-account reauthorization and verified Raedat stayed connected before opening a separate dummy browser profile. The supplied MARKOS test user was absent from Railway: created its isolated fictional bakery workspace, approved its fictional business profile, enabled MFA through normal authentication endpoints and verified both API and browser sign-in. Uploaded the existing MARKOS artwork and prepared two **DRAFT** posts there. Nothing has been published or scheduled by this test workflow.
- **Paused at the owner's request.** The dummy Instagram account was authenticated once, but that browser host became unreachable before its session could be saved. A fresh sign-in using the owner-confirmed handle is waiting for Instagram's email code. Saved that pending browser state and the owner's Facebook profile, and closed both current sessions. On resume, finish the dummy account's email check and save the authenticated profile immediately; do not assume the pending code or old viewer link remains valid. Then connect it only to its test workspace, capture the genuine connection/publishing/scheduling flows, finish the remaining review fields and verify Meta's API counter/business gates before submission. The app review is still an unsubmitted draft.

### Direct Meta dashboard checkpoint — 1 November

- Meta's Business Security Center now shows the registered company as **Verified**. Its historical label says **Originally verified on Oct 28, 2026**; that provider label is separate from the verification continuation recorded on 29 October and must not be represented as approval occurring today.
- The owner completed the dummy account's Instagram security check. Saved that authenticated profile immediately, restored it successfully, and connected **@the.snacklab** as a **BUSINESS** account only in the isolated fictional bakery workspace. The real Instagram consent requested exactly the three configured Instagram scopes. The official Raedat account was not published to or scheduled against.
- Captured the actual account-connection wizard, Instagram consent, return to MARKOS and connected identity. Uploaded and saved the genuine basic-permission recording; its allowed-usage card changed to **Edit**. Authentication screens and credentials are excluded from the recording.
- Aligned the basic-permission notes with **Settings > Security** and **Settings > Channels**. Fresh readback confirmed that the review draft inherited the dedicated Meta MARKOS credentials, protected authenticator setup key, security walkthrough and Facebook Login **No**. The separate Google Play review account was unchanged; no Instagram credentials were supplied to Meta.
- Through the deployed Create UI, reviewed the dummy artwork and bilingual caption, marked the first item ready and explicitly confirmed **Publish now**. MARKOS recorded a real Instagram publication at **09:07:21 Bahrain time** with the provider post identity present. A separate dummy item was accepted as **SCHEDULED** for **09:30 on 1 November**; at submission time that future publication had not yet been observed. An initial past-time rejection came from using the remote browser timezone in the recording helper; the corrected selection used MARKOS's Bahrain time. No product behavior was changed.
- Uploaded and saved the genuine publishing/scheduling recording. Readback confirmed its saved screencast, permission description, allowed-usage agreement and Meta API test status **Completed**. The actual 29 October Insights recording remained saved, including its partial-sync warning. The three recordings contain genuine app/browser frames, with no synthetic workflow or fabricated result.
- All submission gates became complete. Accepted Meta's submission acknowledgement and submitted the existing request on **1 November at 09:14 Bahrain time**. A fresh reload confirmed **Review in progress** for `instagram_business_basic`, `instagram_business_content_publish` and `instagram_business_manage_insights`, plus Meta's existing default `public_profile` entry. Meta says most submissions are reviewed within 20 days, with additional time possible. The app remains **Unpublished**; external-account approval and public rollout are still pending.
- During the later store-preparation pass, a workspace-scoped read confirmed that the scheduled dummy item also reached **PUBLISHED**, at **09:30:22 Bahrain time**, with a provider post identity and no failure reason. Both authorized dummy publishing paths now have actual delivery results; this does not establish every media format or Meta approval.
- Private recordings, protected credentials and submission receipts remain outside Git. Next: inspect Meta's decision or follow-up requests, verify the scheduled dummy publication, and complete any remaining provider access/live-mode gates before claiming arbitrary customer accounts can connect.

### Reviewer walkthrough supplied in the Meta dashboard

1. Use an isolated reviewer workspace and eligible professional Instagram account. Supply credentials through Meta's protected reviewer fields, never this repository, logs or a screen recording.
2. Demonstrate login, account connection and the visible connected identity. Explain `instagram_business_basic` through the account/profile information MARKOS displays.
3. Demonstrate creating content, reviewing its caption/media, explicitly approving it and choosing the publish/schedule action. Explain `instagram_business_content_publish` through that owner-controlled action. Use specifically reviewed test content and record the real Instagram result.
4. Open Insights, synchronize and show the same account/date range in Instagram. Explain `instagram_business_manage_insights` through the displayed account and media metrics; distinguish unavailable values from zero.
5. Demonstrate disconnect and the account-deletion entry point. Show privacy/support links and the real operator. Record callback and deletion evidence separately from ordinary disconnect.
6. Verify dashboard app mode, business verification, permission-review status, callback/website domains and reviewer access before submitting. A prepared packet, local fixture or successful developer-role connection is not App Review approval.

Use the actual public `/en/privacy`, `/ar/privacy`, `/en/support`, `/ar/support`, `/en/delete-account` and `/ar/delete-account` pages on the Railway website. Finalize the address and privacy disclosures before public store submission. The Meta request and required recordings are submitted; approval and public availability remain pending as recorded above.

### Prepared permission explanations

Use the exact requestable permission identifiers shown in the existing app's dashboard. The following text describes MARKOS's current use; it does not claim a grant or approval. Do not request comments, messaging or Human Agent for this release.

**Account access — configured as `instagram_business_basic`**

MARKOS helps businesses and creators plan and manage their own Instagram marketing. A workspace member selects Settings → Channels → Connect Instagram and authorizes an eligible professional account through Instagram. MARKOS displays the connected account identity and its available recent media so the member can confirm which account the workspace uses. Access is scoped to the authorized account and workspace. Members can disconnect from Settings and manage the app's permissions through Instagram.

**Publishing — configured as `instagram_business_content_publish`**

MARKOS lets authorized workspace members prepare supported posts, carousels and Reels for their connected Instagram professional account. Members edit the caption and media, review the preview, and mark content ready. They then explicitly schedule approved content through Calendar. Marking content ready alone does not publish. At the scheduled time MARKOS submits the media to Instagram, waits for the provider's container to become ready, publishes it and records the real result. This permission is used only to publish the content selected by the member to the account they authorized.

**Insights — configured as `instagram_business_manage_insights`**

MARKOS shows available account and media metrics for the professional Instagram account connected to the workspace. Members open Insights to review the selected account and period, understand their content's performance and inform future campaign decisions. MARKOS retains the provider's actual available metrics and distinguishes missing or unsupported data from zero. The metrics are not used to access other users' private accounts or build advertising profiles.

Before submission, match each explanation to its actual dashboard question, successful permission-specific provider evidence and required recording. Preserve the existing working login family if Meta's public documentation and dashboard use different labels; do not rename live scopes based on a documentation typo.

## Historical August status

The production-verified connection used Instagram Login with `instagram_business_basic`. The Milestone A working implementation now requests the canonical ordered set `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_insights`, but it has not been deployed, reconnected, or live-verified. Each added permission retains its own dashboard, provider-call, persistence, App Review, and external-evidence gate. Comments and messaging are not confirmed first-release requirements.

## Evidence classification

- **Existing implemented and locally/CI verified foundation:** OAuth start/callback, signed state, expiry, transaction binding, single-use consumption, provider exchanges, professional-account resolution, encrypted persistence, bounded recent media, secure status, refresh, guaranteed local disconnect, guided manual provider removal, signed callback parsing/handling, redirects, and sanitized telemetry.
- **Milestone A working implementation:** canonical three-scope parsing/request/persistence, fixed `graph.instagram.com/v25.0` publishing and insights clients, one-JPEG operator publishing, local/S3 storage with provider-only just-in-time signing, separate account/media metrics, unavailable-versus-zero handling, and focused plus disposable-database tests. Railway bucket provisioning/references, deployment, reconnect, and provider acceptance remain open.
- **Production-verified on 2026-08-03:** one real professional account completed the deployed OAuth flow, appeared Connected in production Settings, and loaded recent provider-owned media.
- **Railway test verified on 2026-08-05:** local disconnect completed, the UI presented the Instagram Apps and websites action, and manual removal moved MarkOS AI-IG from Active to Removed. Meta delivered the deauthorization request as multipart form data; MARKOS verified the signed request, matched and removed the stored credential, persisted the audit, completed the callback with HTTP 200, and refreshed Settings to Disconnected.
- **Not yet externally verified:** formal App Review submission/approval, publishing, insights, a complete token-refresh lifetime, former-token invalidation, end-to-end data-deletion behavior, and webhook subscriptions.
- **Externally managed:** current Meta dashboard settings, app mode, roles, permissions, Graph version, URLs, and App Review status. Repository code and this handoff cannot prove their current dashboard values.

## Production connection milestone

The successful 2026-08-03 attempt reached the current implementation's complete business-basic path:

1. An authorized workspace member initiated OAuth.
2. MARKOS issued signed, expiring state bound to the user, workspace, return path, and persisted transaction nonce.
3. The public callback validated its input, verified the state, and atomically consumed the bound transaction.
4. The provider code was exchanged for short-lived and long-lived tokens.
5. MARKOS fetched the token-authenticated `/me` profile and persisted `/me.user_id` as the professional `providerAccountId` without comparing identifiers from different provider namespaces.
6. The access token was encrypted with AES-256-GCM using a canonical Base64 32-byte key.
7. The credential, up to six recent-media rows, and `INSTAGRAM_CONNECTED` audit row were written in one workspace-scoped transaction.
8. MARKOS performed the required secured read, transformed connection status, completed the success redirect, and the production Settings UI refreshed.

Meta's internal login, account-selection, and consent screens are not server-observable lifecycle stages. The successful return demonstrates the round-trip outcome but does not justify invented success events.

## Identity contract

For Instagram Login, the current client retains the authorization-code exchange `user_id` only as a required response field. The token-authenticated `/me.user_id` is the professional-account identity stored as `providerAccountId`; `/me.username` is stored as display identity. Do not compare the exchange value, `/me.id`, and `/me.user_id` unless current authoritative Meta documentation establishes that the exact compared fields represent the same entity.

Facebook Login for Business uses a different Page-to-Instagram discovery model and is not interchangeable with this flow. Downstream publishing, analytics, refresh, readiness, disconnect, deauthorization/data deletion, and erasure paths resolve the encrypted credential record and use the stored professional-account identity.

## Milestone A permission boundary

The working implementation requests exactly:

```text
instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
```

`INSTAGRAM_OAUTH_SCOPES` is now parsed through the same canonical allowlist used by OAuth, persistence, status, readiness, and tests. It rejects duplicates, unknown scopes, missing basic, and Facebook Login names. Changing configuration alone does not grant permission: deploy the reviewed code, verify the live dashboard identifiers, and complete a fresh authorized connection.

The accepted execution order is:

1. Keep the production-verified business-basic connection stable.
2. Complete the application and private-storage contract while both modes remain dry-run.
3. Verify the live dashboard identifiers and eligible app-team test account.
4. Deploy, reconnect, and run one controlled JPEG publish plus one account- and one media-insights call.
5. Preserve independent App Review evidence and approval gates for publishing and insights before external-client use.

The current API mapping and Milestone A execution checklist are in `instagram-permissions-phase-2-checklist.md`. Do not implement from the retired Facebook-Page flow or from old permission names.

Permission names and dashboard availability are provider-managed and must be checked in current Meta documentation and the real dashboard immediately before a review submission. Additional messaging or comment permissions require a separate approved product scope.

## Meta dashboard inventory to verify

The following is historical handoff context, not repository-proven current dashboard state. Confirm each item in Meta before using it in an App Review submission or operational decision.

| Item                      | Handoff record requiring dashboard verification                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App/portfolio             | Business app under the Ra'edat Business Portfolio, intended for multiple external client accounts.                                                                                                         |
| Login/product             | Instagram Login.                                                                                                                                                                                           |
| Selected use case         | `Manage messaging & content on Instagram`; this selection does not make messaging/comments MARKOS requirements.                                                                                            |
| Graph version at creation | v25.0. The Milestone A application contract now fixes versioned Instagram Login account, publishing, and insights calls to `graph.instagram.com/v25.0`; verify current dashboard/runtime state separately. |
| App mode at creation      | Development.                                                                                                                                                                                               |
| Initial permission        | `instagram_business_basic`.                                                                                                                                                                                |
| Remaining permissions     | `instagram_business_content_publish` and `instagram_business_manage_insights`; both are in the working OAuth request, but deployment, fresh authorization, live calls, and App Review remain unverified.   |
| Access model              | Least privilege. Khalid had scoped app/technical access rather than portfolio-wide administration.                                                                                                         |
| Custody                   | Yahya Alawadhi retained portfolio control; Maryam Buzaboon and Mohamed Al-Hawaj received longer-term app/business custody appropriate to their roles.                                                      |
| Cloud owner access        | Sarah does not require Meta access solely because she owns cloud work; grant only a concrete least-privilege need.                                                                                         |

Do not copy dashboard secrets, real provider-account identifiers, callback query data, user details, or access tokens into this inventory.

## Required Meta dashboard URLs

Use public HTTPS URLs in deployed environments. Replace only the host in the dashboard; do not record the real production host or query values in repository evidence.

| Meta setting                       | MARKOS endpoint                                         |
| ---------------------------------- | ------------------------------------------------------- |
| OAuth redirect URI                 | `${API_BASE_URL}/v1/workspace/instagram/oauth/callback` |
| Instagram webhook callback         | `${API_BASE_URL}/v1/meta/webhooks/instagram`            |
| Deauthorize callback URL           | `${API_BASE_URL}/v1/meta/deauthorize`                   |
| Data deletion request callback URL | `${API_BASE_URL}/v1/meta/data-deletion`                 |

Local fake-only names:

```env
INSTAGRAM_OAUTH_REDIRECT_URI=http://localhost:4000/v1/workspace/instagram/oauth/callback
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS=14
META_WEBHOOK_VERIFY_TOKEN=<local-fake-value>
```

## Business-basic evidence script

1. Sign in to MARKOS and open Settings.
2. Click **Connect Instagram**.
3. Complete Instagram Login for a professional test account.
4. Return to Settings and show the Connected state.
5. Show the stored basic profile and bounded recent-owned-media result, including the valid empty state.
6. Show that callback query material is removed from the browser URL.
7. Demonstrate refresh only when the provider makes the token eligible.
8. Disconnect and show that MARKOS removes the active encrypted credential and presents the manual Instagram-permissions action without treating the required provider step as a local failure.

Do not record a real authorization code, token, state, callback URL with a query string, provider identifier, email, username, header, cookie, or raw provider response in the screencast or evidence pack.

The publishing and insights submissions need separate evidence scripts after phase-two research confirms Meta's current review requirements. Reuse only the connection/security portion above; add permission-specific user action, provider result, data-use explanation, failure/recovery, and deletion/privacy evidence rather than claiming the basic connection demonstrates either permission.

## Operational gates

- Production API is served over HTTPS.
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `INSTAGRAM_TOKEN_ENCRYPTION_KEY`, `INSTAGRAM_OAUTH_STATE_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN` are supplied through the external secret manager.
- The redirect URI exactly matches the deployed callback.
- `INSTAGRAM_TOKEN_ENCRYPTION_KEY` is canonical Base64 that decodes to exactly 32 bytes. Presence alone is not validity.
- Webhook verification succeeds against `/v1/meta/webhooks/instagram`.
- Long-lived token refresh is verified from Settings and the worker over a real eligible lifecycle before it is described as production-complete.
- A controlled disconnect removes the local credential and presents the required Instagram Apps and websites action; selecting **Remove** invalidates the former token and delivers a valid signed callback that receives HTTP 200.
- Deauthorization and data-deletion callbacks accept only a valid Meta `signed_request` and are verified with controlled provider delivery.
- Webhook POSTs require a valid `X-Hub-Signature-256`; invalid or unsigned payloads are rejected before audit processing.
- Callback audit persistence redacts signed requests and secrets.
- `INSTAGRAM_PUBLISH_MODE` and `INSTAGRAM_ANALYTICS_SYNC_MODE` remain `dry_run` until their separate gates close.
- `INSTAGRAM_GRAPH_VERSION` is fixed to `v25.0` for this milestone. Version presence is not proof of dashboard configuration, permission grant, or successful provider behavior.

## Webhook and provider limitations

- Dashboard callback verification does not subscribe a professional account to webhook fields. Per-account subscription and field selection require a separate provider operation and applicable permissions.
- `instagram_business_basic` does not by itself authorize publishing or insights, and this milestone requests no comments or messaging permissions.
- The repository implements refresh, deauthorization, data deletion, and webhook validation, but real provider timing and delivery remain externally unverified.
- The production connection does not prove App Review state. Attach submission/approval evidence before changing the milestone ledger.

See `project-status.md`, `staging-deploy.md`, `instagram-live-publish-verification.md`, and `instagram-analytics-live-verification.md` for the remaining boundaries.

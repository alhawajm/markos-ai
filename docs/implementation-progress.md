# MARKOS implementation progress - 26 October 2026

## Current 0.5 preparation

Web and native now support 30/60/90-day campaign briefs through the durable queue.
Long plans commit seven-day windows, source summaries, frozen business context and
actual usage before proceeding. Progress reads contain metadata only. Interrupted
calls require an explicit creator retry; committed weeks are preserved and stale
workers cannot overwrite a later lease. All days, including the final partial week,
must validate before one campaign is saved. Draft approval and scheduling remain separate.

The Railway API has both checkpoint/progress migrations applied (32 total), the AI
segment route is reachable behind the internal boundary, and anonymous resume requests
return 401. English desktop and Arabic 390px planning/recovery fixtures passed, including
no horizontal overflow. Native uses a focused duration selector and saved brief recovery.

Focused checks: campaign generation/RLS/baseline 18 passed; campaign-route 14 passed;
AI campaign/provider/health 23 passed; mobile brief/transport 14 passed; web reference/auth
10 passed; three rendered campaign checks passed (11 unrelated cases skipped). API,
web and mobile typechecks, selected Python mypy/Ruff and both native exports passed.
These checks do not establish a completed live-provider 90-day campaign or device receipt.

Firebase CLI authorization and both provider terms were completed by the owner. Created
dedicated project `markos-mobile-35017b4c`, registered `com.markos.mobile`, and linked
an FCM-only service account to MARKOS's Expo credentials. Client configuration is an EAS
secret file in preview and production; no server private key was written locally.
Runtime 0.5.0 needs new native binaries. Google Play submission credentials, actual
phone notification receipt, final store/Meta review and the remaining product depth
remain open. The existing Apple push key/certificates and other apps were preserved.

Daily encrypted database/media recovery and the core service checks are healthy.
Brevo email remains parked pending company DNS/sender verification. The operational
foundation, earlier full-suite results and remaining gates are tracked in
[release readiness](release-readiness.md).

## Current 0.4 release

Implemented native offering pricing/availability with exact integer minor units; per-user/workspace publishing push and monthly PDF email preferences; one-time report requests/history; complete account deletion across owned workspaces with password/email-code/MFA confirmation and durable cleanup; and platform-admin failure recovery/model settings on native and web. Added public English/Arabic deletion pages. Existing users remain unsubscribed by default.

Railway API `4de5ebeb-feb4-4258-b894-f0cab813eb1f`, web `6fc97a97-dad5-4a5b-ae40-2f9209fda48d`, and worker `4049365f-528e-4860-807a-6077c9dd66b5` deployed successfully. All 28 migrations are applied. Readiness passed database, Redis and authenticated AI checks. New API routes returned 401 without authentication; both hosted deletion pages returned 200. Live tables contained zero subscriptions/devices/report/deletion jobs, confirming no customer was silently enrolled or deleted. SendGrid is configured; inbox delivery is not claimed by these checks.

Android 0.4.0/code 5 build `d919c0f9-851e-44a6-b032-6ba3fbfe625a` and iPhone 0.4.0/build 6 `8ae6e14d-8ee8-4f2d-9b37-ec37b05518f8` finished. Downloaded artifacts passed ZIP checks; the IPA confirms MARKOS's team/bundle and production push entitlement. Its first build failed because the old profile lacked that entitlement; a new MARKOS-only profile fixed it. The shared distribution certificate and other apps were unchanged. Submission `d2bc4a39-35b4-4aef-9aeb-5a1d48ebb7ca` finished; Apple reports VALID/IN_BETA_TESTING with owner-only access. Store AAB `591a919a-b0b4-4fd3-85d8-2cd203a4a0e4` finished (code 6). See the mobile README for artifacts and verified preview/production update groups. Expo Notifications requires new binaries; 0.3.0 cannot receive it through OTA.

Focused checks passed: seven delivery/deletion tests; one admin RBAC/retry test; 15 team/notification/storage regressions; four monthly report/worker tests; three auth-mail tests; ten password-recovery tests; and 21 native pricing/session tests. API/mobile/web TypeScript and native exports passed. English desktop and Arabic 390-pixel settings were exercised against a disposable local API fixture: preference persistence, one-time report queuing, no horizontal overflow, session restoration on the public deletion page, confirmed deletion and sign-out. A guard initially rejected the wrong disposable DB name for password recovery; the required `markos_account_recovery_test` rerun passed. This is focused coverage, not full-suite or physical-device acceptance.

A real encrypted production backup restored successfully into an isolated local database, including pgvector, UUID v7 and workspace-linked content/media metadata; the restored database was removed afterward. All 18 active saved media objects were also encrypted and restored locally, with matching hashes; that plaintext restore directory was removed. GitHub readiness checks now run twice per hour. See `operations-readiness.md` for recovery limits and the corrected Railway auto-deploy side effect. Automated off-site backups are not claimed.

Follow-up test integration: suites now accept their named local database or the explicit loopback `markos_ci_test` target, while refusing ordinary/hosted databases. All 29 tests across the six affected account, MFA, recovery, campaign and publishing files passed together on a fresh `markos_ci_test` database; API TypeScript passed. This validates those CI-compatible suites, not the entire repository pipeline.

Remaining external inputs: Firebase/FCM and Play Console access; physical-device/push acceptance; a selected connected Instagram account/content for real publishing/analytics acceptance; confirmed legal operator/support/address and final privacy declarations/screenshots; backup permissions/off-site media retention; external error alert routing; and AWS credentials if migration is wanted. English/Arabic listing copy is in `store-listing.md`. No paid video provider was enabled; free CPU Motion Reels remain available.

## Earlier release history

Owner instruction: implement the remaining mobile and MARKOS work within available access, including an open-source video replacement. Continue directly; raise missing external access without blocking independent work.

## Delivered

- Preserved the handover/mobile implementation in Git and pushed codex/production-mobile (065d878).
- Optional Wan 2.2 queue adapter (408b777); NOT activated after the owner rejected paid video hosting. No fal account, credential or payment was created.
- Real production embeddings, versioned retrieval spaces and eight provider-backed agent contracts (9068f00). Re-indexed 67 facts across five active workspaces. Live provider smoke confirmed real embedding/agent requests and token accounting.
- Free CPU Motion Reels on web and native: owned JPEG artwork, slow zoom/fades, optional exact Arabic/English cards, 4/8/12 seconds, portrait H.264. This is explicitly labeled motion graphics, not generated footage. No AI planning or video API call occurs in this mode. The hosted renderer produced a valid four-second 720x1280, 24 fps MP4; its bilingual frame was inspected.
- Railway release succeeded: API 584d33a7-bd9f-46c1-b64b-06a1bae13fe4, AI 47b26059-73ad-4c0b-b43e-a34aa26b4527, worker bbf4e569-14ee-49a2-8c8b-5b5b4e02b456, web 7828257a-c4db-4d1f-8cbb-9a004fd99a20.
- Motion native preview update group be13c85d-c6cd-4b94-8b2d-09c9be56ab58 served successfully to both runtime 0.2.0 platforms.

## Account/team and reporting release

Implemented native account/name/language and owner workspace-name editing; secure workspace switching; email-bound, expiring, one-use team invitations; role management and revocation; private JSON export sharing and explicit workspace erasure; saved knowledge/history and activity readers; real analytics advice and monthly PDF sharing. Native catalog editing already existed and remains available in Business profile. Web Settings now supports account editing, team management and workspace switching.

Invitation codes are stored hashed and shown once for the owner to share. No automatic email is sent. Existing members cannot gain a stronger role by accepting an old invitation. Administrator changes require the owner, and removed members lose API access immediately. Invitation data is included without hashes in workspace exports and removed by scoped workspace erasure.

Added Expo Sharing, so the new mobile release uses runtime 0.3.0 and requires new binaries. The earlier 0.2.0 Motion update remains compatible with installed apps. Added native icon, Android adaptive foreground and splash assets using the existing MARKOS wand and Sunlit colors. Only MARKOS's com.markos.mobile project is in scope.

Focused evidence: 23 API workspace/team/native-auth tests, 21 native session/export tests, three rendered web tests (English desktop, Arabic 390 px, account saving); mobile/API/web TypeScript; Android/iOS bundle export. Tests used only disposable markos_production_features_test. These are focused checks, not a full suite or physical-device acceptance. Account/team migration 25 and the hosted rollout succeeded.

## Release verification

- Android 0.3.0/code 3 signed ARM64 APK: build da2f543b-7492-4f8c-bd04-46376ff518be finished. Artifact downloaded and ZIP integrity verified.
- iPhone 0.3.0/build 4: build 2c1fa2a6-5c45-4a54-b527-49d0af02ada0 and submission 3dcfe732-2b38-43cc-a680-068685b6d6f0 finished. IPA integrity, bundle com.markos.mobile and iPhoneOS platform verified. Apple build f2488235-d7f2-4079-92f8-7801af3da523 is VALID and ready for internal testing after its platform-encryption declaration. The MARKOS test group still has exactly one tester, the owner, and no public link. No other Apple application or signing credential changed.
- Android production AAB 793e803b-7445-4b49-a3b9-36f35e1b4ab3 finished, version 0.3.0/code 4; artifact downloaded. Google Play Console access remains unconfirmed. A store bundle is not store publication.
- Dependency readiness is live: PostgreSQL, Redis and the authenticated AI boundary passed. The probe does not infer provider credits or permissions. OpenSearch is optional because no current feature depends on it. Eight API health tests, three AI readiness tests, Python type/lint checks and relevant TypeScript passed.
- Independent maintenance failures no longer stop later tasks, including Reel jobs. Twelve focused maintenance/diagnostic tests passed. Worker deployment 8ad9cb2e-c775-43a7-805d-ae8e457b051d succeeded.
- Latest verified web a6be0d5b-fdbf-47c8-abe0-30d505d93454, API 42bacaf9-4df6-435a-83bb-7cf1af4c78c9, worker 661d3843-e6f7-4887-b43f-55056dab8f57 and AI 8aea1f4b-44ba-4e3e-a236-be6e71e6635e deployments succeeded. After the final email correction, the live readiness probe again passed database, Redis and the authenticated AI boundary.
- Monthly analytics email is still a dry-run adapter. Its receipt and worker totals now correctly report no delivery, and its audit action says SIMULATED. PDF download/sharing works; no real monthly report emails were sent. Two focused route/worker checks passed (32 unrelated tests skipped).

## Native Create and campaign completion

Fixed Stories being labeled Post and incorrectly forced into video generation. Added Story image/video choice, format conversion, full caption/media preview, guided preparation/media/approval actions, carousel missing-image generation, Reel hook/scene editing, planning metadata, library detachment and draft deletion. Assistant updates now follow revision ordering, and snapshots arriving during a save are reconsidered afterward. Approval waits for active Assistant/video work. Motion artwork/text persists per device/content/slot.

Campaign review adds actual dates, status counts, date/format/search filters, full strategy/reference details and native PDF sharing. Existing five-reference campaign creation and durable generation remain connected to the same Railway API. No automatic publish or paid video provider was introduced.

Focused checks: 52 tests in nine mobile files passed, including eight rendered screen workflows, recovery, campaign identity, media readiness, partial script saves, publishing helpers and file sharing. Mobile TypeScript and Android/iOS bundle exports passed. These use mocked API/native controls and are not a physical-device or live Instagram acceptance claim. Runtime stays 0.3.0; no new native module is required.

Released source `ab0a795` to preview/TestFlight update group `c11fc46b-4bbc-4d97-aef5-ac9a4d924931` and production group `d828ee4c-5020-4d8b-b0a7-1631219f2619`. Android/iOS manifest IDs match on both channels; all four bundle downloads returned HTTP 200 with matching SHA-256 hashes using Expo's issued asset request headers. Existing 0.3.0 installations apply it on a subsequent cold launch; 0.2.0 requires the current APK/TestFlight binary. Railway services and other Apple apps were unchanged.

Owner confirmed on Android 0.3.0 that removing MARKOS from Recents and reopening applied the Create update and the flow works. A follow-up adds foreground update download, an Account update-status/check/restart control, and precise draft-validation/HTTP/timeout messages. Twenty-two focused update, transport, error and rendered Create tests plus mobile TypeScript passed. This is owner confirmation of this screen/flow, not a full physical-device acceptance pass.

Follow-up source `710d757` is published as preview/TestFlight group `edbd1c73-5f5d-454d-b863-df59355d06a1` and production group `0e1f544c-8e92-4a84-8d5d-08e8bcab6048`, runtime 0.3.0. Both native bundles exported successfully and preview downloads match their manifest SHA-256 hashes. App updates download on foreground without automatically restarting open work; Account exposes an explicit restart action.

## Remaining

- Self-hosted Wan generated footage: this laptop has 16 GB system RAM and Intel integrated graphics. It cannot run the selected model at a useful production level. Wan code/weights are Apache-2.0; cloud GPUs, including AWS, are infrastructure costs. No paid video service is enabled. Suitable owned GPU hardware remains necessary for a no-video-API-fee deployment.
- Verify native account/team/share controls on physical Android and iPhone devices after installing 0.3.0. Capture actual native store screenshots and complete store listing/privacy declarations, final legal wording and review submission. Store approval cannot be claimed from successful builds.
- Complete live Instagram consent/publishing/analytics acceptance with the owner's connected account and Meta permissions. Existing configuration is not proof of review approval or live delivery.
- Notification preferences/push delivery, remaining administration surfaces, true account deletion across multiple workspaces, and opt-in monthly report email delivery remain implementation work. Current data controls erase one owned workspace and anonymize an owner with no remaining memberships; they are not a general account-deletion flow.
- Backups: pgvector has no snapshots or schedule. Enabling Daily/Weekly with the current Railway credential returned Not Authorized; the project owner must enable them. Restore rehearsal, object-storage retention and external alert delivery remain pending. See operations-readiness.md.
- AWS infrastructure remains a placeholder; no AWS migration or GPU has been provisioned. Railway currently serves web, Android and iPhone.
- Commercial billing remains deferred by explicit product decision. No simulated payments or quota gates were activated. Live merchant credentials/certification are external requirements.

Website: https://web-production-94e63.up.railway.app

## 2026-10-27 - Native release and profile version recovery

Android APK and iPhone IPA 0.5.0/build 7 finished. The iPhone TestFlight submission finished and Apple confirms VALID / IN_BETA_TESTING in the existing owner-only group. Android store AAB build 8 was queued separately; phone notification receipt is deferred by the owner. Today's scheduled recovery snapshot restored all 32 migrations, five workspaces and 22 referenced media objects into a disposable local database, which was removed afterward. Read-only Meta calls proved reach, views and profile_views access; live worker snapshots are present.

Web and native business editors now expose bounded, module-specific version history. Selecting a revision only populates the form. Ordinary Save applies the selected fields through canonical validation, revision conflict checks and Vault projections; other modules/catalog remain current. The API error handler is registered before route setup so conflict responses use the expected envelope. English/Arabic desktop/narrow browser checks and focused API/native checks passed. This source checkpoint still requires final CI, deployment and compatible 0.5 OTA delivery.

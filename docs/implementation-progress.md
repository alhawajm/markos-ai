# MARKOS implementation progress - 24 September 2026

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

## Remaining

- Self-hosted Wan generated footage: this laptop has 16 GB system RAM and Intel integrated graphics. It cannot run the selected model at a useful production level. Wan code/weights are Apache-2.0; cloud GPUs, including AWS, are infrastructure costs. No paid video service is enabled. Suitable owned GPU hardware remains necessary for a no-video-API-fee deployment.
- Verify native account/team/share controls on physical Android and iPhone devices after installing 0.3.0. Capture actual native store screenshots and complete store listing/privacy declarations, final legal wording and review submission. Store approval cannot be claimed from successful builds.
- Complete live Instagram consent/publishing/analytics acceptance with the owner's connected account and Meta permissions. Existing configuration is not proof of review approval or live delivery.
- Notification preferences/push delivery, remaining administration surfaces, true account deletion across multiple workspaces, and opt-in monthly report email delivery remain implementation work. Current data controls erase one owned workspace and anonymize an owner with no remaining memberships; they are not a general account-deletion flow.
- Backups: pgvector has no snapshots or schedule. Enabling Daily/Weekly with the current Railway credential returned Not Authorized; the project owner must enable them. Restore rehearsal, object-storage retention and external alert delivery remain pending. See operations-readiness.md.
- AWS infrastructure remains a placeholder; no AWS migration or GPU has been provisioned. Railway currently serves web, Android and iPhone.
- Commercial billing remains deferred by explicit product decision. No simulated payments or quota gates were activated. Live merchant credentials/certification are external requirements.

Website: https://web-production-94e63.up.railway.app

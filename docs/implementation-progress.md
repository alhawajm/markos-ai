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

Focused evidence: 23 API workspace/team/native-auth tests, 21 native session/export tests, three rendered web tests (English desktop, Arabic 390 px, account saving); mobile/API/web TypeScript; Android/iOS bundle export. Tests used only disposable markos_production_features_test. These are focused checks, not a full suite or physical-device acceptance. Account/team migration and hosted rollout are next; mobile builds pending.

## Remaining

- Self-hosted Wan generated footage: this laptop has 16 GB system RAM and Intel integrated graphics. It cannot run the selected model at a useful production level. Wan code/weights are Apache-2.0; cloud GPUs, including AWS, are infrastructure costs. No paid video service is enabled. Suitable owned GPU hardware remains necessary for a no-video-API-fee deployment.
- Verify native account/team/share controls on physical Android and iPhone devices after installing 0.3.0. Capture actual native store screenshots and complete store listing/privacy declarations, final legal wording and review submission. Store approval cannot be claimed from successful builds.
- Complete live Instagram consent/publishing/analytics acceptance with the owner's connected account and Meta permissions. Existing configuration is not proof of review approval or live delivery.
- Notification preferences/push delivery, remaining administration surfaces, backup/restore and monitoring verification remain follow-up production work.
- Commercial billing remains deferred by explicit product decision. No simulated payments or quota gates were activated. Live merchant credentials/certification are external requirements.

Website: https://web-production-94e63.up.railway.app

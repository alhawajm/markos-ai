# MARKOS mobile

One Expo / React Native app for Android and iOS, connected to the existing Railway API. The existing Next.js site remains the web app. Expo project: [@mo4180/markos](https://expo.dev/accounts/mo4180/projects/markos).

Latest preview update: [calendar, publishing activity, notification inbox and Insights, `e7e2334a-e0ed-4719-ab42-d4fdaaa12633`](https://expo.dev/accounts/mo4180/projects/markos/updates/e7e2334a-e0ed-4719-ab42-d4fdaaa12633), Android/iOS runtime **0.2.0**. Both bundles exported and both platform manifests returned the expected update IDs. Open the installed app online to download the update, then close and reopen it. Open Calendar → Publishing activity, the notification bell, or Insights. No replacement binary or Apple signing change was needed. Physical-device interaction and a real authorized Instagram publishing walkthrough still need acceptance testing.

## Working slice

- Email/password and authenticator sign-in; rotating refresh credential in SecureStore, access credential in memory. Existing email verification, onboarding and workspace roles remain authoritative.
- Native signup with consent and queued verification; password recovery with an emailed eight-digit code, new-password confirmation and normal login after success. Recovery revokes previous sessions without disabling MFA. Passwords and recovery codes stay in memory.
- Native verification resend/check, seven-step business setup, up to five business documents/images, extracted-fact review, and separate English/Arabic profile approval. A completed setup offers Instagram connection or entering the workspace.
- Native Business Profile in workspace settings: strategy, products, audience/market, brand/voice and business details. Focused edits and basic product/service maintenance use the existing revision checks; advanced pricing/availability remain on the website.
- Overview, Campaigns, Create, Calendar and Insights. Phone tabs become a tablet side rail. Business profile and account controls sit in the workspace menu.
- Campaign search and pagination; objective, description, five document/image references; two-step Brief / Plan composer; durable generation with recovery; campaign review and idea-to-content drafts.
- Native Create studio: caption/brief editing, saved AI conversations, actual image/Reel previews, JPEG/MP4 uploads, library attachment, image/video generation, and carousel editing. Revision conflicts preserve manual edits for review.
- Separate Mark Ready and Schedule actions, a Bahrain date/time picker with half-hour slots, rescheduling and cancellation. Scheduling checks live readiness, connection, media, caption and the reviewed revision again at confirmation.
- Native Instagram connection/reconnection, renewal and confirmed disconnection; native authenticator enrollment and sensitive-action confirmation. Instagram consent opens the system browser and returns to the app through a fixed, credential-free link.
- Bahrain weekly calendar with planned drafts, status filters and paginated unscheduled content; publishing activity and per-post progress/recovery. Uncertain publishing results ask the owner to check Instagram before rescheduling.
- Paginated in-app notifications with unread counts and links to post status. Publishing success and failure notices use actual worker outcomes; operating-system push alerts are not included.
- Seven- and thirty-day Insights, period comparisons, available daily reach and top content, with explicit missing/partial data and synchronization timestamps.
- English/Arabic, IBM Plex Sans and IBM Plex Sans Arabic, system/light/dark themes, reduced-motion support and shared Lucide icons.

## Run and build

From the repository root:

```powershell
corepack pnpm install
corepack pnpm --filter @markos/mobile start
corepack pnpm --filter @markos/mobile typecheck
corepack pnpm --filter @markos/mobile exec vitest run test/studio-device-store.test.ts test/studio-model.test.ts test/campaign-client.test.ts test/brief-recovery.test.ts test/brief-model.test.ts test/scoped-fetch.test.ts
corepack pnpm --filter @markos/mobile build
```

Run EAS commands inside `apps/mobile`:

```powershell
eas.cmd build --platform android --profile preview
eas.cmd build --platform ios --profile simulator
```

The Android preview is a signed **ARM64 APK** with its JavaScript bundled; it uses Railway without a PC or Metro server. The preview targets current 64-bit Android phones to reduce build time and download size; production retains the default architecture set. The simulator profile produces an iOS Simulator app, which requires a Mac to run. An iPhone device build needs Apple Developer signing credentials and device registration or TestFlight. Neither preview is a store submission.

The owner's TestFlight build 3 and Android runtime 0.2.0 remain compatible with the latest preview update above. Earlier business setup/profile update `3524cd3e-63d2-4e6b-aecc-bd517a20ea9c` is superseded.

Preview builds use the `preview` Expo Updates channel and Expo's [app-version runtime policy](https://docs.expo.dev/eas-update/runtime-versions/). Compatible JavaScript/asset changes can be delivered with `eas.cmd update --channel preview --environment preview --message "Describe the change"`. **Bump `version` in `app.config.ts` before changing native dependencies or native configuration**, then create new builds. Windows and EAS use different pnpm dependency paths, so the initial automatic fingerprints did not match; the explicit app version is the runtime contract for this prototype. Do not publish an update that targets an unverified backend contract.

Public service defaults are in `src/config.ts`. `.env.local` may override only public API/web URLs. Database passwords, AI keys and email keys stay on Railway. Native login uses `/v1/auth/native/*`; browser login keeps its existing cookie transport.

## Persistence and generation

Device drafts and copied references are keyed by API host, user and workspace. Credentials do not enter AsyncStorage. Explicit logout clears the device's current campaign brief and references. Reference limits match the API: five files, 8 MB each, 20 MB combined; PDF, DOCX, TXT, PNG, JPEG and WebP. Start dates are sent as Bahrain calendar days.

Business setup and maintenance drafts use separate identity-scoped records; onboarding copies files into its own directory and logout clears those records/files. A lost document-analysis response reads the active server analysis before offering a retry. Extracted facts remain editable, with provenance/confidence and separate approval before generating the bilingual introduction. Files expire after 24 hours or are removed by approval/discard. This uses the existing synchronous analysis service and status lookup, not the durable campaign-job mechanism. Business maintenance preserves approved status and patches only edited fields. Catalog revisions are distinct from profile revisions. Account signup, recovery, authenticator and Instagram management are native; advanced catalog controls retain their hosted web flow.

Campaign creation persists one request ID with the brief before calling `POST /v1/campaigns/generations`. The API returns a durable receipt; after acceptance, generation continues when the phone is locked or the app closes. Reopening polls the same request. If transmission was interrupted before acceptance, Recover resends the same ID and body. A matching replay returns the original job; a changed brief cannot silently reuse that ID. Completion clears only the matching device brief, preserving a newer one.

PostgreSQL coordinates claims across API instances. The campaign, usage record and completion receipt commit together. Queued work survives API restart. An interrupted running attempt expires after ten minutes and requires an intentional retry; ambiguous paid provider work is not automatically replayed. Raw reference bytes live temporarily in the job and are cleared on completion/failure. Original files are not cloud Library assets; the campaign retains reference metadata and the extracted summary. The web app keeps its compatible synchronous generation route.

Submitted Assistant messages retain a scoped request ID on the device until acknowledged, and conversation history lives on the server. Unfinished captions, media directions, details and unsent messages now save on this device as they change. The status distinguishes a completed device write from the explicit Save to MARKOS. Reopening fetches the authoritative content first, then restores the local working copy. A newer server revision requires reconciliation; removed slides retain their local text for copying. A Save that completed on the server but lost its response does not resurrect identical pending edits. Device recovery requires restored sign-in and access to the content; this is not offline authentication or offline publishing.

Device records are scoped by API host, user, workspace and content. Logout clears this identity's editor/message/submission records after in-flight writes finish, while session expiry preserves recoverable work until access is revalidated. Storage failures remain visible and do not claim the edit is safe to close. Leaving an edited screen offers Keep editing, Save and leave, and Discard. Confirmed discard removes the device copy; an interrupted server save preserves it.

JPEG/MP4 media uploads currently allow 8 MB per file. Existing server video planning and FFmpeg/libass render requested English/Arabic lettering separately from footage; previous video assets are not rewritten.

## Shared foundations

`packages/api-client` supplies typed requests and workspace headers. Its injected native fetch cancels obsolete requests through body completion. Query caches are isolated by identity; refreshing cannot change the workspace of an existing session.

`packages/ui-tokens/src/native.ts` is generated from `apps/web/app/theme-tokens.css` by `scripts/generate-native-tokens.mjs`. `pnpm --filter @markos/mobile check:tokens` and EAS post-install reject stale colors. Phone layout uses explicit direction once in shared rows/tab navigation, mirrored back arrows/transitions, and directional text; the root stays LTR to prevent automatic double mirroring. Device RTL and assistive-technology checks are still required.

## Validation boundary

The current preview uses runtime **`0.2.0`** because adding `expo-video` requires a new binary. [Android ARM64 build](https://expo.dev/accounts/mo4180/projects/markos/builds/df2ba5e0-e2f0-4398-af9b-2665c9e971de) finished successfully on 22 September 2026. Its downloaded APK passed ZIP integrity and confirms package `com.markos.mobile`, version 0.2.0/code 2, ARM64 libraries and the hosted Railway API URL in its bundle. [Download the Android APK](https://expo.dev/artifacts/eas/HxGFvtSm7aQrS5fdJm_4vNMnZnbTa_ia5MqzMA9cpOI.apk) (50.8 MB).

The [iOS Simulator build](https://expo.dev/accounts/mo4180/projects/markos/builds/521919bb-61bc-44c9-844e-f3c7899b677c) also finished successfully; its downloaded artifact confirms bundle `com.markos.mobile`, version/runtime 0.2.0, Simulator platform and the preview update channel. Its embedded `CFBundleVersion` is 1 despite EAS reporting remote build version 2. [Download the Simulator archive](https://expo.dev/artifacts/eas/SDumJDmuiwbXNFbSUNODLJnH0yavIyDLNw9I6NpSzaY.tar.gz).

The combined EAS invocation labels both with the `simulator` profile; Android inherits the signed phone APK settings from `preview`. Install 0.2.0 over the previous APK; an OTA update cannot add its native video player to 0.1.0.

Focused 0.2.0 results: 19 mobile studio/recovery/request/file/date/transport tests, six campaign-job and scheduling integration tests, and four existing browser-renewal tests passed. Mobile, API and shared API-client TypeScript checks passed; Expo Doctor reported 21/21 checks and dependency compatibility passed. Both native JavaScript bundles export. Database tests used only the explicitly disposable local `markos_mobile_jobs_test` database with mocked AI; no live test campaigns, schedules or paid generations were created.

Railway API deployment `651b2a1f-d1c0-46c9-b3ec-b4ec24f2b87a` is successful and Prisma reports all 21 migrations applied. `/v1/health` is `ok`; the deep check reports database, Redis and AI `ok`, with OpenSearch down (the current API references OpenSearch only in configuration and that diagnostic). The new job endpoints require authentication. Scheduling accepts an optional reviewed revision; existing browser callers remain compatible.

The owner checked the earlier 0.1.0 layout on a phone. The new studio, interrupted upload recovery, native pickers, keyboard/back behavior, Arabic glyph shaping and screen readers still need a physical-device walkthrough. Compilation and focused integration tests do not substitute for that walkthrough. iPhone distribution requires Apple Developer signing; the simulator artifact cannot install on an iPhone.

The subsequent device-recovery pass adds seven persistence tests (identity isolation, bilingual restore, conflicting/newly saved revisions, write failure, message replay, legacy intent migration and logout during a write). These and the four studio-model tests pass; mobile TypeScript passes. [Update group c13b59ab-083f-4b96-ab00-39ca2637f38d](https://expo.dev/accounts/mo4180/projects/markos/updates/c13b59ab-083f-4b96-ab00-39ca2637f38d) is published for Android/iOS on the existing 0.2.0 runtime and preview channel. Both platform update-manifest requests returned HTTP 200 and the exact published update IDs. No native dependency or Railway deployment changed. Phone app-kill and storage-failure walkthroughs remain device checks. The original APK downloads this compatible update on launch and applies it on the next cold launch.

## iPhone signing and TestFlight

The owner completed Apple sign-in and signing setup on 22 September. Apple team `UP2APD2U2R` now has a dedicated provisioning profile for `com.markos.mobile`. The owner chose to reuse the existing valid distribution certificate; no certificate was changed or revoked.

The owner has other Apple apps and explicitly requires MARKOS to be a **new app**. Scope signing and submission to `com.markos.mobile` and a separate MARKOS App Store Connect record. Do not alter existing apps, select an unrelated app record, or revoke their signing certificates/profiles. A new provisioning profile for MARKOS is appropriate; an identifier or app-record conflict requires checking ownership rather than repurposing another app.

Created a separate [MARKOS App Store Connect app, 6814797764](https://appstoreconnect.apple.com/apps/6814797764/testflight/ios); `eas.json` pins submission to this app, bundle and team. The existing App Store Connect submission key was assigned to the MARKOS Expo project without modifying or revoking the key. [Signed iPhone build 524674ac-db18-4421-84cd-e326f1edc4f6](https://expo.dev/accounts/mo4180/projects/markos/builds/524674ac-db18-4421-84cd-e326f1edc4f6) finished successfully. Its downloaded IPA passed ZIP integrity and confirms version 0.2.0/build 3, iPhoneOS, runtime 0.2.0, preview channel, MARKOS's team/bundle entitlement and disabled debugger entitlement. [Submission 65e33f8f-262d-4529-844e-17be2710558e](https://expo.dev/accounts/mo4180/projects/markos/submissions/65e33f8f-262d-4529-844e-17be2710558e) finished successfully.

At 14:03 Bahrain time Apple reported build `154730dc-e7ae-4b86-bbdc-878f87f48190` **VALID and ready for internal testing**, with no missing export declaration. MARKOS uses platform HTTPS/Keychain APIs, so this build's `usesNonExemptEncryption` was set to `false` following [Apple's platform-encryption guidance](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations). English test notes were added directly to this build. The internal `Team (Expo)` group includes build 3, has automatic build access, has no enabled public link, and contains exactly the owner's invited Apple account. An actual iPhone installation and walkthrough are still separate checks. Future native builds should declare the same exemption in their Info.plist when the native configuration is next versioned.

Expo's first interactive submission automatically created `Team (Expo)` on the new MARKOS app and added all four existing team admins. This was disclosed and corrected immediately: removed the three other testers' relationships to MARKOS only, then verified that the new group contains only the owner's Apple account. No existing app or account-wide tester was removed. Future setup must set `EAS_NO_AUTO_TESTFLIGHT_SETUP=1`; the pinned `ascAppId` also avoids automatic app/group setup.

`testflight` is a store-distribution build profile using the preview update channel; `production` has a separate production channel. Build with `eas.cmd build --platform ios --profile testflight --freeze-credentials`, then set `$env:EAS_NO_AUTO_TESTFLIGHT_SETUP='1'` and submit the exact build with `eas.cmd submit --platform ios --profile testflight --id <build-id>`. Avoid `--what-to-test` with EAS Submit on this Expo plan: the service rejected changelog submission as Enterprise-only. Test notes can be set directly in MARKOS's App Store Connect record. This does not release a public App Store version. See [Expo's TestFlight workflow](https://docs.expo.dev/submit/testflight/).

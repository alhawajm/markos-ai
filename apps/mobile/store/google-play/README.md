# MARKOS Google Play setup

Submission verified 8 November 2026. Package: `com.markos.mobile`. Publisher: Raedat Software Company W.L.L.
Use the existing paid company developer account. Its sign-in identity is recorded in the private handover.
Developer: `7942065176861258837`; app: `4974430818389016731`.
[MARKOS dashboard](https://play.google.com/console/developers/7942065176861258837/app/4974430818389016731/app-dashboard).
Other app releases, account identity and signing keys are preserved. The required company trader declaration uses the existing registry and public contact details. MARKOS's app-level declaration and Terms URL are saved. Google's inherited account status also creates a declaration task for other apps; no other app's declaration was edited.

## Current saved state

| Item | Verified state |
| --- | --- |
| Production | **0.5.0 (10)**, held as **Draft**; no public review or rollout |
| Closed testing | **Alpha, build 10**, submitted; Console shows **Changes in review**, initially running automatic pre-review checks |
| Testers | Existing **Internal Test** list selected, 11 users; list membership preserved |
| Internal track | Build 10 draft; existing completed build 8 preserved |
| Release validation | Preview and confirm shows **zero errors**, with one conditional deobfuscation-file warning |
| Listing | English and Arabic names, descriptions, support links and release notes saved |
| Native screenshots | **Five per language**, uploaded and SHA-256 matched on a fresh Publisher API read |
| Graphics | Updated English/Arabic feature graphics match the current pink, teal and lavender palette |
| Policy declarations | Previous declarations retained; company and MARKOS trader declarations completed, with the public Terms URL |
| App access | Sign-in required; isolated, preverified reviewer account and protected instructions saved |
| Privacy / Data safety | Policy/deletion links saved; collection, security/reporting purposes and deletion answers accepted |
| Ads / Advertising ID | No in-app ads or advertising-ID use declared |
| Audience / Rating | Adults 18+; completed IARC declaration, without a fabricated Everyone rating |
| Health / Government / Finance | No such app features declared; forms saved |
| Category / Price | Business app; free download |
| Developer verification | Organization account; MARKOS registered under the existing company identity |
| Availability | 177 country entries plus Rest of World saved as pending changes |

[Build 10 upload](https://expo.dev/accounts/mo4180/projects/markos/submissions/d1b48755-496f-448a-bc4a-8dbba62e997e) is saved and its SHA-256 matched before selection for Alpha. The owner explicitly chose closed testing because Google cannot hold an app's first production publication with managed publishing. The Alpha preview had no errors and only the conditional mapping-file warning. After confirmation and bilingual support-copy updates, the Publisher edit commit submitted the saved changes. Console readback at 12:27 Bahrain time showed **Changes in review**, with automatic quick checks preceding reviewer-queue entry. The production release independently remains **draft**. A submitted closed test is not public availability or Google approval.

Google requires its default commit behavior for this draft app. A successful API commit is not public review approval. The Console still calls the package unreviewed until its first review. The deobfuscation warning is conditional on R8/ProGuard use; no mapping file was fabricated or unrelated build setting changed to hide it.

## Genuine native assets

`screenshots/en-US/` and `screenshots/ar/` contain campaign, caption editor, full post preview, calendar and dark-mode captures from the connected physical Android phone. See [native-capture-manifest.json](native-capture-manifest.json) for provenance and hashes.

The real native app rendered a Play-compatible **1080 x 2160** viewport. Only lossless alpha removal was applied to the PNG encoding; the UI was not resized, cropped, generated or replaced with a website. Each uploaded frame was checked for credentials, customer data and device notification banners. All content belongs to a fictional Pearl Studio workspace. Temporary phone display, rotation, stay-awake and interruption settings were restored and verified, and sample download files were removed.

Native acceptance completed on 3 November:

- Ordinary sign-in, session recovery and app update loading.
- English/Arabic, RTL and light/dark presentation on the captured routes.
- All four content-format choices visible; an explicit native Mark ready confirmation produced `APPROVED` while leaving scheduling and publication timestamps empty. The temporary acceptance post was then removed.
- Five TXT references selected through Android's document picker, preserved with the brief/context after a cold restart, uploaded and used by a completed three-day campaign. Its saved plan contains five reference records and a reference summary.
- Optional notification permission and registration, a controlled Expo/FCM delivery with a successful receipt, and observation of its exact test notification on the phone. No publishing event was fabricated. The temporary reviewer-phone registration was revoked afterward.

This is focused Android evidence, not a claim that every format, accessibility scenario, external-provider failure or iPhone push flow has passed physical-device acceptance.

## Reviewer access and release gates

The protected reviewer form contains a separate reusable login in a fictional workspace. Credentials and private contacts remain encrypted outside Git. No customer workspace, Instagram credential, global auth bypass, MFA gate, payment or expiring trial is required for that account. The review instructions disclose the absence of a connected Instagram account.

Create supports Post, Carousel, Story and Reel; Edit opens Caption, Media and Details, and Preview displays the complete post before approval. Motion Reels animate uploaded artwork and exact text cards using Railway CPU rendering. They do not establish a free generative-footage service.

Closed-test submission is authorized and recorded; public launch remains held. The owner confirmed delivery through Gmail and selected **info.raedat.2024@gmail.com** as the monitored public support/privacy contact. It is saved in Console and both descriptions, and deployed in web and native Help. Live bilingual privacy disclosures identify Google/Gmail. Source CI, web/native typechecks, seven focused web cases and three live rendered legal-page cases passed. Preview and production mobile update bundles match the exported Android/iOS bytes.

Google's automatic checks and review, Meta Advanced Access approval, remaining launch acceptance and physical iPhone push delivery are separate pending outcomes. Existing moderation/reporting, encrypted backups and recovery evidence are documented in [release readiness](../../../../docs/release-readiness.md).

## Sources and maintenance

- `en-US.json`, `ar.json`: listing text.
- `metadata.json`: release notes and Console identifiers.
- `data-safety.json`, `data-safety.csv`: current disclosure sources; revisit when processors, purposes, SDKs or monetization change.
- `icon.png`, `feature-*.jpg`, `feature-*.svg`: icon, localized feature graphics and editable vector sources.
- `node scripts/generate-play-store-assets.mjs` uses the repository theme tokens and installed licensed fonts.
- `python scripts/generate-play-data-safety.py` requires Google's current sample CSV at ignored `var/release-prep/google-play-data-safety-template.csv`; revalidate schema IDs before a future import.

Use the saved company TinyFish profile for authenticated Console work and verify the exact app before changes. A previous automatic approval review blocked shell-launched Edge; do not bypass that block with another launcher. Keep live browser links and credential material outside this directory.

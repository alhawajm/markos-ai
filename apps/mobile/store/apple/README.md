# MARKOS App Store preparation

Verified 3 November 2026. Only MARKOS is in scope; other company apps, distribution certificates and existing tester groups are preserved.

- App: `6814797764`; bundle: `com.markos.mobile`.
- [App Store Connect](https://appstoreconnect.apple.com/apps/6814797764/distribution).
- Store version **0.5.0**, selected build **9**, processing **VALID**.
- State **Prepare for Submission**, with **manual release**.
- Build 9 is **IN_BETA_TESTING** internally and **READY_FOR_BETA_SUBMISSION** externally. No public TestFlight link or external review was created by this pass.

## Saved forms and metadata

| Item | Verified state |
| --- | --- |
| Listing | English `en-US` and Arabic `ar-SA` name, subtitle, description and keywords |
| Links | Localized support, privacy and account-deletion/privacy-choice pages |
| Categories | Business; secondary Productivity |
| Copyright | 2026 Raedat Software Company W.L.L |
| Content rights | Authorized user media/Instagram access declared |
| Pricing | Free; Bahrain base territory; no paid upgrade or purchase configured |
| Availability | 175 current territories; no pre-order or automatic new-territory expansion |
| Age declaration | Adult-business positioning and `EIGHTEEN_PLUS` override; legacy API also reports 17+ |
| Reviewer | Working, preverified fictional workspace; protected login and contact instructions saved |
| Export compliance | Build 9 reports `usesNonExemptEncryption: false` |
| App Privacy | Published 1 November; 15 data types and 25 category/purpose entries, linked to the account, no advertising tracking |
| Free Apps Agreement | Active through 13 April 2027 |
| EU trader | Owner-approved email and phone verified by email/SMS; MARKOS's Trader declaration saved and freshly read back |
| Native screenshots | 14 genuine iPhone/13-inch iPad screenshots captured and visually reviewed; Apple upload/processing readback is in progress |

`en-US.json`, `ar-SA.json`, `age-rating.json` and `privacy.json` hold the listing and declaration sources. The protected reviewer form uses a dedicated fictional account without customer data, a connected Instagram account, an MFA/payment requirement or an expiring trial. Credentials and private review contacts remain encrypted outside Git. They must never appear in screenshots, fixtures, notes or logs.

Apple's trader contact verification used the registered company address and the owner's explicitly approved public contacts. Developer membership identity, other apps' declarations, paid agreements, bank information and tax settings were preserved. The account's separate Paid Apps Agreement/bank/tax prompts were not accepted for this free app. See [Apple's trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/).

The selected build was updated from 8 to 9 after Apple's processing completed, then independently read back. Publishing the privacy label, selecting a build and uploading through EAS do not submit or release the app. The last preparation validator reported missing medium Dynamic Island iPhone and 13-inch iPad screenshots; recheck after the native assets finish.

## Native screenshot preparation

The owner has Android hardware and authorized genuine native capture work. A standard GitHub-hosted Mac builds the actual React Native app for genuine iPhone and iPad simulators using the real Railway API. The repository is public and uses standard runners. No Apple hardware purchase, larger runner or screenshot-cloud subscription was added.

The capture workflow uses Xcode's normal ad-hoc simulator signing; it does not use or replace the company's distribution certificates. Each device starts in a disposable simulator. The dedicated review account exercises normal login and saved workspace data; backend responses and UI are not mocked. Both device flows passed in [run 41632599149](https://github.com/alhawajm/markos-ai/actions/runs/41632599149). The two temporary GitHub reviewer secrets were removed and their absence checked after capture completed.

[The native capture manifest](native-capture-manifest.json) records source commits, native dimensions and SHA-256 values for five English and two Arabic images per device. Each selected image was inspected for private data and visible failures. The general Overview frame and credential-cleared diagnostic frames are excluded from the store selection. Upload transfer alone does not establish processed placement acceptance.

Apple currently requires a medium Dynamic Island iPhone screenshot and a 13-inch iPad screenshot for this tablet-capable app. Native examples are **1206 x 2622** and **2064 x 2752**, respectively. Recheck the live asset reference data before upload. PNG-to-JPEG conversion may remove alpha without changing the native layout or dimensions; web captures and generated device mockups are unsuitable.

## Acceptance and remaining gates

The physical Android pass verified login/reopen, bilingual/RTL and light/dark routes, all four format choices, explicit approval without scheduling/publication, a five-document campaign recovered after restart, and controlled phone push delivery with an OK provider receipt. See [release readiness](../../../../docs/release-readiness.md) and the [Play setup record](../google-play/README.md).

Apple simulator capture establishes genuine native rendering and the exercised navigation/login flows. It does not prove physical iPhone APNs delivery or every device, accessibility and provider-failure scenario. No untested accessibility Nutrition Label features are claimed.

Public submission remains held for native Apple screenshots, remaining acceptance, transactional-email/domain and support-delivery readiness, final legal review and Meta's Advanced Access decision. The Meta request is in review, not approved. The eventual review submission must use the verified build and processed, visually reviewed screenshots. Public availability remains a separate manual-release action after approval.

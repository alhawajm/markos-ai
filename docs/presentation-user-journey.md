# Management Presentation User Journey

Date: August 12, 2026

This runbook keeps the management presentation focused on the first clear MARKOS value loop: understand the business, confirm that understanding, and produce a useful Strategy. It is not a production-readiness checklist or a complete redesign plan.

## Presentation boundary

The presentation uses the adopted Sunlit UI on canonical routes. Email signup, login, verification, onboarding, Business Profile approval, Strategy, and authenticated Settings are connected to their application contracts. Do not imply that deferred Google, Apple, password-recovery, or external-provider capabilities are live.

## Tab and route order

Prepare the tabs before the meeting and keep them in this order.

| Stop | Route | State | Purpose | Target time |
| --- | --- | --- | --- | --- |
| 1 | `/en` | Public | Explain MARKOS as a dedicated, adaptable marketing partner | 1 minute |
| 2 | `/en/signup` | Connected auth | Create the presentation account and show explicit legal consent | 45 seconds |
| 3 | `/en/verify?email=owner%40snacklab.test` | Connected verification | Show verification delivery, guidance, and resend behavior | 30 seconds |
| 4 | `/en/onboarding` | Verified, incomplete demo workspace | Show how MARKOS learns the business | 2 minutes |
| 5 | Onboarding Business Profile review | Generated, editable profile | Confirm what MARKOS understood before approval | 90 seconds |
| 6 | `/en/app/strategy` | Approved workspace | Show the first business-specific 30-day Strategy | 2–3 minutes |
| 7 | `/en/app/settings` | Authenticated workspace | Close with user control, security, and MFA-gated Instagram access | 1 minute |

Login and password recovery remain available as supporting tabs but are not required stops unless management asks about them:

- `/en/login`
- `/en/forgot-password`
- `/en/reset-password`

Terms and Privacy are supporting infrastructure, not part of the main presentation path.

## Talk track

1. MARKOS starts by understanding the business instead of asking the owner to become a marketer.
2. The owner remains in control: MARKOS shows what it learned and asks for approval before using that identity.
3. The approved Business Profile grounds a business-specific Strategy rather than generic content suggestions.
4. The first Strategy is the current end of this presentation journey. Content production, publishing, and adaptive insights are the continuation—not capabilities to simulate with dead controls.
5. Settings demonstrates how prerequisites appear where they matter: Instagram remains visible but gated until the account is secured with MFA.

Use one short Arabic/RTL proof point during the presentation. Do not repeat the complete journey in both languages.

## Private presenter preparation

Never commit credentials or secrets to this document.

- Keep one verified, incomplete onboarding account ready for the primary journey.
- Keep a second verified account with an approved Business Profile and generated Strategy ready as a fallback.
- Store passwords in private presenter notes, not the repository.
- Use one consistent business and dataset across every live screen.
- Keep a safe screenshot or document of the approved profile and generated Strategy open locally.
- Never display MFA QR codes, manual secrets, access tokens, or provider credentials.

## Rehearsal gates

The journey is ready only when:

- every prepared route loads at the presentation viewport and 100% browser zoom;
- profile approval lands directly on Strategy;
- no dead Export control, fixed 30/60/90 cards, internal retrieval labels, or placeholder usage indicators appear on Strategy;
- the Strategy leads with its summary, three priority actions, and the four-week plan;
- English completes the full journey and the chosen Arabic/RTL proof point renders correctly;
- the presenter can switch to the fallback Strategy without searching or typing URLs;
- connected, deferred, and externally dependent capabilities are described accurately;
- the complete section stays within ten minutes.

Run one technical rehearsal and one uninterrupted timed rehearsal. After the first successful rehearsal, change only presentation-blocking defects.

## Deferred until after the presentation

- Further onboarding visual refinement.
- Pomelli, Buffer, and Canva reference study.
- Navigation redesign.
- Content-plan redesign.
- Google and Apple authentication integration.
- Controlled production Settings and Instagram verification.
- Legal-page navigation tuning.

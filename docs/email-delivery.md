# Transactional email

The owner declined paid SendGrid service after its trial ended on 26 October 2026.
The installed key reached SendGrid but received HTTP 401 with `Maximum credits exceeded`.
This was a provider allowance failure, not a missing Railway secret. Sealed variables
appear empty through Railway's API; check runtime configuration without logging values.

On 5 November 2026 the owner authorized a **Gmail API** sender for low-volume mail
without company IT/DNS access. The Gmail transport is implemented; authorization,
runtime activation and inbox receipt must be verified before calling it operational.
Messages use the authorized Gmail address with the display name MARKOS, rather
than impersonating the unauthenticated company address. Customers need no Gmail
account and grant no Google permissions.

## Gmail activation

1. Use a company-controlled operator Gmail mailbox and a dedicated OAuth client in
   the existing MARKOS Google Cloud project. Enable Gmail API, keep billing disabled,
   and request only `https://www.googleapis.com/auth/gmail.send`. Do not reuse the
   customer-login client, Firebase CLI credentials, or broad mailbox permissions.
2. Configure the consent screen for this operator-only connection. External Testing
   grants expire after seven days; complete the appropriate production consent
   configuration/review before relying on unattended sending. Never claim Google
   verification based on having created a client or accepted an unverified-app prompt.
3. Authorize the sender with a desktop loopback OAuth flow using state and PKCE.
   `scripts/authorize-gmail-sender.mjs --help` describes the workstation helper. It
   opens Google locally, runs the actual mail transport against an explicitly
   authorized test inbox, and installs sealed API credentials without activating
   a provider or printing authorization URLs/tokens. Keep its Desktop OAuth JSON
   under ignored `var/` or outside the repository.
   Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN` in Railway
   API secret variables. Worker and backup services reference the API's values.
   Seal credentials using Railway's variable menu; sealed values cannot be read back.
   Keep the previous provider selected until the credentials and code are ready.
4. Set `FROM_EMAIL` to the actual authorized Gmail address. Run a controlled send
   through the deployed transport, check Google's acknowledgement, and confirm
   receipt in the authorized test inbox. Then set `EMAIL_PROVIDER=gmail` and deploy
   API, worker and backup with consistent references. Exercise verification/recovery
   in the selected mailbox; never log their links or codes.
5. Refresh authorization if Google revokes the grant or the sender password changes.
   Inspect sanitized operational logs for `EMAIL_REJECTED`; do not claim a grant
   lasts forever. Gmail does not supply transactional delivery-event guarantees.

Standard Gmail API usage has no additional API cost, while request quotas and
mailbox sending limits still apply. This is a low-volume option, not unlimited mail;
do not enable billing, purchase quota or automatically fall back to a paid provider.
The transport caches short-lived access tokens only in process memory, coalesces
refreshes and never exposes Google error bodies. A token-refresh failure occurs
before sending and can be retried safely; a network failure after submission is
UNKNOWN. An explicit 401 can trigger one refresh and resubmission.

References: [sending MIME messages](https://developers.google.com/workspace/gmail/api/guides/sending),
[desktop OAuth/PKCE](https://developers.google.com/identity/protocols/oauth2/native-app),
[OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration),
[scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification),
and [API quotas](https://developers.google.com/workspace/gmail/api/reference/quota).

## Previous Brevo setup

Brevo was the selected free replacement. Its published Free plan includes **300 sends
per day** for transactional email, without a time-limited trial. Check the current
[free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
before changing the plan. Provider caps can delay emails; this is not unlimited email.
Do not enable paid upgrades, prepaid credits or automatic paid fallback.

### Brevo activation

1. Complete the company's Brevo account verification and keep the Free plan selected.
2. Add and verify `support@raedat.online` as sender. Authenticate the domain using the
   DNS records supplied by Brevo. Review transactional tracking/privacy settings and
   enable anonymous tracking where available. Do not assume the SendGrid API tracking
   flags carry over: Brevo does not document equivalent per-message controls, and
   complete disabling may require an Enterprise account. Do not purchase an upgrade.
   Verify the final message source and provider settings before promising tracking is off.
3. Put a Brevo **API key**, rather than an SMTP password, in the API service's sealed
   `BREVO_API_KEY` variable. Do not put it in chat, a file, build arguments or Git.
4. Set API `EMAIL_PROVIDER=brevo` and `FROM_EMAIL=support@raedat.online` only after
   credentials and sender verification are ready. Worker and backup services should
   reference the API service's `BREVO_API_KEY`, `EMAIL_PROVIDER` and `FROM_EMAIL`.
5. Deploy the implementation, check a controlled verification/recovery email and a
   report to a company-controlled inbox, then confirm actual receipt. Brevo HTTP 201
   with a message ID establishes acceptance, not inbox delivery.

`src/email/transactional-mail.ts` is the common transport for verification, recovery,
deletion confirmation, password-change notices, PDF reports and classified operations
alerts. English/Arabic bodies and existing approval/preferences remain in their domain
services. The adapter never creates marketing contacts, subscribes users, upgrades a
plan or switches to another provider after a failed/ambiguous request.

Network failures or lost acknowledgements remain UNKNOWN. Durable report delivery
does not automatically replay UNKNOWN sends. Explicit provider rejection retains the
existing bounded retry handling; response bodies and credentials never reach logs.
SendGrid remains supported for compatibility, but is not a paid fallback.

Setup references: [Brevo transactional email API](https://developers.brevo.com/docs/send-a-transactional-email),
[sender/domain setup](https://developers.brevo.com/docs/getting-started-with-senders-and-domains),
[anonymous tracking](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails),
and [the vendor's tracking limitation discussion](https://community.brevo.com/t/no-way-to-disable-by-option-tracking-in-transactional-e-mail/201?page=2).

### Brevo external acceptance still required

The owner created a free Brevo account and supplied a restricted key. The key is
installed in Railway; API and worker deployments use Brevo. Controlled requests
to the owner-selected company/Gmail addresses were accepted with HTTP 201, but
transactional logs then reported sender/domain delivery errors and zero deliveries.
Sender authorization must be completed before email is considered operational.
The restricted runtime key can send emails and read transactional events, but cannot
read account settings or manage senders. Do not request full-account access to solve
that separation. Firebase CLI login also remains separate from
Google/Firebase browser login. Only record Android push as activated after the correct
MARKOS Firebase project, FCM credential, native build and device receipt are verified.

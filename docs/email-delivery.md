# Transactional email

The owner declined paid SendGrid service after its trial ended on 26 October 2026.
The installed key reached SendGrid but received HTTP 401 with `Maximum credits exceeded`.
This was a provider allowance failure, not a missing Railway secret. Sealed variables
appear empty through Railway's API; check runtime configuration without logging values.

Brevo is the selected free replacement. Its published Free plan includes **300 sends
per day** for transactional email, without a time-limited trial. Check the current
[free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
before changing the plan. Provider caps can delay emails; this is not unlimited email.
Do not enable paid upgrades, prepaid credits or automatic paid fallback.

## Activate

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

## External acceptance still required

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

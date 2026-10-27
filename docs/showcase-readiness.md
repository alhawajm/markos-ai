# Showcase readiness — September 21, 2026

**Live hosted AI, generated video playback and launcher recovery are verified.**
This project connects to Railway; it requires internet and uses real paid AI
providers.

## What passed

Direct calls to the deployed AI service used fictional coffee-business inputs.
They did not sign in through the application, write shared business data, or
attach generated media to the shared Library.

| Capability | Model | Observed result | Input / output tokens |
| --- | --- | --- | --- |
| Bilingual content | GPT-5.6 Terra | Completed in 6.4 s | 865 / 194 |
| Create conversation | GPT-5.6 Terra | Discussion response in 3.2 s; no authoring operations | 2,201 / 64 |
| Three-day Campaign | GPT-5.6 Sol | Completed in 19.5 s | 920 / 715 |
| Bilingual business profile | GPT-5.6 Sol | Completed in 14.6 s | 453 / 389 |
| Text-document analysis | GPT-5.6 Sol | Completed in 15.3 s | 2,057 / 735 |
| Image generation | GPT Image 2 | 1024×1280 JPEG, 127,046 bytes, 34.8 s | 162 / 1,510 |
| Video generation | Sora 2 | Completed; downloaded four-second 720×1280 MP4, 1,679,444 bytes; Chrome playback passed | Not recorded here |

The actual responses establish that the hosted AI authentication and provider
credentials work, even though Railway CLI did not return the OpenAI key value.
The same hosted AI/internal-auth configuration is used by the local API. A fresh
read-only check found no database model-setting overrides.

These were live requests with nonzero usage: the five text checks and one image
check returned 6,658 input and 3,607 output tokens, 10,265 total. Evidence is in
ignored `var/showcase-check/*.json`; exact monetary charges were not returned,
including for video. Generated samples are `var/showcase-check/sample-coffee.jpg`
and `sample-coffee.mp4`. Timings are observations, not latency guarantees.

Chrome decoded the MP4 at 720×1280 with a 4.1-second duration, reached ready state
4 without a media error, and played beyond one second. The video frame and JPEG
were visually inspected. Playback evidence is `var/showcase-check/video-frame.png`.

All six Railway services reported successful deployments; the main application
services match `e3d51e4`. Read-only data inventory found four verified password
accounts (three with MFA), three completed workspaces, four Campaigns, five active
content items, 14 S3 assets, 146 stored Insights records, six completed jobs and
four successful conversations. Counts describe existing data, not new test writes.

A unique temporary storage marker passed Put → Get with identical bytes → Delete
→ HEAD 404. No database rows or existing assets changed. Evidence is in
`var/showcase-check/storage-roundtrip.json`.

A presence-only check of hosted API configuration found the SendGrid key/sender
and Instagram app ID, app secret and encryption configuration present; hosted
email uses SendGrid. No secret values were exported. No email was sent, so this
is configuration evidence rather than a delivery test. The SendGrid credential
remains unavailable to the local API.

## Demonstration order

1. Run MARKOS and sign in with an existing verified account; have its MFA method
   available if enabled.
2. Open Business profile and an existing Campaign to show the saved context.
3. Open Create, ask the assistant for a caption or direction, then generate one
   image. Allow time for the live provider response.
4. Show the already generated video sample, then the Calendar preview.
5. Show stored Insights history as historical data.

The read-only inventory found **zero active Instagram connections**. A workspace
owner must connect through hosted Settings and reload locally before live
publishing or fresh Insights can work. Actual publishing is outside this demo
check; scheduling alone does not establish an Instagram post.

Use an existing verified account. The local email credential was unavailable
through the handover, so new-account verification uses the hosted application.
Google/Apple sign-in, password recovery and complete live billing are unavailable;
do not include those flows in the showcase.

## Remaining verification

The earlier UI journey passed against a disposable local database with
deterministic providers. These live AI checks add provider evidence, but they do
not validate authenticated UI generation, shared Library attachment, application
usage persistence, real publishing or fresh Insights end to end.

The earlier tunnel stall now has a tested automatic recovery path. A controlled
drill paused only the verified launcher-owned SSH process, simulating a live but
stalled connection. State changed from Ready to degraded at 10 seconds,
recovering at 55.7 seconds and Ready at 65.6 seconds; full dependency health was
confirmed at 70 seconds. The supervisor and web process stayed running; only the
tunnel and API were replaced. Repeated Run waited through recovery and reused
the same launcher session. PostgreSQL, Redis, OpenSearch and AI were healthy
afterward, and the drill made no shared database writes. These are observed
recovery timings, not a guarantee for every network failure.

The final Stop/Run also passed: owned ports were released, Docker remained,
Run reopened the browser and all dependency health checks passed. The app was
left running; final evidence is `var/showcase-check/final-summary.json`.

Operation, secure transfer and disposable-only test rules remain in
[Local handover](local-handover.md).

# MARKOS implementation progress — 24 September 2026

Owner instruction: implement the remaining mobile and MARKOS work within available access, including an open-source video replacement. Continue directly; raise missing external access without blocking independent work.

## Active order

- [x] Preserve the existing deployed implementation in Git and synchronize `codex/production-mobile` (`065d878`).
- [ ] Replace retiring Sora generation with Apache-2.0 Wan 2.2 through durable hosted GPU jobs, preserving real Arabic/English text rendering. Live activation requires GPU-host credentials.
- [ ] Replace deterministic production embeddings; re-index existing knowledge safely before switching retrieval spaces. Build provider-backed agent contracts and analytics advice after retrieval.
- [ ] Finish native account/data controls, workspace/team and catalog flows; connect supported backend operations with bilingual, recoverable screens.
- [ ] Add remaining knowledge/history, reporting and administration surfaces, with appropriate roles and isolation coverage.
- [ ] Prepare mobile store assets/configuration and repeatable release operations; verify backups, monitoring and the changed production journeys.
- [ ] Complete live Instagram, email and physical-device acceptance where account access allows.

Commercial billing remains a separate activation gate: implement available foundations without enabling simulated payments or reintroducing deferred quotas. Live merchant credentials/certification, final legal wording, Meta review approval, store review, and owner-controlled device actions cannot be claimed complete from code tests.

## External input

This PC has Intel integrated graphics and no suitable NVIDIA GPU. No fal.ai/RunPod/Replicate credential was found in the local configuration or returned AI-service Railway variables. Hosted Wan integration is being prepared; the owner was asked to set `FAL_KEY` in Railway's AI service or identify existing GPU hosting. Never put provider keys in mobile/web code or this document.

## Video implementation

Wan 2.2 A14B is integrated through fal's durable queue, with signed job receipts, portrait normalization, 4/8/12-second outputs and separate English/Arabic text rendering. Eleven provider tests plus eleven existing video/text tests pass; provider typing and lint checks pass. Live generation and visual quality still require `FAL_KEY` and an actual GPU run.

Set `AI_VIDEO_PROVIDER=fal_wan` only with a working server-side `FAL_KEY`. `WAN_VIDEO_ENDPOINT` and `WAN_VIDEO_INFERENCE_STEPS` are configurable. Existing provider receipts retain their original routing across a configuration change. Retain the internal service signing token while Wan jobs are pending. A submission with an unknown outcome is never retried automatically because that could buy another generation.

Choice: [Wan 2.2](https://github.com/Wan-Video/Wan2.2) has Apache-2.0 code/model licensing and supports portrait video. [fal hosting](https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-video/api) is paid GPU infrastructure, not a free local runtime. [OpenAI's retirement notice](https://developers.openai.com/api/docs/deprecations) retires the previous Videos API on 24 September 2026. Wan quality is not yet benchmarked on MARKOS campaigns.

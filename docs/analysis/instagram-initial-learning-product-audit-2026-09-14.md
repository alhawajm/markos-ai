# Instagram initial learning — product audit and immediate decisions

> **Later approved decisions:** The subsequent UI discussion replaces the separate baseline with owner-reviewed additions to Business Profile through guided Instagram onboarding, including inline MFA enrollment and postponement before connection. See [the implementation checkpoint](instagram-initial-learning-implementation-2026-09-14.md). The original audit below records the earlier discussion; that checkpoint governs implementation where they differ.

## Purpose

Deliver a reliable, understandable first Instagram learning experience as soon as possible. After the first successful Instagram connection, MARKOS explores the account, identifies useful patterns, asks the owner to review what it learned, and uses the approved baseline in Campaign and Create.

This plan intentionally assumes the first connection succeeds and remains the active account. Account switching, reconnection, long-term synchronization, deletion handling, and extensive ownership/persistence hardening are deferred.

The experience must still be truthful. MARKOS may describe evidence and propose interpretations, but it must not claim certainty the account does not support or silently rewrite business facts.

## Immediate product contract

`Connect Instagram -> clearly visible exploration -> review the Instagram baseline -> approve -> use it in Campaign and Create`

Initial learning is:

- automatic after the first successful connection;
- a one-time guided experience rather than a recurring background feature;
- based on profile information and up to ten representative posts;
- reviewable and correctable before it affects generation;
- supplementary to the Business Profile;
- focused on how the business presents and markets itself on Instagram.

It is not:

- an Instagram audit score;
- a judgment on whether the business is marketing correctly;
- automatic rewriting of Marketing Strategy;
- a replacement for owner-entered business knowledge;
- continuous Intelligence.

## Immediate decision register

| Area | Decision | Reason |
| --- | --- | --- |
| Trigger | Start automatically after the first successful Instagram connection. | The value of connecting should be immediate and unmistakable. |
| Presentation | Redirect into a dedicated, one-time exploration experience. | A toast or background task would make a major product capability easy to miss. |
| Sample | Use five latest posts and five historically strongest posts, with overlap removed and replacement posts added where possible. | Latest content represents the current direction; strong content provides performance evidence. |
| Maximum | Analyze up to ten unique posts. | This is enough variety for a useful baseline while keeping the first experience understandable and reasonably fast. |
| Ranking | Define strongest primarily by total available interactions: likes, comments, shares, and saves. Treat reach and views as supporting evidence rather than adding unlike measurements into an opaque score. | The selection should be explainable to the owner. |
| Full-history claim | Say “strongest posts found” unless the implementation actually evaluates the full available history. If full-history ranking is expensive or unavailable, rank a bounded historical pool and disclose that boundary. | MARKOS must not label a partial search as “top ever.” |
| Post evidence | Use caption, language, content type, publication time, available metrics, and one representative visual. | This captures both communication and presentation without requiring full media analysis. |
| Carousel/Reel scope | Use the carousel cover and Reel cover in this increment. Do not analyze every slide or full video. | Covers provide useful visual evidence while avoiding a much larger media-processing project. |
| Profile evidence | Use the connected account information actually available to MARKOS, such as username, biography, account/category information, website, and account totals. Missing fields do not block learning. | Profile context helps interpret posts, but availability varies. |
| Review | Require an explicit “Use these learnings” action before inferred preferences affect future generation. | The owner should recognize and correct MARKOS's interpretation. |
| Editing | Allow the owner to remove or revise inferred preferences during review. Do not require editing raw evidence or metrics. | User control belongs at the interpretation layer. |
| Saved result | Keep one current approved Instagram baseline for immediate use. | Multiple versions and account-lifecycle reconciliation are unnecessary for this first pass. |
| Downstream use | Make the approved baseline available to both Campaign and Create. | The feature is only valuable if it changes planning and content assistance consistently. |
| Language | Preserve the languages used by the account as evidence. Present the review UI in the selected MARKOS language without pretending that translated text was originally posted. | Language use is itself an important learned preference. |
| Failure | Show an honest failure with Retry and Continue without learning. | Even a happy-path feature must not trap the user or claim completion after a failed provider call. |

## What MARKOS should examine

### General profile

Use available profile information to establish context, including:

- account identity and biography;
- business/category description where available;
- website or public profile link where available;
- follower/media totals where available;
- the languages and terminology used in the biography.

This information supports interpretation. It does not automatically replace the Business Profile. If Instagram appears to contradict owner-entered information, the initial flow should ignore the conflict rather than trying to resolve it.

### Five latest posts

Use these to understand the business's current public direction:

- current topics and promoted themes;
- current language and writing style;
- current visual presentation;
- recent format mix;
- current CTA, hashtag, and emoji habits.

“Latest” means the latest available published feed media returned for the connected account. Currently available Stories may inform context, but they do not replace one of the five feed-media slots.

### Five strongest posts found

Use these to identify patterns associated with demonstrated performance:

- total available interactions;
- saves and shares when available;
- comments and likes;
- reach and views as supporting context;
- content type, topic, caption style, CTA, and representative visual.

Lifetime totals favor older posts and different formats expose different metrics. MARKOS should therefore say that a pattern “appears to perform well” rather than claiming that it caused the performance. It should compare like with like where practical and show the evidence behind important conclusions.

### Overlap and insufficient data

- If a latest post is also among the strongest, count it once and select the next eligible strong post.
- If the account has fewer than ten posts, analyze everything available.
- If the account has too little usable evidence, produce a smaller baseline with an explicit limitation.
- Do not fill missing evidence with generic industry assumptions.

## What MARKOS should learn

The approved baseline should concentrate on information that can improve planning and creation immediately.

### Content identity

- recurring topics and themes;
- common products, services, experiences, or stories featured in content;
- recurring content pillars that are visible in the sample;
- seasonal or local themes present in the evidence.

Mentions of an offering are observations about content emphasis. They do not create or change an Offering Catalog record.

### Voice and writing

- languages used and how they are combined;
- tone and recurring vocabulary;
- typical caption length and structure;
- CTA patterns;
- hashtag and emoji habits;
- whether captions are educational, promotional, conversational, narrative, or mixed.

### Visual direction

- dominant visual qualities visible in the ten representative covers;
- recurring composition, subject, environment, and presentation choices;
- broad color and lighting tendencies;
- use of product photography, people, text graphics, or process imagery.

These are working visual preferences, not replacements for approved logos, brand colors, fonts, or guidelines.

### Publishing behavior

- observed format mix;
- approximate recent posting cadence;
- recurring publication days/times where the sample supports it.

Ten posts are not enough to claim a universal “best time.” Timing should remain an observation until later performance analysis supports a recommendation.

### Performance signals

- themes or formats present among the strongest posts;
- caption/CTA patterns shared by stronger examples;
- unusually strong saves, shares, comments, reach, or views;
- important differences between recent direction and historically strong content.

Every meaningful performance conclusion should point to the posts and measurements that support it.

## What MARKOS must not infer in this increment

Do not infer or change:

- official business name, location, contact details, story, or establishment stage;
- Offering Catalog descriptions, prices, availability, or product/service identity;
- definitive customer demographics or private audience attributes;
- revenue, conversions, customer satisfaction, or business growth from Instagram engagement;
- competitor information;
- causal claims such as “this color caused more sales”;
- weaknesses or strategy changes that are not supported by the selected evidence.

MARKOS may notice these subjects, but the initial baseline must stay within observable content, communication, presentation, publishing behavior, and performance signals.

## First-connection experience

### 1. Connection completion

After OAuth succeeds, do not return to an ordinary Settings page with only “Connected.” Open a dedicated Instagram exploration experience tied to the connected username.

Suggested heading:

> Let MARKOS learn from @username

Supporting text should explain that MARKOS will review the profile, recent posts, and strongest content to prepare a starting point for future Campaigns and content.

### 2. Honest progress

Use a small set of real stages rather than a fake percentage:

1. Reading your profile
2. Finding your latest posts
3. Finding your strongest posts
4. Looking for patterns
5. Preparing your Instagram baseline

Completed stages should remain visible. Where useful, show real counts such as “8 unique posts selected.” Do not use conversational filler to conceal a slow request.

The page should explain that the owner can review everything before MARKOS uses it.

### 3. Review

Present one concise review page with progressive disclosure. Recommended hierarchy:

1. **How your brand communicates** — language, tone, caption, CTA, and hashtag patterns.
2. **What you usually share** — themes, content pillars, format mix, and visual tendencies.
3. **What appears to resonate** — evidence-backed performance observations and their supporting posts.
4. **What MARKOS will carry forward** — the editable preferences that will guide Campaign and Create.

Show the selected latest/strong posts as supporting evidence rather than making the user review ten full analytics reports. Important conclusions should reveal their source posts on request.

Primary action:

> Use these learnings

Secondary actions:

- Edit learnings
- Continue without learning

The experience does not need granular approval of every metric. The owner edits the conclusions that will influence future work and then approves the baseline as one coherent set.

### 4. Completion

After approval, clearly state:

- the Instagram baseline was saved;
- MARKOS will use it in future Campaign and Create work;
- Business Profile information was not replaced;
- the user can continue to Campaigns.

The first useful next action should be **Create a Campaign**, because it provides the clearest demonstration that MARKOS understood the connected account.

## How the baseline should affect MARKOS immediately

### Campaign

Campaign planning should use the approved baseline to:

- preserve recognizable voice and content identity;
- build on themes that appear to resonate;
- balance proven formats with the user's explicit Campaign objective;
- avoid generic recommendations that ignore the account's current practice.

The baseline is supporting context. Current owner-entered Marketing Strategy and the explicit Campaign objective still govern the plan.

### Create

The Create assistant and caption/media-direction generation should use it to:

- write in the observed and approved style;
- respect language patterns;
- use familiar CTA and hashtag conventions where appropriate;
- propose visuals consistent with the approved Instagram direction;
- understand whether the requested post intentionally departs from past patterns.

An explicit instruction in Create always takes priority over the learned baseline.

### Business Profile

Do not automatically copy the baseline into ordinary Business Profile fields. Marketing Strategy may later display evidence-backed recommendations derived from it, but that recommendation workflow remains deferred.

## Immediate happy-path acceptance criteria

The first increment is successful when:

1. A first successful Instagram connection visibly begins exploration.
2. The user understands what MARKOS is examining and that review comes before use.
3. MARKOS considers the profile, up to five latest posts, and up to five unique strongest posts.
4. The result distinguishes observation, performance evidence, and inferred preferences.
5. The owner can correct the preferences and explicitly approve or continue without them.
6. Approval produces one current Instagram baseline without changing canonical business facts.
7. A subsequent Campaign receives and uses that baseline alongside Marketing Strategy and its explicit objective.
8. Create receives the same approved baseline for conversation, caption, Reel direction, and image direction.
9. A provider failure produces a truthful Retry/Continue choice rather than a false success.
10. English and Arabic UI preserve the meaning of source-language observations.

For the first established-business test, the owner should be able to recognize the account in the resulting baseline and identify at least one visible way it affected a newly generated Campaign and a Create request.

## Major deferred points

### Account and data lifecycle

- connecting a different Instagram account;
- disconnecting and reconnecting the same account;
- deciding what to retain or deactivate after disconnect;
- changes or deletions on Instagram after the first scan;
- multiple Instagram accounts per workspace;
- full account-source isolation and historical reconciliation;
- multiple baseline versions, restoration, and comparison.

### Continuous Intelligence

- scheduled re-learning;
- learning from every newly published post;
- high/low performer benchmarks;
- learning from Campaign results;
- learning from user edits, approvals, rejections, and regeneration behavior;
- recommendation frequency based on establishment stage;
- autonomous or proactive Marketing Strategy recommendations;
- feedback from Insights into active Campaign changes.

### Deeper Instagram understanding

- analysis of every historical post;
- full carousel-slide analysis;
- Reel video/audio/transcript analysis;
- Story-history analysis beyond what is currently available;
- audience-demographic learning;
- comment sentiment or customer-intent analysis;
- competitor/account discovery;
- statistically normalized cross-format performance scoring;
- seasonality and long-term trend analysis.

### Hardening and operations

- durable multi-stage recovery and resumability;
- account-change supersession rules;
- extensive concurrency and duplicate-run protection;
- retention, deletion, export, and provenance-history UX;
- provider cost optimization and quotas;
- model evaluation, confidence calibration, and prompt A/B testing;
- a generalized recommendation or knowledge-graph architecture.

These points remain important. Deferring them is a delivery decision for the initial established-business test, not a decision that they are unnecessary.

## Recommended delivery order

1. Confirm the exact profile fields and efficient strongest-post ranking available through the current Instagram permission/API contract.
2. Implement the one-time exploration request and structured learning result.
3. Implement the dedicated progress and review experience.
4. Save one approved Instagram baseline.
5. Supply that baseline consistently to Campaign and Create.
6. Run focused automated checks, then perform one controlled read-only test with the established business account.

Do not begin continuous learning or account-lifecycle hardening until this first journey produces a recognizable, useful baseline and demonstrably improves Campaign and Create output.

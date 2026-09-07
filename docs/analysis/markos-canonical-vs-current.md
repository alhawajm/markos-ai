# MarkOS AI Canonical Product Comparison Audit

**Audit date:** 3 September 2026\
**Canonical baseline:** `D:\Ra'edat\markos-ai-v0.2\docs\source`\
**Current source snapshot:** `feat/phase-2-ui-workflows` at `502bdbcd3b20aa0f61fe8fdfc0ee691f3f706f43`\
**Live product observed:** staging, English and Arabic authenticated routes, 3 September 2026\
**Scope:** product concept, experience, journeys, pages, workflows, user control, and AI-output movement. Backend design, infrastructure, providers, model choices, code quality, estimates, and minor visual-token differences are excluded.

## 1. Executive summary

The current MarkOS is recognizably descended from the canonical concept, but it is not yet the same product in breadth or in the completeness of its operating loop.

The canonical concept is a **full-stack AI marketing operating system** intended to replace or simulate an SMB marketing function: it learns a business deeply, stores durable knowledge, creates a long-range strategy, turns that strategy into a monthly content plan, helps produce and approve content, schedules and publishes it, reads performance, and carries the learning into the next cycle. The Knowledge Vault and the closed feedback loop are its defining product ideas—not merely supporting features. [C-PRD §2–§4, pp. 3–12; C-PLAN §1.1, “Guiding Principles”]

The current product has evolved into a clearer, more execution-oriented **Instagram marketing workspace** organized around Business Profile → time-bound Campaign → Create → Calendar → Insights. It is more explicit than the canonical concept about user approval and record identity. A Campaign idea becomes one dated draft only after the user approves it; Create never requires AI; generated copy and visual direction remain editable; image generation requires a separate action; Ready and Scheduled are distinct states; and Calendar opens the same content record rather than creating duplicates. These are meaningful improvements in control and workflow integrity. [N-FLOW “The MARKOS mental model”, “Flow B”, “Flow C”, and “Flow E”; L-STAGE `/en/app/campaigns`, `/en/app/content-studio`, and `/en/app/calendar`, populated workspace]

The largest gap is that the current product does not yet complete the canonical learning loop. Insights reports available metrics honestly, but it does not visibly interpret them, recommend the next action, converse as a consultant, generate a weekly digest, or write accepted learning back into Business Profile. Business Profile itself is currently a seven-section readiness summary whose editing route reuses onboarding; it is not yet the rich, versioned, continuously learned Knowledge Vault described canonically. As a result, the current experience closes the **planning-to-scheduling loop**, but not the **performance-to-improvement loop**. [C-PRD §4.8–§4.9, pp. 12–13; C-PLAN §1.1 and §4.1; L-STAGE `/en/app/analytics` and `/en/app/knowledge`]

Campaigns are the most important conceptual evolution. Canonically, “Strategy” is a 30/60/90-day roadmap and campaigns are frameworks or optional links within it. Currently, durable marketing strategy is intended to live in Business Profile, while the primary planning object is a short, executable Campaign with objective, start date, duration, intensity, weeks, and dated content ideas. This is a coherent and likely intentional evolution, not simply a naming defect. It is nevertheless incomplete because the durable strategy layer is not visible in Business Profile and the current Campaign generator exposes only 3-, 7-, and 14-day plans at 1–3 ideas per day; 30/60/90-day options are visible but unavailable. [C-PRD §4.3–§4.4, pp. 10–11; N-DEC “Strategy is durable business knowledge; Campaigns are time-bound”; L-STAGE `/en/app/campaigns`, empty and generated states]

First-time onboarding has also evolved productively. The canonical seven-module interview remains, but the current flow permits completion with two essentials, adds a full-document route using up to five business files, keeps a focused offering-document shortcut inside step 2, generates a bilingual profile, and requires the owner to review both wording and extracted information before approval. This reduces hostage-taking and strengthens control. It also reduces canonical depth: competitors, audience, brand, tone, and goals can all be skipped, brand assets/fonts/guideline uploads are not represented as a complete brand system, and no plan-selection step follows verification. [C-PRD §4.1, pp. 9–10; N-FLOW “Flow A”; L-STAGE `/en/onboarding`, first-run manual and generated-profile states]

The current information architecture is much smaller and easier to scan: Overview, Campaigns, Create, Calendar, Insights, Business Profile, and Settings. The tradeoff is that canonical destinations such as Strategy, Media Library, Scheduling Queue, AI Consultant/Chat, Reports, Team, and Admin are either folded into another page, only partially exposed, or absent as navigable products. [C-PRD §11, pp. 28–31; S-CURRENT `apps/web/app/[locale]/_components/app-shell.tsx`; L-STAGE authenticated sidebar]

### Overall judgment

| Area | Classification | Judgment |
|---|---|---|
| Core ambition | **Partially matched** | The “AI marketing team” concept remains visible, but the current product is primarily an assisted planning-and-production workspace rather than a completed autonomous operating system. |
| Business understanding | **Partially matched** | Seven sections and grounded generation exist; the continuously learned, versioned Vault is substantially weakened in the visible product. |
| Campaign-to-content execution | **Matched / evolved** | The current handoff is more explicit, idempotent, and user-controlled than the canonical description. |
| Content creation | **Partially matched** | Copy, revision, visual direction, image generation, manual editing, preview, and approval exist; full multi-format production and advanced editing do not. |
| Calendar and scheduling | **Partially matched** | Dated drafts, week/month views, Ready/Scheduled separation, unscheduled content, and scheduling exist; best-time, drag/drop monthly planning, bulk operations, and proven direct publishing are not current user experiences. |
| Insights and improvement | **Partially matched** | Honest aggregate reporting exists; AI interpretation, consulting, recommendations, and learning-back are missing. |
| User control | **Matched / strengthened** | Approval boundaries are unusually clear and are one of the current product’s strongest evolutions. |
| End-to-end closed loop | **Missing** | The loop stops at reporting; it does not visibly convert performance into approved memory and the next Campaign. |

## 2. Methodology and evidence reviewed

### 2.1 Classification legend

- **Matched** — current behavior substantially follows the canonical concept.
- **Partially matched** — the core idea exists, but important stages or details differ.
- **Missing** — the canonical feature or journey is absent from the current product.
- **Diverged** — both versions address the area but follow meaningfully different concepts.
- **Current-only** — the current product includes something not defined in the canonical documents.
- **Unclear** — available documentation or observed behavior is insufficient to confirm.

Every interpretation is additionally described as likely intentional evolution, simplification, unfinished implementation, disconnected experience, possible conceptual regression, or indeterminate.

### 2.2 Canonical evidence inventory

All three files in the canonical source folder were inventoried and read in full. Product conclusions were not drawn from the PRD alone.

| Evidence ID | Source | Canonical role in this audit | Most relevant areas |
|---|---|---|---|
| **C-PRD** | `MARKOS_AI_PRD_v1.0.pdf` (40 pages) | Primary product requirements and screen/journey baseline | Vision and personas (§2–§3, pp. 3–8); product requirements (§4, pp. 9–14); data relationships (§7, pp. 18–23); flows (§10, pp. 26–27); screen inventory (§11, pp. 28–31); roadmap and full loop (§16–§17, pp. 35–40). |
| **C-PLAN** | `MARKOS_AI_Implementation_Plan.docx` | Human-facing delivery blueprint that clarifies product priorities and completion gates | “Ship the loop, not the features” and “Knowledge Vault is the spine” (§1.1); Vault/agent behavior (§4); phased experience gates (§7); launch proof (§8). Page numbers are not stable in the source DOCX, so section headings are cited. |
| **C-COST** | `MARKOS_AI_Cost_Model.docx` | Commercial and market assumptions that clarify target users, Bahrain context, plans, and “unlimited” limits | AI actions and plans (§3); Bahrain market, BHD, local payment expectations, and Arabic/local adjustments (§6); full cost/product-plan picture (§7). Technical cost calculations are outside the audit scope. |

### 2.3 Current-product evidence inventory

| Evidence ID | Source | Use |
|---|---|---|
| **N-FLOW** | `docs/source/MARKOS_EXPERIENCE_FLOWS.md` | Active behavioral model, terminology, state transitions, approval boundaries, and current/deferred overlays. |
| **N-SPEC** | `docs/source/MARKOS_BUILD_SPEC. 2.pdf` | Current structural target and retained full-product ambition. |
| **N-STATUS** | `docs/project-status.md` | Status overlay and evidence cautions; treated as dated rather than automatically current. |
| **N-DEC** | `docs/decisions.md` | Accepted product decisions, especially Strategy→Campaign, onboarding documents, content identity, and Calendar semantics. |
| **N-UI** | `docs/ui-design-foundation.md`, `docs/ui-ux-workflow.md`, and `docs/ui-ux-improvement-plan.md` | Current interaction principles and intended Sunlit product hierarchy. |
| **S-CURRENT** | Current mounted web source | Used only to confirm the existence, route, state, or user-facing transition of a feature. Principal files: `app-shell.tsx`, `marketing-landing.tsx`, `auth-page.tsx`, `onboarding-panel.tsx`, `campaign-panel.tsx`, `final-command-panels.tsx`, `content-studio-assistant.tsx`, `content-studio-composer.tsx`, `calendar-panel.tsx`, and `settings-panel.tsx`. |
| **L-STAGE** | `https://web-staging-63e6.up.railway.app` | Browser-visible verification in a disposable account/workspace. Public landing, signup, login, verification boundary, onboarding, Campaigns, Create, Calendar, Insights, Business Profile, Settings, English→Arabic route switch, and RTL direction were observed. |

### 2.4 Live evidence states created or observed

- Public visitor: landing, signup, login, verification instructions, and static auth previews.
- Fresh/near-empty workspace: Overview, onboarding greeting, full manual seven-step flow, information check, AI-generated bilingual profile review, empty Campaign state, empty Insights, Business Profile readiness, and disconnected Settings.
- Generated Campaign: one provider-generated 3-day Campaign at 1 idea/day.
- Approved Campaign idea: the first idea was tick-approved into a dated Draft; page refresh confirmed the approval persisted and transformed into “Open draft in Create.”
- Campaign-linked Create record: generated bilingual caption/CTA/hashtags, continued into manual editing, and remained the same content record.
- Standalone Create record: AI assistant generated editable caption and visual direction; explicit insertion populated Caption and the image prompt; a separate explicit Generate action created and attached media; the user then marked the record Ready and scheduled it.
- Calendar: showed the Campaign-linked planned Draft, the scheduled standalone post, and a separate manually saved unscheduled Draft; the Unscheduled drawer reopened the same record in Create.
- Arabic route: shell direction was confirmed as RTL; several record-state labels remained English.

### 2.5 Evidence limits

- Full-document onboarding was inspected in source and its upload screen was observed live, but no business document was uploaded during this audit. Extraction quality and document-derived approval were therefore not re-proven live.
- The test workspace had no connected Instagram account or synced analytics. Live publishing and populated Insights drilldowns could not be confirmed. Settings visibly reported Instagram as disconnected and publishing mode as “Dry run.”
- Verification was completed by the user in a separate browser/account path. Logging in then landed on Overview with 0% profile readiness; because the account’s prior state was not fully controlled, the automatic post-verification destination is **Unclear**, not treated as a confirmed routing defect.
- Mobile layouts were not exhaustively audited. English desktop and a live Arabic/RTL route switch were confirmed.
- The current source branch and staging appeared behaviorally aligned in the audited areas, but this audit does not assert deployment identity beyond observed behavior.

## 3. Canonical MarkOS AI concept

### 3.1 Problem and value proposition

Canonical MarkOS was designed for small businesses that need the capabilities of a marketing agency but lack the time, expertise, or budget to hire one. Its value proposition was not “generate social posts.” It was “run the marketing function”: understand the business, choose a direction, create the work, publish it, measure it, and improve the next cycle. [C-PRD §2.1–§2.4, pp. 3–6]

The intended product identity combined eight roles: marketing manager, strategist, content creator, image creator, scheduler, analyst, growth consultant, and related supporting intelligence. The system was meant to be available continuously, grounded in business-specific knowledge, and able to make enterprise-style marketing accessible to entrepreneurs and SMEs. [C-PRD §2.2–§2.4, pp. 4–6; C-PRD §8.2, pp. 21–22]

### 3.2 Intended users

The four named canonical personas cover distinct but overlapping needs: a time-poor solopreneur, an early-stage startup founder, a retail/ecommerce operator, and an agency/consultant managing multiple brands. All want professional output without maintaining an internal marketing team; they differ in sophistication, volume, collaboration, and the extent to which they want MARKOS to take over. [C-PRD §3, pp. 7–8]

The current Bahrain-focused commercial assumptions further imply BHD pricing, Arabic/local sensitivity, and local payment expectations. These are market adaptations, not a change to the core “SMB marketing function” user. [C-COST §6, “The Bahrain Market — Local Adjustments”]

### 3.3 Central canonical principles

1. **Ship the loop, not isolated features.** A feature is valuable when it advances onboarding → Vault → strategy → content → publishing → analytics → learning. [C-PLAN §1.1]
2. **The Knowledge Vault is the spine.** Every agent retrieves business context; user edits, AI outputs, interaction history, and performance learning return to the Vault. [C-PLAN §1.1 and §4.1; C-PRD §4.2 and §8, pp. 10, 21–23]
3. **AI is an integrated team, not a single chat box.** Different specialist roles operate at planning, production, scheduling, analysis, and consulting stages. [C-PRD §8.2, pp. 21–22]
4. **Approval precedes scheduling/publishing.** AI may propose or produce work, but the user reviews, edits, approves, and chooses when it goes live. [C-PRD §4.6–§4.7, pp. 11–12; §10.2, p. 27]
5. **Instagram is the complete v1 loop.** Other platforms are future expansion; Instagram should be deep rather than superficially multi-channel. [C-PRD §1 and §17, pp. 2, 35–36]
6. **Learning is continuous.** Performance and accepted edits should change later strategy, content, and advice. [C-PRD §4.8–§4.9 and §8.4, pp. 12–13, 23]

### 3.4 Intended end-to-end journey

The canonical journey begins with signup and email verification, continues through plan selection and seven onboarding modules, generates an initial strategy, and lands on a dashboard with strategy, a calendar starting point, and first suggestions. From there the user can create from an empty Calendar slot or a New Content action; AI produces caption, hashtags, CTA, and optionally media; the user accepts, regenerates, or edits; approves; schedules; and eventually sees published performance. Insights and a proactive consultant turn that performance into recommendations, chat, reports, and the next plan. [C-PRD §10.1–§10.3, pp. 26–27]

### 3.5 Canonical relationship among the five central product areas

| Area | Canonical responsibility | Relationship to the loop |
|---|---|---|
| **Knowledge Vault / Business Profile** | Persistent structured business truth, brand context, history, edits, AI outputs, and learned performance. | Grounds every agent and receives new learning. |
| **Strategy** | 30/60/90-day direction, pillars, objectives, campaign frameworks, and roadmap. | Converts business knowledge into marketing direction. |
| **Content Calendar** | Monthly plan mapped to pillars, objectives, and campaigns; detects gaps and supports drag/drop. | Converts direction into a timed publishing plan. |
| **Content Studio / Create** | Generates and edits captions, hashtags, CTAs, carousel structures, Reel scripts, Stories, and media. | Converts plan slots into publishable assets. |
| **Analytics + AI Consultant** | Reports performance, explains why, recommends changes, chats, and issues weekly/monthly guidance. | Converts results into learning and the next strategy/content cycle. |

[C-PRD §4.2–§4.9, pp. 10–13; §11, pp. 28–30]

## 4. Current MarkOS AI concept

### 4.1 What the product communicates today

The public product positions MARKOS as flexible Instagram marketing help for Bahrain businesses: it can assist with one task or stay involved across planning, content, publishing, and insights. The public sequence is “Add your business → Review the plan → Approve the work → Use the insights,” with repeated emphasis that the user decides what goes live. This is narrower and more collaborative in tone than the canonical promise to replace the entire marketing function. [L-STAGE `/en`, public visitor]

### 4.2 Current operating model

The active behavioral model is:

> Onboarding → Business Profile → Campaigns → Create → Calendar → Insights

Durable marketing strategy is intended to live in Business Profile; Campaigns are time-bound executable plans; individual ideas become dated Draft records only after approval; Create owns production and record state; Calendar owns temporal visibility and scheduling; Insights reports results. [N-FLOW “The MARKOS mental model”; N-DEC Strategy/Campaign and content-identity decisions]

### 4.3 Current strengths

- The main navigation is compact and describes user goals rather than internal agent roles.
- Manual creation is a first-class path; AI assists instead of gating the studio.
- Content identity survives Campaign → Create → Calendar transitions.
- Approval is staged: extracted profile proposal, approved Campaign idea, inserted AI direction, Ready, and Scheduled are separate decisions.
- First-time onboarding can start from documents or step-by-step entry and does not require all seven sections.
- English/Arabic routes and RTL exist throughout the shell, and profile output is bilingual.
- Empty and unavailable analytics use dashes and explanatory copy rather than fabricated metrics.

[L-STAGE authenticated routes; S-CURRENT principal mounted components]

### 4.4 Current conceptual limits

- Business Profile is not yet the durable strategy-and-learning surface the revised model requires.
- Campaigns are executable but short-horizon; long-range strategy is neither a visible standalone page nor visible inside Business Profile.
- Insights does not visibly produce next actions or accepted memory.
- The current product exposes content-type choices broader than the proven production pipeline; live media input remained JPEG-centric.
- Direct publishing was not reachable in the audited staging state, and the connected-account panel visibly reported “Dry run.”
- Canonical consultant, reports hub, media library, scheduling queue, team, and admin experiences are absent or reduced.

## 5. High-level product-concept comparison

| Dimension | Canonical concept | Current product | Status | Interpretation |
|---|---|---|---|---|
| Core value proposition | Replace/simulate the full SMB marketing function. | Provide flexible Instagram marketing help across Campaigns, Create, scheduling, and Insights. | **Partially matched** | Likely intentional simplification in positioning; current product is more credible but less transformative. |
| Primary user | Entrepreneurs, solopreneurs, startups, SMEs, retailers, and agencies. | Public copy emphasizes Bahrain businesses; flows suit owners/operators creating Instagram content. | **Partially matched** | Bahrain-first narrowing is intentional; agency/multi-brand depth is not visible. |
| Primary problem | Lack of affordable strategy, production, publishing, analysis, and continuous expertise. | Difficulty turning business context into controlled Instagram Campaigns and content. | **Partially matched** | The current product solves a valuable slice, not the full canonical function. |
| Role of strategy | Explicit 30/60/90-day Strategy hub and roadmap. | Durable strategy is conceptually moved into Business Profile but not visibly represented there. | **Diverged** | Coherent product evolution, unfinished in the current UI. |
| Role of campaigns | Frameworks and optional associations inside strategy/content. | Primary executable planning object with dates, duration, intensity, weeks, and content ideas. | **Diverged** | Strong likely intentional evolution. |
| Role of Create | Production editor launched from calendar/new content, with AI-generated assets and user editing. | First-class manual/AI studio; Campaign handoff, assistant, preview, media, Ready, and scheduling. | **Matched / evolved** | Current control and continuity are stronger. |
| Role of AI | Eight integrated specialist agents across the full loop. | Provider-backed assistance is visible mainly in onboarding, Campaign planning, copy/revision, and media generation. | **Partially matched** | Production-facing AI is real; analyst/consultant/learning roles are absent. |
| Automation philosophy | Significant end-to-end automation with approval before scheduling. | Explicitly assisted workflow with granular approvals before each consequential transition. | **Diverged** | Intentional shift toward collaboration and trust. |
| Business memory | Permanent, versioned Vault updated by onboarding, interaction, edits, and performance. | Seven-section Business Profile grounds work; visible page shows completeness and dates, not knowledge/version/learning detail. | **Partially matched** | Possible conceptual regression until the new durable strategy/memory surface exists. |
| Closed-loop learning | Core differentiator and launch requirement. | Analytics is a reporting destination; no visible route back into memory or the next Campaign. | **Missing** | Unfinished implementation with high conceptual impact. |
| Channel scope | Instagram-only v1. | Instagram-only current product. | **Matched** | Scope discipline is preserved. |
| User authority | Edit/approve before scheduling; autonomy settings anticipated. | Extraction, generation, replacement, readiness, scheduling, and publishing are kept separate. | **Matched / strengthened** | One of the clearest current improvements. |

## 6. End-to-end journey comparison

### 6.1 Canonical journey

1. Public marketing → signup → verification → plan selection.
2. Seven-module onboarding creates the Knowledge Vault and a completeness score.
3. AI automatically creates the initial 30/60/90-day Strategy.
4. Dashboard exposes strategy, monthly Calendar starting point, and suggestions.
5. Calendar slot or New Content launches content generation.
6. AI generates copy and optionally media; user accepts/regenerates/edits.
7. User previews, approves, schedules, and publishes to Instagram.
8. Analytics synchronizes account/content/audience performance.
9. AI Consultant explains performance and recommends changes.
10. Accepted learning and interaction history update the Vault and influence the next cycle.

[C-PRD §10, pp. 26–27; C-PLAN §1.1]

### 6.2 Current observed journey

1. Public landing → signup → verification → login. No plan-selection step was observed.
2. Minimal greeting offers **Use business documents** or **Enter details myself**.
3. Manual path uses seven sections but requires only Company and Products/Services; optional sections can be skipped.
4. Information check confirms readiness; AI generates an editable bilingual profile; approval routes directly to Campaigns.
5. Campaign composer asks for objective, start date, short duration, and intensity; AI creates a week-layered plan.
6. A tick on an idea registers one dated Draft without navigation. The tick persists and becomes an “Open draft in Create” control.
7. Create receives the same Draft and its Campaign context. The user may generate a complete bilingual draft, revise it, or continue manually.
8. The standalone AI assistant produces caption and visual direction. Both are editable and require explicit insertion. Media generation is a second explicit action.
9. The user saves, marks Ready, then schedules. Ready locks editing until intentionally reopened.
10. Calendar shows planned, unscheduled, Ready, Scheduled, Published, and attention states; records reopen in Create.
11. Insights reports available performance, trends, comparisons, content types, and top posts. In the empty state it explains what is unavailable.
12. No observed step turns Insights into recommendations, approved learning, a profile update, or the next Campaign.

[L-STAGE first-run and populated workspace]

### 6.3 Journey-level differences

| Difference | Status | Assessment |
|---|---|---|
| Plan selection between verification and onboarding is absent. | **Missing** | Simplification or unfinished monetization journey. |
| Initial output is now an approved bilingual Business Profile before Campaign creation, not an automatic Strategy immediately after onboarding. | **Diverged** | Likely intentional evolution that improves identity review. |
| Campaign is now the main planning bridge between Profile and Create. | **Current-only / evolved** | Stronger executable handoff than the canonical loose campaign relationship. |
| Calendar is no longer necessarily the first content-planning entry; Campaign ideas can create dated records directly. | **Diverged** | Intentional reordering that improves planning continuity but weakens Calendar-as-monthly-plan. |
| AI assistance is optional inside Create, not the default gate to the editor. | **Diverged** | Positive intentional evolution in user control. |
| Content uses persistent lifecycle states and a single record across pages. | **Matched / strengthened** | Current implementation makes the canonical status model tangible. |
| Analytics does not complete the improvement loop. | **Missing** | Core unfinished canonical promise. |

## 7. Pipeline-by-pipeline comparison

### 7.1 Public entry, signup, verification, and login

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Marketing site leads to signup; users create an account, verify email, and select a plan. | Landing offers Start free and Log in. Signup uses email/password/legal consent; Google and Apple choices are visible. |
| Required inputs | Account details, consent, verification, and plan. | Name, email, password of at least 12 characters, and legal consent; email verification before normal use. |
| Main steps | Signup → verify → plan → onboarding. | Signup → check-email page with resend/change-email/login recovery → login → app/onboarding according to account state. |
| AI involvement | None. | None. Static Calendar and Insights previews are decorative and clearly sample data. |
| User decisions | Plan and account choices. | Language, email versus visible third-party choices, consent, and verification recovery. |
| Output | Verified subscribed/trial user ready for onboarding. | Verified workspace owner with a Starter/Trial billing summary. |
| Approval point | Terms/privacy and verification. | Terms/privacy checkbox and email verification. |
| Destination | Onboarding overview. | Intended onboarding/app routing; exact first post-verification routing remained **Unclear** in this audit because verification occurred outside the controlled browser state. |
| Status | — | **Partially matched** |
| Assessment | — | Verification recovery is stronger than the canonical screen summary. Plan selection is absent. Third-party choices were present but were not tested as functional authentication paths. The landing links to Plans, FAQs, and Contact, but the current route tree contains no dedicated pages; `/en/plans` redirected an authenticated user to Overview. This is unfinished public information architecture. |

Evidence: [C-PRD §10.1 and §11.1–§11.2, pp. 26, 28; L-STAGE `/en`, `/en/signup`, `/en/login`, `/en/verify`; S-CURRENT `auth-page.tsx` and `app/[locale]/[section]/page.tsx`]

### 7.2 First-time onboarding: manual path

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Onboarding overview after verification/plan selection. | Minimal greeting at `/en/onboarding`; “Enter details myself” begins the manual path. |
| Required inputs | Seven substantive modules, with skip-and-return support. | Only Company and Products/Services are essential; five other sections can be skipped. |
| Main steps | Company → story → products/pricing → audience → competitors → brand assets/identity → tone → objectives/KPIs. | Business basics → offerings table → story/differentiation → customers → market context → tone/colors → current priority → information check. It remains seven screens by combining/reframing canonical topics. |
| AI involvement | The Vault later grounds automatic profile/strategy generation. | “Why this helps” explains downstream grounding; no AI writes while the user is filling manual steps. |
| User decisions | Answer, skip, return, and improve completeness. | Save, skip, back, choose suggested tone/priority, add explicit colors, and review readiness. |
| Output | Structured Vault with a completeness score. | Seven-section onboarding draft and two-essential readiness. |
| Approval point | Completion before initial Strategy generation. | Information-check page labels each section Ready/Not added and links directly back to edit it. |
| Destination | AI initial Strategy loading. | AI-generated bilingual Business Profile review. |
| Status | — | **Partially matched** |
| Assessment | — | The current path is more forgiving and likely intentionally simplified. It weakens canonical depth: competitor evidence, objectives/KPIs, brand fonts/guidelines/assets, and audience detail are optional or reduced. |

Evidence: [C-PRD §4.1, pp. 9–10; N-FLOW “Flow A — Signup → verification → onboarding → Vault → Campaign”; L-STAGE `/en/onboarding`, steps 1–7 and Information check]

### 7.3 First-time onboarding: full-document path

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Canonical onboarding is interview/module-led; document upload appears specifically within brand identity and media-related requirements. | Greeting makes “Use business documents” an equal top-level path. |
| Required inputs | Manual module answers plus optional brand files. | One to five PDF, Word, TXT, PNG, JPG, or WebP files. |
| Main steps | Upload relevant assets inside modules → continue structured interview. | Choose files → inspect selected list → explicitly Analyze → review extracted module values and issues → approve analysis → review/generate profile. |
| AI involvement | Business context is parsed/embedded into the Vault; no Pomelli-style whole-onboarding document analyst is specified. | A focused document analyst fills as many of the same seven onboarding sections as evidence supports, including native visual/document input. |
| User decisions | Upload and complete/correct the module. | Add/remove files before submission, analyze, edit extracted values, retry/discard on failure, or switch to manual. |
| Output | Vault content and brand assets. | A proposed onboarding draft plus explicit extraction issues; temporary source files are not treated as permanent business assets. |
| Approval point | General onboarding completion. | Owner approval of the extracted proposal before anything becomes approved business knowledge. |
| Destination | Initial Strategy. | Bilingual Business Profile review, then Campaigns after profile approval. |
| Status | — | **Current-only** |
| Assessment | — | This is a substantial intentional evolution that better serves owners who already have business documents. Live upload/extraction quality was not re-tested; the screen and source workflow were confirmed. |

Evidence: [C-PRD §4.1 and §4.10, pp. 9–10, 13; N-DEC 1 September 2026 onboarding-document decision; N-FLOW “Document-assisted path”; L-STAGE `/en/onboarding`, business-files screen; S-CURRENT `onboarding-panel.tsx`]

### 7.4 Offering-specific document assistance

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Products/pricing onboarding module. | A separate “Already have a product list?” panel inside onboarding step 2. |
| Required inputs | Products, services, prices, categories; canonical input method is not limited to documents. | One or two PDF, Word, or TXT files, or manual offering rows. |
| Main steps | Enter products/pricing/categories. | Upload → analyze → review structured offering rows/issues → use or discard; manual table remains available. |
| AI involvement | General onboarding/Vault processing. | Focused extraction optimized by the structured table. |
| User decisions | Enter/confirm business offers. | Keep, edit, discard, retry, or continue manually. |
| Output | Product/service knowledge. | Structured rows with type, name, short description, and BHD price; blank rows are not meaningful content. |
| Approval point | Onboarding module save. | Explicit “use” action after analysis, then normal step save. |
| Destination | Next onboarding module. | Story/differentiation step. |
| Status | — | **Matched / evolved** |
| Assessment | — | Current UI makes the canonical product/pricing requirement more precise and reviewable. |

Evidence: [C-PRD §4.1, p. 9; N-DEC 31 August 2026 offering-catalog decisions; L-STAGE `/en/onboarding`, step 2; S-CURRENT `onboarding-panel.tsx`]

### 7.5 Business-profile generation and approval

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Completion of seven onboarding modules. | Information check after the two essentials or any additional sections. |
| Required inputs | Deep onboarding context. | Available onboarding context; missing optional facts are allowed. |
| Main steps | Persist Vault → automatically create initial Strategy. | Generate bilingual wording → review grouped profile → expand/edit fields → inspect English and Arabic → regenerate or approve. |
| AI involvement | AI builds strategy from Vault; a separate canonical generated “business profile wording” approval page is not explicit. | AI resolves raw answers into a bilingual working profile. |
| User decisions | Review initial strategy later. | Edit any generated field, regenerate wording, go back to information check, approve profile. |
| Output | Knowledge Vault plus initial Strategy. | Approved bilingual profile used as working memory. |
| Approval point | Onboarding completion/strategy review. | “Approve profile & continue.” |
| Destination | Dashboard with Strategy. | Campaigns. |
| Status | — | **Current-only / evolved** |
| Assessment | — | This is a valuable trust layer. One live result changed the entered BHD price into a materially different value in generated wording, demonstrating why the explicit review is necessary; this single observation should not be generalized into an overall quality judgment. |

Evidence: [C-PRD §10.1, p. 26; N-FLOW “Profile resolution and approval”; L-STAGE `/en/onboarding`, generated profile state]

### 7.6 Ongoing Business Profile / Knowledge Vault editing

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Dedicated Knowledge Vault editor from primary navigation. | Business Profile page; “Review and edit profile” opens `/en/onboarding?mode=edit`. |
| Required inputs | Structured facts, documents, edits, interaction history, and performance learning. | Seven onboarding sections and the previously approved profile. |
| Main steps | View/edit any knowledge, inspect gaps and versions, append learning. | View completeness and last-updated status → reuse onboarding information check/steps → Save changes. No new AI profile generation in edit mode. |
| AI involvement | Every agent retrieves Vault context; AI output, edits, feedback, and performance update it. | Profile grounds Campaign/Create. No visible learning ingestion, history, or strategy editor. |
| User decisions | Edit facts, manage knowledge, review versions/gaps. | Edit sections or leave them incomplete; save. |
| Output | Continuously evolving, versioned business memory. | Updated section records and future grounding. Existing saved work remains unchanged. |
| Approval point | Save/version actions; accepted learning. | Save changes. |
| Destination | Any future agent/workflow. | Business Profile/other workspace pages. |
| Status | — | **Partially matched** |
| Assessment | — | The structural spine exists but the visible product is far shallower. This is both unfinished and a possible conceptual regression because revised Campaign semantics assume durable strategy lives here. |

Evidence: [C-PRD §4.2 and §8.1–§8.4, pp. 10, 21–23; C-PLAN §1.1 and §4.1; L-STAGE `/en/app/knowledge` and `/en/onboarding?mode=edit`; S-CURRENT `FinalVaultPanel`]

### 7.7 Campaign creation and planning

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Strategy hub/generator; campaigns appear within strategic frameworks and content associations. | Campaigns is a primary navigation destination and receives newly approved onboarding profiles. |
| Required inputs | Business context, industry, objectives, competition, and 30/60/90-day window. | Objective, start date, duration, and publishing intensity, grounded by Business Profile. |
| Main steps | Generate strategy → review roadmap/pillars/campaign frameworks → export/regenerate/version → create monthly content calendar. | Open composer → choose 3/7/14 days and 1–3 ideas/day → generate → review Overview or one week at a time. 30/60/90-day choices remain visible as “Soon.” |
| AI involvement | Strategy Agent generates long-range roadmap, pillars, rationale, and campaign frameworks. | Campaign planner generates title, summary, objectives, KPIs/actions/pillars/rationale, week summaries, and dated daily ideas. |
| User decisions | Select parameters, regenerate, version, and move into content plan. | Dismiss/reopen composer, choose short parameters, switch Overview/week, expand days, approve individual ideas. |
| Output | Strategy version and monthly content plan. | Time-bound Campaign with one or more weeks and dated content ideas. |
| Approval point | Strategy review and later content approval; individual idea approval is not specified as a registration boundary. | Each content idea has its own approval control. The Campaign as a whole remains “In review”; no separate whole-Campaign approval was observed. |
| Destination | Content Calendar/content creation. | Approved ideas become dated Drafts visible in Create and Calendar. |
| Status | — | **Diverged** |
| Assessment | — | Likely intentional and coherent evolution from stationary Strategy to executable Campaign. Long-horizon strategy and richer campaign lifecycle remain unfinished. |

Evidence: [C-PRD §4.3–§4.4, pp. 10–11; N-DEC Strategy/Campaign decisions; L-STAGE `/en/app/campaigns`, empty and generated states]

### 7.8 Campaign-idea approval and draft registration

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | A planned Calendar slot or content item associated with a strategy/campaign. | Tick beside each generated Campaign idea. |
| Required inputs | Planned topic/type/date and strategic associations. | Campaign ID, type, title, description, objective/pillar/context, and generated date. |
| Main steps | Open content from plan → generate/edit → save/approve. | Click tick → create exactly one dated Draft without navigation → show success → transform same control into “Open draft in Create” → persist after refresh. |
| AI involvement | Upstream plan and downstream content generation. | Upstream Campaign generation; registration itself is deterministic. |
| User decisions | Choose a slot and proceed. | Approve the idea as a Draft, then separately decide whether to open and produce it. |
| Output | Content item. | Persistent Campaign-linked Draft with planned date and metadata. |
| Approval point | Content approval later. | Idea-to-Draft approval before production. |
| Destination | Content editor. | Create only on the second action; Calendar already shows the dated Draft. |
| Status | — | **Current-only / strengthened** |
| Assessment | — | A strong intentional evolution that prevents accidental navigation and duplicate drafts while preserving the planning-to-production chain. |

Evidence: [C-PRD §10.2, p. 27; N-FLOW “Flow B”; L-STAGE `/en/app/campaigns`, generated state before/after tick and after refresh]

### 7.9 Standalone content initiation and ideation

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Calendar empty slot or New Content. | Create primary navigation, Campaign Draft, Calendar item, or Overview content links. |
| Required inputs | Content type and the planned idea/context. | For standalone work: Start a blank post or Draft with MARKOS AI; then content type and manual text/AI instruction. |
| Main steps | Select type → AI generates caption/hashtags/CTA → accept/regenerate/edit → media → preview. | Manual studio is immediately available. AI is an optional large side panel. Campaign handoff bypasses the generic entry choice and opens the same Draft. |
| AI involvement | Default generator for the content slot. | Optional. Manual writing and media upload remain first-class. |
| User decisions | Type, accept/regenerate/edit. | Blank versus AI start, type, manual versus assistant at any time, insert/replace confirmation. |
| Output | Draft content item. | New or existing persistent Draft. |
| Approval point | Accept generated elements, then final content approval. | AI suggestion insertion is separate from Save and Ready. |
| Destination | Content editor/preview. | Same integrated studio; later Calendar/scheduling. |
| Status | — | **Diverged** |
| Assessment | — | Positive intentional evolution: AI no longer gates access. The entry copy said “explore an idea first” although the two visible choices were blank post and AI draft, a minor discoverability inconsistency. |

Evidence: [C-PRD §10.2, p. 27; N-FLOW “Flow C”; L-STAGE `/en/app/content-studio`, entry and blank states]

### 7.10 Caption, hashtags, CTA, and revision

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Content generation from Calendar/New Content. | Campaign-generated review or optional Create assistant. |
| Required inputs | Vault context, type, objective, campaign/pillar, tone, and user prompt. | Business Profile, content type, Campaign metadata when present, and a user goal/revision instruction. |
| Main steps | Generate caption/hashtags/CTA/alternatives → accept/regenerate/edit sections without losing edits → version. | Campaign path generates bilingual caption, CTA, and hashtags → review → request focused revisions or continue editing. Assistant path generates one caption and one visual direction → both editable → explicit insertion. |
| AI involvement | Content Creator Agent and Copywriter Agent. | Provider-backed generation and focused revision. |
| User decisions | Accept, regenerate, edit, select alternative, approve. | Edit generated fields, revise with one instruction, insert, confirm replacement, continue manually. |
| Output | Versioned content copy and structured post elements. | Bilingual generated draft plus editable Caption; hashtags/CTA are available in details. Standalone assistant insertion primarily fills the active-language caption and visual prompt. |
| Approval point | Element acceptance and final content approval. | “Insert approved direction,” generated-draft review, then Ready. |
| Destination | Media/preview/approval. | Same studio. |
| Status | — | **Partially matched** |
| Assessment | — | Core generation and control are strong. Canonical alternatives, comments, section-level regeneration with retained edit history, and visible version history are not present. |

Evidence: [C-PRD §4.5–§4.6, pp. 11–12; L-STAGE Campaign-linked and standalone `/en/app/content-studio`; S-CURRENT `ContentStudioPanel` and `content-studio-assistant.tsx`]

### 7.11 Visual direction, media generation, and media selection

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Content editor, Media Library, or Image Creator Agent. | Media step inside Create; visual direction may come from Campaign/assistant or manual input. |
| Required inputs | Visual prompt, brand identity, content format/aspect; optional uploaded/library media. | Optional visual direction, aspect ratio, or JPEG upload; saved assets can be selected inline. |
| Main steps | Generate/upload/library → edit/crop/resize/filter/text overlay → attach → preview. | Approve/insert visual direction → explicitly press Generate → generated JPEG is saved and attached to the same Draft; or upload/choose a saved asset. |
| AI involvement | Image Creator Agent generates brand-consistent visuals and variations. | AI generates a single image from editable visual direction. No fake local fallback is presented as AI. |
| User decisions | Prompt, variation, edit, choose, attach. | Edit prompt, choose ratio, generate, open/remove asset, replace via later action. |
| Output | Media asset(s) in a reusable library and attached content. | Attached media asset and live preview; inline library chooser becomes available after an asset exists. |
| Approval point | Select/attach and final content approval. | Suggestion insertion does not generate media; Generate is an explicit second decision. |
| Destination | Content preview/review. | Caption editor and Preview tab. |
| Status | — | **Partially matched** |
| Assessment | — | The approval separation is stronger. Advanced image editing, variations, and a standalone searchable/tagged Media Library are missing; the live media path was JPEG-centric even when content type was broader. |

Evidence: [C-PRD §4.5–§4.6 and §4.10, pp. 11–13; L-STAGE standalone Create AI image flow; S-CURRENT `content-studio-composer.tsx`]

### 7.12 Content review, readiness, and lifecycle

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Generated or edited content detail. | Generated-review state or manual editor. |
| Required inputs | Copy/media and optional comments. | At minimum meaningful content; media is required for the tested Ready transition. |
| Main steps | Draft → Review → Approved → Scheduled → Published; edit/comments/versioning. | Draft → Ready → Scheduled → Published, with Needs attention where appropriate. Ready locks content; Edit intentionally returns it to Draft. Scheduled content must be unscheduled before editing/deleting. |
| AI involvement | Generation and revision before approval. | Generation/revision remain separate from lifecycle transitions. |
| User decisions | Review, comment, approve, schedule. | Continue editing, Mark Ready, Edit post, Schedule, Cancel schedule. |
| Output | Approved/scheduled/published content. | Explicit stateful content record. |
| Approval point | Approved status. | Ready status functions as solo-user approval/readiness. |
| Destination | Scheduling Queue/Calendar/Analytics. | Calendar and schedule drawer; published items can link toward Insights. |
| Status | — | **Matched / simplified** |
| Assessment | — | The state semantics are clear and trustworthy. Collaborative Review, comments, approval roles, and version history are not visible. |

Evidence: [C-PRD §4.6, pp. 11–12; N-FLOW content state machine; L-STAGE populated Create states]

### 7.13 Calendar planning and unscheduled-content handling

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Monthly Calendar generated from Strategy; empty slots can start content. | Primary Calendar navigation; Campaign-approved ideas appear automatically by planned date. |
| Required inputs | Monthly plan, pillar/objective/campaign mapping, dates, content types. | Existing content records with planned/scheduled dates, or unscheduled Draft/Ready records. |
| Main steps | Month/week/list, drag/drop, gap detection, type distribution, best times, CSV/PDF. | Week/month views, status/type filters, day/item focus, planned vs scheduled indicators, Unscheduled count/drawer, and direct links back to the same Create record. |
| AI involvement | Calendar Agent proposes full monthly plan, distribution, gaps, and times. | No visible Calendar AI. Campaign planning supplies dated ideas upstream. |
| User decisions | Move slots, fill gaps, choose type/time, create content. | Filter, navigate period, open day/item, edit, schedule/reschedule/cancel, or reopen unscheduled records. |
| Output | Monthly plan and scheduled queue entries. | Temporal view of content records plus schedule actions. |
| Approval point | Content approval and scheduling confirmation. | Ready is required before schedule; exact time is confirmed in a separate drawer. |
| Destination | Create, scheduling queue, and published analytics. | Create and Insights links by state. |
| Status | — | **Partially matched** |
| Assessment | — | Current record continuity and unscheduled handling are strong. The Calendar is an operational view rather than an AI-generated monthly planning surface. Drag/drop, gap intelligence, best-time suggestions, and exports are absent. A Campaign Draft with date-only intent appeared at 3:00 AM in Calendar, suggesting a user-visible date/time ambiguity. |

Evidence: [C-PRD §4.4 and §10.2, pp. 10–11, 27; N-FLOW “Flow E”; L-STAGE `/en/app/calendar`, planned, scheduled, and Unscheduled states]

### 7.14 Scheduling and publishing

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Approved content or Scheduling Queue. | Ready content in Create or Calendar. |
| Required inputs | Connected Instagram account, eligible media, date/time, approval. | Ready record, exact date/time, and eventually a connected Instagram account. |
| Main steps | Preview → approve → choose recommended/custom time → queue → publish → retry/reschedule on failure. | Schedule opens a focused drawer → confirm exact Bahrain time → record becomes Scheduled; cancellation returns to Ready. Calendar exposes scheduled status. |
| AI involvement | Best-time recommendation and scheduling intelligence. | No observed best-time recommendation. |
| User decisions | Time, queue, reschedule, retry, publishing approval. | Exact date/time, confirm, cancel, reschedule. |
| Output | Published Instagram media and queue history. | Scheduled content record. Live direct publication was not proven. |
| Approval point | Explicit preview/approval before scheduling. | Ready and schedule confirmation are separate. |
| Destination | Queue, Calendar, then Analytics. | Calendar; no dedicated visible queue page. |
| Status | — | **Partially matched** |
| Assessment | — | Scheduling UX matches the control philosophy. Publishing is **Unclear** in real use: the audited Settings state was disconnected and explicitly displayed “Dry run.” Queue management, retries, bulk actions, and best-time intelligence were not visible. |

Evidence: [C-PRD §4.7 and §10.2, pp. 12, 27; L-STAGE Create schedule drawer, Calendar, and `/en/app/settings#connections`]

### 7.15 Insights and reporting

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Analytics dashboard, post details, reports, and proactive recommendations. | Insights primary navigation; published Calendar content can link into it. |
| Required inputs | Synced account, content, story, Reel, audience, growth, hashtag, and competitor data. | Synced aggregate and content performance data for 7- or 30-day windows. |
| Main steps | Overview → choose range → drill into post/story/reel/audience/growth/hashtags/competitors → AI explanation → recommendations/chat/report. | Choose 7/30 days → inspect six metrics, trend, prior-period comparison, content-type performance, top posts, audience-availability message → export monthly report. |
| AI involvement | Analyst explains why; Consultant recommends next actions and chats. | No visible AI explanation or recommendation in the current Insights page. |
| User decisions | Range, item, recommendation, consultant follow-up, report. | Range, trend metric, top content, export. |
| Output | Performance understanding, reports, and actionable learning. | Honest analytics summary and export surface. |
| Approval point | User accepts recommendations/changes. | No learning approval step. |
| Destination | Consultant, next strategy/content, Vault learning. | No visible downstream action beyond opening content. |
| Status | — | **Partially matched** |
| Assessment | — | Reporting foundations exist and unavailable data is handled honestly. Canonical drilldown breadth and action-oriented AI are missing. |

Evidence: [C-PRD §4.8–§4.9 and §10.3, pp. 12–13, 27; L-STAGE `/en/app/analytics`, empty workspace; S-CURRENT `FinalAnalyticsPanel`]

### 7.16 Learning loop and AI consultant

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Weekly digest, proactive dashboard cards, Analytics, chat, and monthly report. | No mounted Consultant or learning-approval destination in primary navigation. |
| Required inputs | Performance, business context, prior AI outputs, user edits/feedback, and market/competitor signals. | Current product can store business context and analytics, but no visible workflow combines them. |
| Main steps | Detect pattern → explain → recommend → converse → user accepts/edits → update Vault → change next strategy/content. | Not observed. Overview shows next operational task, not analytical advice. |
| AI involvement | Central Analyst and Growth Consultant agents. | Absent from the visible workflow. |
| User decisions | Accept/reject recommendations, ask questions, tune goals/frequency. | None available. |
| Output | Weekly advice, growth actions, new campaigns, report, and learned memory. | None visible. |
| Approval point | Accepted recommendation/learning. | None. |
| Destination | Vault and next Strategy/Calendar/Create cycle. | None. |
| Status | — | **Missing** |
| Assessment | — | This is the most consequential unfinished canonical capability because it is the only step that turns MARKOS from a linear production tool into a learning operating system. |

Evidence: [C-PRD §4.9 and §8.4, pp. 13, 23; C-PLAN §1.1; L-STAGE Overview and Insights]

### 7.17 Workspace, settings, language, and billing

| Aspect | Canonical | Current |
|---|---|---|
| Entry point | Settings destinations for account, workspace, Instagram, billing, team, notifications, and administration. | Settings is separate from the main shell with Account, Channels, Security, Billing, and Data and memory sections. Language is available in auth, shell, and Settings. |
| Required inputs | Account/workspace data, connections, plan/payment, team roles, notification choices. | Verified account; MFA and a recent verification window before Instagram connection; current plan; optional export actions. |
| Main steps | Manage complete workspace and commercial settings. | View account/workspace/role; set up MFA; connect/reconnect/refresh/disconnect Instagram; view Starter/Trial, currency/invoice/payment counts; export data; inspect audit trail. |
| AI involvement | None directly; settings govern autonomy/notifications/plan limits. | None directly. |
| User decisions | Team, billing, notifications, integrations, language. | Security/connection lifecycle, language, data export, logout. |
| Output | Configured multi-user paid workspace. | Basic secure owner workspace with connection and data controls. |
| Approval point | Sensitive actions, payment, team invitations. | MFA/step-up for channel management and explicit connection actions. |
| Destination | Back to workspace or external authorization. | Back to last workspace area. |
| Status | — | **Partially matched** |
| Assessment | — | Security/connection transparency is stronger. Full billing actions, upgrades, payment methods, notification preferences, team collaboration, and admin are missing. English/Arabic route persistence and RTL are real, but live Arabic showed several untranslated dynamic status values such as “Scheduled” and “Draft.” |

Evidence: [C-PRD §11.9–§11.10 and §12, pp. 30–33; C-COST §6; L-STAGE authenticated shell, `/ar/app`, and `/en/app/settings`]

## 8. Page-by-page comparison

The table below includes pages present in only one version. “Current purpose” describes mounted or live user-facing behavior, not latent components that happen to exist in source.

| Page or surface | Canonical purpose and content | Current purpose, actions, AI, connections, and states | Classification and assessment | Evidence |
|---|---|---|---|---|
| **Marketing landing** `/en` | Explain the full AI Marketing OS, plans, proof, and entry to signup/login. | Presents flexible Instagram help for Bahrain businesses across Plan/Create/Publish/Insights, a sample café workflow, sample Insights, control principles, Start free, and Login. | **Partially matched.** Cleaner and more credible positioning, but it understates the canonical autonomous/learning system and links to unimplemented Plans/FAQ/Contact routes. | C-PRD §11.1, p. 28; L-STAGE `/en`; `marketing-landing.tsx`. |
| **Plans / pricing** | Public comparison of Starter/Growth/Pro/Enterprise, quotas, feature differences, and selection. | Public landing links to Plans, and Settings shows Starter/Trial with BHD and counts; no dedicated current Plans page or upgrade flow was found. | **Missing.** Monetization is represented as status, not a usable public or in-app journey. | C-PRD §12, pp. 31–33; C-COST §3 and §6; S-CURRENT route inventory; L-STAGE `/en/plans` redirected to Overview while authenticated. |
| **Signup** `/en/signup` | Account creation, plan context, terms, verification. | Compact form with name/email/password, consent, show-password, validation, Google/Apple buttons, shared language control, and static populated week-Calendar preview. Desktop viewport did not scroll in the observed window. | **Matched / evolved.** Static product proof is current-only and helpful. Provider-button functionality was not verified. | C-PRD §10.1, p. 26; L-STAGE `/en/signup`; `auth-page.tsx`. |
| **Login** `/en/login` | Authenticate and recover account. | Email/password, forgot-password link, Google/Apple buttons, shared language control, and static Insights preview with three metrics and two chart formats. | **Matched / evolved.** Static preview is current-only. | C-PRD §11.1, p. 28; L-STAGE `/en/login`; `auth-page.tsx`. |
| **Verification** `/en/verify` | Verify email before onboarding. | Explicit destination email, spam guidance, resend countdown, resend, Change email, Back to login, success/status messaging. | **Matched / strengthened.** Recovery is clearer than the canonical screen inventory. | C-PRD §10.1, p. 26; L-STAGE `/en/verify`. |
| **Password recovery/reset** | Normal account recovery. | Dedicated routes and honest unavailable/error behavior are represented in current flows; not exercised live. | **Partially matched / Unclear.** Surface exists, operational completion not verified. | N-FLOW auth overlay; `forgot-password/page.tsx`, `reset-password/page.tsx`. |
| **MFA** | General security in settings/admin. | Security section can set up and verify MFA; channel management requires a recent MFA verification window. | **Current-only / evolved.** Strong security and user-state clarity; not central to canonical product concept. | L-STAGE `/en/app/settings#security` source-backed; `settings-panel.tsx`. |
| **Onboarding greeting** `/en/onboarding` | Overview of the seven-module interview and progress. | Very minimal two-choice greeting: use business documents or enter details manually. | **Diverged.** Intentional simplification and a new path-selection moment. | C-PRD §11.2, p. 28; L-STAGE greeting. |
| **Business-document onboarding** | No equivalent whole-onboarding page. | Select up to five supported business files, inspect selection, then explicitly analyze; retry/discard/manual escape states; results feed the same seven-section draft and require approval. | **Current-only.** Valuable intentional evolution; extraction quality not live-tested here. | N-FLOW document-assisted path; `onboarding-panel.tsx`; L-STAGE upload screen. |
| **Manual onboarding steps 1–7** | Company; story; products/pricing/categories; audience; competitors; brand assets/colors/fonts/guidelines; tone taxonomy; objectives/KPIs. | Business basics; structured offerings; story/differentiation; customers; market context; tone plus up to seven colors; current priority. “Why this helps” explains grounding. Company/offerings are essential; all others can be skipped. | **Partially matched.** Same broad subject map, lower required depth, more natural-language framing, and explicit color selection. | C-PRD §4.1, pp. 9–10; L-STAGE steps 1–7. |
| **Onboarding information check** | Canonical progress/completeness and skipped-section return. | Two-column scan of Ready/Not added sections; every row is an Edit action; two essentials unlock profile generation. | **Matched / simplified.** Strong scan-and-return interaction. | C-PRD §4.1, p. 10; L-STAGE Information check. |
| **Generated Business Profile review** | Not a separately specified canonical page; canonical onboarding feeds Vault and Strategy. | Grouped Business identity, Brand information, Audience, Goals, Tone/preferences; English/Arabic tabs; long fields expand into fixed non-resizable editors; regenerate/back/approve. | **Current-only / evolved.** Strong approval surface. Live price-fidelity error illustrates its necessity. | N-FLOW profile resolution; L-STAGE generated profile review; `onboarding-panel.tsx`. |
| **Overview / Dashboard** `/en/app` | Strategy summary, Calendar snapshot, upcoming posts, AI recommendations, KPIs, notifications, and quick actions. | Welcome/next-task message, workspace item/scheduled/reach metrics, Profile readiness, work-in-progress records, links to Create/Campaigns/Profile. Updates when content state changes. | **Partially matched.** Connected operational overview exists; proactive AI insight and strategic summary are absent. | C-PRD §11.3, p. 28; L-STAGE empty and populated Overview; `FinalDashboard`. |
| **Knowledge Vault / Business Profile** `/en/app/knowledge` | Full structured editor, categories, search, source/context, completeness, gaps, history, and versions; receives performance/feedback. | Readiness percentage, 2-of-7 style completeness, last-updated dates, and one link back to onboarding edit mode. No visible profile values, strategy, versions, learned performance, or interaction history. | **Partially matched / weakened.** This is the largest page-level reduction relative to the canonical spine. | C-PRD §4.2 and §11.3, pp. 10, 28; L-STAGE `/en/app/knowledge`; `FinalVaultPanel`. |
| **Strategy hub/detail/generator** | Dedicated library and generation workflow for 30/60/90-day roadmaps, pillars, frameworks, rationale, PDF, regeneration, and versions. | No Strategy page. Legacy Strategy routes redirect to Campaigns. Durable strategy is intended to live in Business Profile but is not visibly editable there. | **Diverged / currently missing as a visible object.** Intentional renaming does not by itself supply the durable strategy layer. | C-PRD §4.3 and §11.4, pp. 10, 29; N-DEC Strategy/Campaign decision; `app/[locale]/[section]/page.tsx`. |
| **Campaign library** `/en/app/campaigns` | Campaigns are frameworks or associations inside strategy/content; no comparable primary library is detailed. | Left library of multiple campaigns with status/date/duration, New Campaign actions, and selected detail. | **Current-only.** Coherent primary planning IA. | N-FLOW Flow B; L-STAGE generated Campaign. |
| **Campaign composer** | Strategy generator asks horizon/parameters and business context. | Dismissible dialog for objective, duration, start date, intensity; Escape works; empty state remains navigable. 3/7/14 are active; 30/60/90 visibly “Soon.” | **Diverged.** Short executable plans replace long strategic roadmaps. Dismissal is well handled. | C-PRD §4.3, p. 10; L-STAGE empty Campaign state. |
| **Campaign detail — Overview** | Strategy detail: executive summary, objectives, pillars, framework, priorities, rationale, timeline, KPI. | Campaign summary/metrics plus Overview and Week-by-week tabs; Overview contains campaign-level direction, while pillars and rationale are progressively disclosed. | **Partially matched.** Many planning ingredients survive inside a shorter object. | C-PRD §11.4, p. 29; `campaign-panel.tsx`; live generated Campaign. |
| **Campaign detail — week review** | Monthly Calendar or strategy timeline; no explicit per-idea approval registry. | One week at a time, days expandable/collapsible, type/title/wrapping description, individual approval tick, persisted Draft/Create state. | **Current-only / evolved.** Strong planning-to-execution surface. | L-STAGE generated Campaign before/after tick and refresh. |
| **Content Calendar** `/en/app/calendar` | Month/week/list; AI monthly plan; mapping, drag/drop, gaps, distribution, best-time, CSV/PDF. | Week/month; filters; date navigation; planned/scheduled content; day and content focus; schedule actions. | **Partially matched.** Operational calendar is strong; AI planning and calendar-manipulation breadth are absent. | C-PRD §4.4 and §11.5, pp. 10–11, 29; L-STAGE Calendar. |
| **Unscheduled drawer** | Unscheduled/queue concepts exist but not this exact right drawer. | Counted right-side drawer listing Draft/Ready records without planned times; item opens the same record in Create with source context. | **Current-only.** Effective recovery path and identity-preserving navigation. | L-STAGE Calendar with one unscheduled Draft; `calendar-panel.tsx`. |
| **Calendar day/content focus** | Content detail and calendar navigation are separate canonical screens. | URL-backed focused day/item dialog with media, state, planned/scheduled time, Campaign/week context, and Edit content link. | **Matched / evolved.** Progressive disclosure keeps the main Calendar bounded. | L-STAGE planned Campaign Draft focus. |
| **Create entry** `/en/app/content-studio` | New Content or Calendar slot begins an AI-led generator. | Two clear normal entries: Start a blank post or Draft with MARKOS AI. Campaign/Calendar links open a specific existing record directly. | **Diverged.** Manual first-class access is a positive evolution. | C-PRD §10.2, p. 27; L-STAGE Create entry. |
| **Create studio** | Type, copy, media, editor, preview, approval, scheduling; rich text and advanced image tools. | Bounded left editor plus large right Assistant/Preview panel. Type selection collapses after selection; Media, Caption, Instagram details, actions, Save/Ready/Schedule are integrated. | **Partially matched.** Strong structure and state clarity; production breadth is narrower. | C-PRD §4.5–§4.6 and §11.5, pp. 11–12, 29; L-STAGE manual and populated Create. |
| **Campaign-generated review** | Generated copy offers accept/regenerate/edit; no separate screen composition specified. | Bilingual copy, CTA, hashtags, objective, original context, quick revision prompts, custom instruction, Continue editing/media, and Mark Ready. | **Matched / evolved.** A clear quality gate before the main editor. | L-STAGE Campaign-linked Create after generation. |
| **AI Assistant side panel** | AI is spread among specialist agents and an AI chat/consultant destination. | Optional studio panel takes a goal, generates caption and visual direction, allows edits, and explicitly inserts approved output. It can switch to Preview. | **Current-only presentation; canonically aligned capability.** Excellent assist-not-gate placement. | `content-studio-assistant.tsx`; L-STAGE standalone assistant. |
| **Content preview** | Mobile Instagram preview before approval/scheduling. | Fixed, device-free Instagram-style preview after media is present; updates with attached media and caption and exposes no fabricated metrics. With caption but no media, it remained a generic placeholder in the observed state. | **Partially matched.** Honest and realistic when media exists; text-only live preview is incomplete. | C-PRD §4.7 and §10.2, pp. 12, 27; L-STAGE Create Preview before/after media. |
| **Media Library** | Dedicated searchable/tagged reusable asset destination with upload, AI generation, filters, and metadata. | No primary navigation page. Create has an inline Media Library chooser that becomes usable when saved assets exist. | **Partially matched / weakened.** Asset reuse exists only as an embedded control. | C-PRD §4.10 and §11.6, pp. 13, 29; L-STAGE Create; route inventory. |
| **Scheduling drawer** | Schedule/queue screens, recommended time, retry/reschedule, bulk actions, and preview. | Focused final-step drawer confirms exact date/time and explains that only schedule changes; Schedule/Cancel are explicit. | **Partially matched.** Strong approval interaction, less operational breadth. | C-PRD §4.7 and §11.7, pp. 12, 30; L-STAGE Ready Create record. |
| **Scheduling Queue** | Dedicated queue with pending/published/failed, retry/reschedule, and limits. | No mounted primary Queue page; status is distributed between Create, Calendar, Overview, and Settings. | **Missing.** A separate operational destination is absent. | C-PRD §11.7, p. 30; current route/nav inventory. |
| **Insights** `/en/app/analytics` | Multiple analytics screens plus AI explanations, recommendations, chat, and reports. | 7/30-day metrics, trend, comparison, content-type performance, top content, audience availability, and report export. Empty state is honest. | **Partially matched.** Reporting exists; analysis-to-action does not. | C-PRD §4.8 and §11.8, pp. 12–13, 30; L-STAGE Insights empty state. |
| **AI Consultant / Chat / weekly digest** | Dedicated proactive advice, weekly digest, monthly report, growth/campaign recommendations, and chat. | No mounted primary destination or visible proactive recommendation flow. | **Missing.** Core canonical differentiator absent. | C-PRD §4.9 and §11.8, pp. 13, 30; current nav/live pages. |
| **Settings — Account/Workspace** | Profile, workspace, team, notification, plan, and account controls. | Account identity, workspace, role, verified state, and logout. | **Partially matched.** Basic owner controls only. | L-STAGE `/en/app/settings#profile`. |
| **Settings — Channels/Security** | Instagram connection/settings and general security. | Instagram lifecycle with security prerequisites, connection state, token refresh/disconnect, last sync, publish mode, and MFA. | **Matched / strengthened in transparency.** Actual publishing was not proven. | L-STAGE `#connections`; `settings-panel.tsx`. |
| **Settings — Billing** | Plan selection, payment method, invoices, usage/limits, upgrades/cancellation. | Starter/Trial status, BHD currency, invoice and payment counts only. | **Partially matched.** Read-only summary without commercial actions. | C-PRD §12, pp. 31–33; L-STAGE `#billing`. |
| **Settings — Data and memory** | Data/privacy controls and Vault-related management. | Export data, Open Vault, and audit trail. | **Partially matched / current-only mix.** Useful controls, but no memory-governance/learning controls. | L-STAGE `#data`. |
| **Team and Admin** | Team invitations/roles and broad admin operations are separate canonical screens. | Not mounted in primary current product. | **Missing.** Consistent with the current owner-first simplification. | C-PRD §11.9–§11.10, pp. 30–31; current routes/nav. |

## 9. AI-functionality comparison

### 9.1 Capability matrix

| AI capability | Where it appears | User input and expected context | Output and movement | Editing and approval | Status versus canonical |
|---|---|---|---|---|---|
| **Business-document analyst** | Current onboarding greeting/document path. | Up to five mixed business files; should use evidence from text and images and map it into the seven profile sections. | Proposed onboarding values/issues → same information check/profile pipeline. Source files remain temporary. | User can remove before send, review/edit output, retry/discard, or approve. | **Current-only.** Strong evolution; live extraction not re-tested. |
| **Offering-document analyst** | Current onboarding step 2. | One or two product/service documents plus structured offering schema. | Proposed product/service rows → offerings table → Business Profile. | Explicit review/use/discard before step save. | **Matched / evolved.** More structured than canonical freeform product capture. |
| **Profile resolver/writer** | Current first-time onboarding after information check. | Available seven-section draft and language requirement. | Editable English/Arabic profile → approved working memory → Campaigns. | Field expansion/editing, language review, regenerate, explicit approval. | **Current-only trust layer.** One observed numeric-fidelity error reinforces the need for approval. |
| **Strategy Agent** | Canonical Strategy hub. | Vault, objective, industry, competition, time horizon. | 30/60/90 roadmap, pillars, frameworks, priorities, rationale, PDF/version → monthly plan. | Regenerate/parameterize/version/review. | **Missing as a current standalone capability.** Durable strategy is conceptually relocated but not visibly represented. |
| **Campaign planner** | Current Campaign composer/detail. | Profile context, objective, date, 3/7/14-day duration, 1–3 ideas/day. | Campaign summary, metrics, week theme, days, post ideas, pillars, rationale → approval ticks. | User changes parameters before generation, reviews weeks, approves individual ideas. No whole-Campaign approval was observed. | **Diverged / evolved.** Strong short-term executor; narrower than canonical long-range strategy/calendar planning. |
| **Calendar Agent** | Canonical Calendar. | Strategy, pillars, frequency, content balance, performance. | Monthly mapped plan, gap detection, type distribution, best times. | User moves/edits/regenerates slots. | **Missing in current Calendar.** Upstream Campaign supplies dates instead. |
| **Campaign-to-content handoff** | Current Campaign idea tick and Create. | Approved idea plus Campaign ID/type/title/description/objective/pillar/date/context. | One persistent Draft → same record in Create and Calendar → generated copy/media workflow. | First click registers only; second action opens Create. | **Current-only / strengthened.** Deterministic rather than generative, but crucial to AI-output movement. |
| **Campaign-linked content generator** | Current Create Campaign starting point. | Editable Campaign metadata plus Business Profile. | Bilingual caption, CTA, hashtags, objective/context → generated review → editor. | Quick/custom revisions, continue editing, or Mark Ready. | **Matched / evolved.** Clear context preservation and approval. |
| **Standalone studio assistant** | Current right-side Create panel. | User goal/offer/audience/message, content type, Business Profile, optional Campaign. | Suggested caption + visual direction → direct insertion into Caption and media prompt. | Both outputs editable; insertion requires approval; replacement requires confirmation. | **Matched / strengthened.** AI assists instead of gating. |
| **Copy revision** | Campaign-generated review; canonical section-level editing. | One focused instruction and existing generated copy/context. | Revised bilingual draft/structured details. | Repeated revision or manual continuation. | **Partially matched.** No visible versions/comments/alternative library. |
| **Image generation** | Current Media step; canonical Image Creator Agent. | Editable visual direction, profile/brand context, aspect. | Generated image saved and attached to the same Draft; preview updates. | Separate explicit Generate action; asset removable/replacable before Ready. | **Partially matched.** Real handoff works; no advanced edits/variations/full library. |
| **Best-time scheduling** | Canonical Scheduler. | Historical audience/performance and content readiness. | Recommended time → queue. | User accepts/overrides. | **Missing.** Current user selects exact time manually. |
| **Performance analyst** | Canonical Analytics; current Insights. | Synced metrics, content, business goals, comparison windows. | Canonically explains why and what changed. Currently displays metrics/trends only. | Canonically user explores/accepts recommendations; currently only range/metric selection. | **Partially matched at data presentation; missing as AI.** |
| **Growth consultant/chat** | Canonical AI Insights/Consultant screens. | Vault + performance + market/competitor context + user questions. | Weekly digest, recommendations, campaigns, chat, monthly report. | User asks, accepts, rejects, or edits advice. | **Missing.** |
| **Learning/memory writer** | Canonical cross-product loop. | Performance, user feedback, accepted edits, AI history. | Updated Vault context that changes later Strategy/content. | User-approved learning where consequential. | **Missing as a visible user workflow.** Current Business Profile has no learned-insight surface. |
| **Competitor intelligence** | Canonical onboarding, Analytics, and Consultant. | Named competitors and external/owned observations. | Benchmarks, positioning, recommendations. | User confirms/uses results. | **Missing / deliberately constrained.** Current onboarding explicitly says MARKOS will not pretend to verify user-provided competitors. |

### 9.2 How AI output moves through the current product

The current product has three effective forward-moving AI paths:

1. **Business files → onboarding proposal → profile wording → approved Business Profile → Campaign.** This path uses two approval layers: extracted facts and final wording.
2. **Business Profile + Campaign request → generated Campaign → approved idea → persistent dated Draft → generated/revised content → manual editor.** This is the strongest current cross-page AI chain.
3. **Create instruction → editable caption and visual direction → explicit insertion → explicit image generation → attached media → Ready → Scheduled.** Approved AI output does not remain isolated in the assistant.

The missing return path is:

4. **Published performance → AI explanation → approved recommendation/learning → Business Profile/strategy → next Campaign.** Canonically this is the product’s defining loop; currently it has no visible user journey.

### 9.3 Assistance versus gating

Current Create improves on the canonical ambiguity by keeping the manual studio fully accessible. AI generation is optional at entry and optional inside the editor. The user can write a caption, upload media, and save without AI. AI outputs never silently replace existing editor content; replacement requires confirmation. This is a likely intentional evolution toward trust and collaborative use. [L-STAGE standalone Create]

Onboarding is the exception where AI resolution is a required step for first-time final profile wording after the information check, but the raw information remains directly editable and the generated result must be approved. Edit mode intentionally saves already approved information without regenerating the profile. [L-STAGE `/en/onboarding` and `?mode=edit`]

## 10. Navigation and information-architecture comparison

### 10.1 Canonical primary structure

The canonical inventory is broad and role-oriented:

- Dashboard
- Knowledge Vault
- Strategy hub/detail/generator
- Content Calendar and content creator/detail
- Media Library
- Scheduling Queue and Instagram preview/schedule
- Analytics overview plus post/story/reel/audience/growth detail
- AI Insights, chat, report, and competitor analysis
- Settings, billing, team, notifications, and admin

[C-PRD §11, pp. 28–31]

### 10.2 Current primary structure

The mounted desktop sidebar is:

- Overview
- Campaigns
- Create
- Calendar
- Insights
- Business Profile
- Settings

It is sticky/fixed at desktop width, collapsible, and separate from the independently scrolling content pane. Mobile uses horizontal navigation. Language sits immediately above Settings. [S-CURRENT `app-shell.tsx`; L-STAGE authenticated shell]

### 10.3 Meaningful IA changes

| Change | Status | Effect |
|---|---|---|
| Strategy renamed/reconceptualized as Campaigns. | **Diverged** | Makes execution clearer, but leaves durable strategy without a visible home. |
| Knowledge Vault renamed Business Profile. | **Partially matched** | Friendlier label; current page communicates completeness rather than deep memory. |
| Analytics renamed Insights. | **Matched / terminology evolution** | Better implies interpretation, although current behavior remains mostly analytics. |
| Content Studio labeled Create. | **Matched / simplified** | Clear action label and direct manual/AI entry. |
| Media Library removed as a destination. | **Missing / folded in** | Reduces navigation, but asset management becomes hard to discover and limited to Create. |
| Scheduling Queue removed as a destination. | **Missing / distributed** | Keeps navigation small, but operational retry/failure/queue management has no dedicated home. |
| AI Consultant/Chat removed as a destination. | **Missing** | Weakens the “AI team” and learning-loop concept. |
| Team/Admin removed. | **Missing / likely simplification** | Consistent with owner-first current use, but does not support canonical agency/multi-user personas. |
| Settings uses a separate page shell. | **Current-only** | Focuses sensitive controls, but creates a slightly different navigation model from the main workspace. |
| Campaign, Create, and Calendar share persistent record links. | **Current-only / strengthened** | Strongly improves cross-page continuity. |

### 10.4 Discoverability and dead ends

- Empty Campaign no longer traps the user: the composer can be closed by visible action or Escape, sidebar navigation works, and the empty state retains a New Campaign action. **Matched to the current no-dead-end principle.** [L-STAGE empty Campaign]
- Unscheduled content has a counted, clearly labeled drawer and returns to the same Create record. **Strong current-only recovery path.** [L-STAGE Calendar]
- Public Plans, FAQs, and Contact links do not lead to implemented public pages in the current route inventory. **Unfinished/dead-end public IA.**
- Business Profile directs all edits back through onboarding rather than exposing knowledge inline. This is functional, but it makes ongoing memory management feel like setup rather than a core product activity. **Disconnected from the revised durable-strategy concept.**

## 11. UI/UX interaction comparison

This section compares structure and interaction patterns, not exact color tokens.

| Interaction dimension | Canonical intention | Current behavior | Assessment |
|---|---|---|---|
| Progressive disclosure | Many dedicated screens and full feature areas; status and previews are explicit. | Bounded Campaign week/day panels, collapsed content type, expandable Instagram details, grouped profile fields, Calendar focus dialogs, and right-side drawers. | **Improved.** Current dense workflows reveal detail more selectively. |
| Page scrolling | Canonical screen specifications do not establish one consistent pattern. | Sticky sidebar; independent content scroll; Campaign/Create use bounded internal cards; Insights uses normal information-dense scrolling. | **Current-only refinement.** Coherent desktop behavior. |
| Long text | Canonical editor supports rich, editable content. | Onboarding profile fields collapse and expand; Campaign descriptions wrap; Create textareas are non-resizable; preview caption uses “more.” | **Matched / improved for scanability.** |
| AI placement | AI appears in role-specific pages and a separate chat/consultant. | AI is embedded at the point of work, especially the large Create Assistant/Preview panel. | **Partially matched.** Production assistance is excellent; strategic/analytical AI presence is weak. |
| Approval clarity | User accepts/regenerates/edits and approves before scheduling. | Extraction approval, profile approval, idea tick, suggestion insertion, replacement confirmation, Ready, and Schedule are visibly distinct. | **Strengthened.** Current product makes consequences unusually legible. |
| State clarity | Draft/Review/Approved/Scheduled/Published. | Draft/Ready/Scheduled/Published/Needs attention, with explanatory copy and locked Ready/Scheduled content. | **Matched / simplified.** Ready fits solo-owner use but lacks collaborative review roles. |
| Empty states | Canonical requirements include failures, quotas, and no-data states. | Campaign, Calendar, Overview, Insights, Media, and Settings show actionable or honest empty states. | **Matched.** Insights correctly avoids fabricated zeroes. |
| Loading/errors | Canonical degradation and retries are required. | Verification resend, session retry, document retry/discard, Campaign generation feedback, Create AI loading/cancel/retry, and honest media errors are represented. | **Partially matched.** Broad coverage; not every error was induced live. |
| Preview | Canonical mobile preview is required before scheduling. | Device-free Instagram preview shows attached media, caption, actions, and no fabricated metrics; Preview is a tab beside AI. | **Partially matched.** Strong with media; text-only preview remained generic. |
| Bilingual/RTL | Canonical Bahrain/Arabic needs are implied and current spec requires parity. | English/Arabic routes, RTL shell, bilingual generated profile/content. Some dynamic statuses remain English in Arabic. | **Partially matched.** Structure is real; localization completeness is unfinished. |
| Motion | Canonical does not prescribe motion deeply. | Short transitions and drawers; no observed Calendar layout-expansion animation in the current flow; reduced-motion classes exist in mounted source. | **Current-only refinement.** |
| Density | Canonical inventory implies many dashboards/cards. | Current Sunlit pages use fewer destinations, wide content areas, internal scrolling, and grouped cards. | **Likely intentional evolution.** Generally clearer, though Business Profile is now too sparse functionally. |

## 12. Canonical features missing or weakened

The following are product/experience gaps, ordered by conceptual importance rather than implementation effort.

### 12.1 Closed-loop learning — **Missing**

No current user journey turns performance into an explanation, lets the user approve a lesson, writes it into business memory, and changes the next Campaign. This breaks the canonical loop at its most differentiating point. It appears to be an unfinished implementation, not an intentional removal, because current public and in-app copy still says Insights should improve the next Campaign. [C-PLAN §1.1; C-PRD §4.9 and §8.4, pp. 13, 23; L-STAGE Insights]

### 12.2 Rich Knowledge Vault / durable strategy — **Partially matched, materially weakened**

Business Profile contains the seven-section structure and grounds generation, but the visible page does not show the approved values, durable strategy, learned performance, interaction history, version history, search, sources, or gap-resolution workflow. Because current product decisions moved stationary strategy into this area, the missing strategy surface is now more consequential than it was when Strategy had its own page. This is an unfinished implementation and a possible conceptual regression if left unresolved. [C-PRD §4.2 and §11.3, pp. 10, 28; N-DEC Strategy/Campaign decision]

### 12.3 AI Consultant and actionable Insights — **Missing**

The canonical weekly digest, “why this worked” explanations, prioritized recommendations, monthly report narrative, and chat are absent. Current Insights reports but does not advise. [C-PRD §4.8–§4.9 and §11.8, pp. 12–13, 30]

### 12.4 Calendar intelligence — **Partially matched**

Current Calendar is an effective operational ledger, but the canonical monthly AI plan, gap detector, content-mix balance, drag/drop, best-time recommendations, and CSV/PDF plan exports are absent. Upstream Campaigns now own ideation, which is a reasonable evolution; the remaining gap is that Calendar cannot help reshape the plan. [C-PRD §4.4, pp. 10–11]

### 12.5 Full content-format production — **Partially matched**

The UI exposes Post, Carousel, Reel, and Story, and Campaign generation produces those types. The tested live Media path was JPEG-centric, while canonical capabilities include multi-image carousels, Reel scripts/video, Story sequences, and richer platform-specific production. The current content-type taxonomy is ahead of the proven production tools. [C-PRD §4.5, p. 11; L-STAGE Create]

### 12.6 Media Library — **Partially matched, weakened**

Saved assets can be selected inline from Create, but there is no dedicated searchable/tagged library or asset-management journey. [C-PRD §4.10 and §11.6, pp. 13, 29]

### 12.7 Scheduling Queue and publishing operations — **Missing / Unclear**

Scheduling is visible and well separated from Ready, but a queue page with pending/published/failed items, retries, rescheduling, bulk actions, and rate-limit communication is absent. Direct live publishing could not be verified in the disconnected/dry-run staging state. [C-PRD §4.7 and §11.7, pp. 12, 30]

### 12.8 Long-range planning — **Diverged and deferred**

Canonical 30/60/90-day Strategy is unavailable. Current 30/60/90 Campaign durations remain visible but disabled, while the active generator supports 3/7/14 days and up to three ideas per day. This is a deliberate showcase simplification according to current decisions, but it remains a meaningful capability difference. [C-PRD §4.3, p. 10; L-STAGE Campaign composer]

### 12.9 Collaboration, team, comments, and roles — **Missing**

The canonical agency persona, Team page, comments, approval roles, and multi-user review mechanics are not visible. The current Ready state is optimized for a single owner. [C-PRD §3 and §11.9, pp. 7–8, 30]

### 12.10 Complete billing and public support journey — **Missing / weakened**

The product exposes Starter/Trial and BHD but lacks a usable public Plans page, upgrade/payment actions, usage-limit management, team billing, FAQs, and Contact destinations. [C-PRD §12, pp. 31–33; C-COST §6; current route inventory]

## 13. Current-only additions and likely intentional evolution

| Addition/evolution | Why it matters | Assessment |
|---|---|---|
| Whole-business document-assisted onboarding | Lets owners bring existing business material and review one consolidated proposal. | Strong current-only addition; maintains owner authority. |
| Two-essential completion rule | Prevents optional knowledge gaps from blocking time-poor owners. | Good simplification, provided future gaps remain discoverable. |
| Bilingual generated Business Profile approval | Makes the business identity itself an explicit artifact before planning. | Strong trust and localization improvement. |
| Structured offering rows with BHD price | Turns product knowledge into reusable, editable records rather than one ambiguous paragraph. | Strong evolution. |
| Explicit business-color control (up to seven) | Adds lightweight visual identity grounding. | Useful current-only detail; not equivalent to canonical full brand assets/fonts/guidelines. |
| Campaign as primary executable object | Creates a direct relationship between a goal, dates, intensity, weekly plan, and content ideas. | Coherent major evolution. |
| Tick → Draft, then Create | Separates approving an idea from entering production and prevents duplicates. | One of the best current workflow decisions. |
| Same-record continuity | Campaign, Calendar, Overview, and Create refer to one content identity. | Stronger than the canonical high-level flow description. |
| Optional large AI Assistant inside Create | Makes AI a primary tool without making it a gate. | Strong evolution toward collaborative use. |
| Caption + visual direction approval before image generation | Prevents cost/consequence and content replacement from happening implicitly. | Strong user-control improvement. |
| Ready locks content; schedule is separate | Makes approval and timing distinct and reversible. | Strong trust improvement. |
| Counted Unscheduled drawer | Provides a recovery path for content without dates while preserving identity. | Strong current-only operational addition. |
| Static auth previews | Communicate Calendar and Insights value without needing workspace data. | Helpful current-only acquisition pattern. |
| Security step-up before channel management | Makes sensitive connection state explicit. | Strong current-only security UX. |

## 14. Terminology comparison

| Canonical term | Current term | Meaning change | Assessment |
|---|---|---|---|
| Strategy | Campaigns | Changed from durable 30/60/90 direction to a time-bound executable plan. Durable strategy is intended to move into Business Profile. | Major intentional conceptual evolution, currently incomplete. |
| Knowledge Vault | Business Profile | Friendlier label, but current visible scope is also much smaller than canonical Vault memory. | Terminology improvement with capability weakening. |
| Content Studio / Content Creator | Create | Same production responsibility, simpler navigation label. | Matched. |
| Analytics | Insights | Suggests interpretation/action, though current behavior is primarily analytics. | Aspirational terminology; capability partially matched. |
| Approved | Ready | Reframes approval as operational readiness for solo users. | Sensible simplification; team approval semantics are lost. |
| Scheduled | Scheduled in MARKOS | Clarifies that a schedule exists in the product, not necessarily that publication has succeeded. | Strong honesty improvement. |
| Monthly content plan | Campaign week-by-week plan + Calendar | Planning moved upstream into Campaign, Calendar became operational. | Intentional structural divergence. |
| AI Marketing OS / agency replacement | Instagram marketing support / Marketing studio | Current positioning promises adaptable help rather than total replacement. | More credible simplification, narrower ambition. |

## 15. Confirmed findings versus inference

### Confirmed

- Canonical product definition, personas, screen inventory, user flows, closed-loop principles, Vault role, and AI-agent roles are explicit in the three complete canonical documents.
- Current navigation has seven destinations and no mounted Strategy, Media Library, Queue, Consultant, Team, or Admin destination.
- Current first-time onboarding has document and manual paths, two essentials, an information check, and an editable bilingual profile approval page.
- A live Campaign generated successfully from the approved profile.
- Campaign idea approval created one dated Draft without navigation, persisted through refresh, and then opened the same record in Create.
- Create supports manual entry without AI, generated Campaign copy/revision, optional assistant-generated caption/visual direction, explicit insertion, explicit media generation, Ready, scheduling, and live preview once media exists.
- Calendar displayed planned, scheduled, and unscheduled content and preserved record identity when returning to Create.
- Current Insights has 7/30-day reporting and honest empty states but no visible AI analysis/recommendation flow.
- Business Profile is a section-readiness summary whose edit action reuses onboarding.
- Arabic route direction is RTL; some dynamic statuses remain English.

### Inference, clearly labeled

- **Likely intentional evolution:** replacing Strategy with executable Campaigns; making AI optional in Create; using Ready for a solo-owner approval state; two-essential onboarding; granular approval boundaries.
- **Likely unfinished implementation:** closed-loop learning, AI Consultant, rich Business Profile/Vault, long-duration Campaigns, Calendar intelligence, queue operations, full media formats, billing/team/admin.
- **Possible conceptual regression:** durable strategy was removed as a page before an equivalent strategy surface appeared in Business Profile.
- **Impossible to determine from this evidence:** whether the verified account should have automatically resumed onboarding; whether direct Instagram publication currently succeeds; how accurately whole-business documents are extracted; how populated Insights behaves with real Instagram data; whether visible third-party authentication buttons are operational.

## 16. Final comparison

Current MarkOS has become a more coherent **human-in-control Campaign and content execution product** than the canonical documents described at interaction level. The strongest evidence is not visual polish; it is workflow continuity. A business profile grounds a Campaign, an approved idea becomes one dated Draft, that same Draft enters Create, AI output is inserted into real fields only after approval, generated media attaches to the same record, and explicit Ready/Schedule transitions carry it into Calendar. This is a meaningful product achievement and, in several places, a better user experience than the original high-level flow.

At concept level, however, the canonical MarkOS remains broader and more distinctive. Its core promise is not merely planning and production. It is a durable marketing memory plus a closed learning loop that converts observed performance and user feedback into better future decisions. The current product does not yet expose that loop. Business Profile is too shallow to serve visibly as the strategic/memory spine, and Insights stops at reporting rather than producing approved learning or the next Campaign.

Accordingly, the most accurate product description today is:

> **MarkOS is an emerging, business-informed Instagram Campaign and content workspace with unusually strong user-control and handoff mechanics; it has not yet become the continuously learning AI marketing operating system defined by the canonical concept.**

That difference should not be treated as a blanket failure. Several divergences are sensible product evolution. The audit’s central caution is narrower: if durable strategy, actionable Insights, and accepted learning do not become a visible loop, the product will retain the canonical vocabulary of an AI marketing agency while behaving primarily as a well-controlled Campaign and content-production tool.

## Appendix A. Evidence cross-reference

| Finding area | Canonical evidence | Current documentary/source evidence | Live route/state |
|---|---|---|---|
| Vision/personas | C-PRD §2–§3, pp. 3–8 | N-FLOW mental model; N-UI foundation | `/en` public landing |
| Onboarding | C-PRD §4.1, pp. 9–10; §10.1, p. 26 | N-FLOW Flow A; N-DEC onboarding decisions; `onboarding-panel.tsx` | `/en/onboarding`, greeting through profile approval |
| Vault/Profile | C-PRD §4.2, p. 10; §8, pp. 21–23; C-PLAN §4.1 | N-FLOW Vault semantics; `FinalVaultPanel` | `/en/app/knowledge`, `?mode=edit` |
| Strategy/Campaign | C-PRD §4.3–§4.4, pp. 10–11; §11.4, p. 29 | N-DEC Strategy/Campaign; `campaign-panel.tsx` | `/en/app/campaigns`, empty and generated |
| Create | C-PRD §4.5–§4.6, pp. 11–12; §10.2, p. 27 | N-FLOW Flow C; `ContentStudioPanel`, `content-studio-assistant.tsx` | `/en/app/content-studio`, manual, Campaign, AI, Ready, Scheduled |
| Calendar/schedule | C-PRD §4.4, §4.7, pp. 10–12 | N-FLOW Flow E; `calendar-panel.tsx` | `/en/app/calendar`, planned/scheduled/unscheduled/item focus |
| Insights/learning | C-PRD §4.8–§4.9, pp. 12–13; §10.3, p. 27 | N-FLOW Flow F; `FinalAnalyticsPanel` | `/en/app/analytics`, no-data state |
| Navigation/pages | C-PRD §11, pp. 28–31 | `app-shell.tsx`, route inventory | Authenticated shell and Settings |
| Settings/billing | C-PRD §11.9–§12, pp. 30–33; C-COST §6 | `settings-panel.tsx` | `/en/app/settings` sections |
| Bilingual/RTL | C-COST §6; current target documents | N-FLOW golden rules; `app-shell.tsx` | `/ar/app`, RTL verified |

## Appendix B. Audit artifacts and repository impact

- Only this Markdown report was created.
- No application code, configuration, documentation outside this report, database, local service, or external workspace other than the dedicated staging test account was modified.
- Disposable staging records created for verification: one approved profile, one 3-day Campaign, one Campaign-linked Draft, one standalone AI-assisted Scheduled post with generated media, and one standalone unscheduled Draft.
- Credentials are intentionally omitted.

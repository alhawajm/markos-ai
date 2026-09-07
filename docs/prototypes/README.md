# UI Prototype Status

Files in this directory are browser-rendered decision aids. They do not call MARKOS APIs, prove mounted application behavior, replace the build specification or experience flows, or authorize dependencies and backend contracts.

| Artifact | Current role | Status boundary |
| --- | --- | --- |
| `shared-foundation-comparison.html` | Compares bilingual typography, semantic palettes, density, shell behavior, and a dark companion. | Exploratory. IBM Plex and Tangerine Slate are leading lab candidates, not production fonts or tokens. |
| `create-workflow-prototype.html` | Connects the reviewed action hub, media-first editor, preview, Ready, and scheduling concepts. | Active design reference only. The mounted Create page has not yet adopted this composition; Carousel, Reel, Story, and Media Library elements are structural exploration. |
| `onboarding-pass-0-field-contract.html` | Records the Pass 0 field and navigation exploration that preceded implementation. | Historical/superseded as a behavior source. Use `docs/source/MARKOS_EXPERIENCE_FLOWS.md`, `docs/decisions.md`, `docs/ui-ux-decisions.md`, and current source for the implemented Onboarding contract. |

When a prototype is implemented, update this table instead of silently treating the HTML artifact as current application evidence. Preserve useful historical artifacts unless they expose secrets, customer data, or licensed source that the repository may not retain.

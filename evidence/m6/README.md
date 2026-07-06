# M6 Evidence Pack

M6 is not launch-accepted until every external provider gate has dated evidence attached locally and reviewed by the release owner.

Expected gates:

| Gate folder | Purpose |
| --- | --- |
| `build` | `verify`, `build`, performance, load, security, and RTL outputs for the release SHA. |
| `staging` | Live staging deploy URL, commit SHA, smoke test output, and cloud deploy status. |
| `meta-app-review` | Meta App Review submission, requested permissions/features, and approval or pending status. |
| `instagram-publishing` | Real image post and reel publish responses plus public proof links or screenshots. |
| `instagram-analytics` | Live analytics readiness, sync response, real metrics screenshots, and Vault learning evidence. |
| `payments` | CrediMax or BENEFIT credential/certification proof, webhook proof, live checkout, and paid invoice evidence. |
| `vat-compliance` | VAT compliance report for a paid invoice and final seller/legal wording approval. |
| `launch-signoff` | Go/no-go decision, defects reviewed, rollback readiness, and owner sign-off. |

Use the templates in `evidence/m6/templates` for artifact manifests and sign-off notes.

Initialize a local dated evidence pack with:

```bash
corepack pnpm evidence:m6 -- --init
```

This creates:

```text
evidence/m6/<yyyy-mm-dd>/<gate>/artifact-manifest.md
evidence/m6/<yyyy-mm-dd>/launch-signoff/launch-signoff.md
```

Strict launch acceptance uses:

```bash
corepack pnpm evidence:m6 -- --strict
```

Strict mode fails unless every gate has a completed non-pending manifest, at least one proof artifact beyond the manifest/template, launch sign-off says `Final decision: Go`, and no obvious text secrets are found.

Do not commit dated evidence folders. They are ignored by Git on purpose.

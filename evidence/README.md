# Launch Evidence

This folder defines the evidence collection convention for MARKOS AI launch gates.

Actual launch artifacts are intentionally ignored by Git because they can contain provider screenshots, app review details, payment proof, access tokens, customer data, or other sensitive material. Commit only README files and templates.

Use this pattern for local artifacts:

```text
evidence/m6/<yyyy-mm-dd>/<gate>/<artifact>
```

Before saving any artifact, redact:

- Access tokens, refresh tokens, webhook secrets, API keys, and client secrets.
- Payment card details, authorization codes, and gateway credentials.
- Customer names, phone numbers, emails, addresses, and Instagram handles unless explicit consent is recorded.
- Internal account IDs that are not needed to prove the gate.

Run the local evidence report with:

```bash
corepack pnpm evidence:m6
```

Create the dated folder structure and starter manifests with:

```bash
corepack pnpm evidence:m6 -- --init
```

Use strict mode only for release acceptance:

```bash
corepack pnpm evidence:m6 -- --strict
```

Strict mode fails until every gate has a completed manifest, proof artifacts beyond templates, launch sign-off is marked `Go`, and the text artifact scan finds no obvious unredacted secrets.

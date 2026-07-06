# Bahrain VAT Compliance Verification

This runbook closes the M6 VAT compliance verification gate for the billing behavior MARKOS supports today. It verifies generated invoices in code and records the launch caveats that still require operational input.

## Supported Rules

- Billing currency is BHD only.
- Money is stored in integer minor units. For BHD, the minor unit is fils.
- Bahrain VAT is calculated at 10 percent, stored as `1000` basis points.
- Exclusive VAT invoices calculate VAT from the stored net amount.
- Inclusive VAT invoices derive net from the stored gross amount and keep `netMinor + vatMinor = grossMinor`.
- Invoice downloads are workspace-scoped and render the stored VAT breakdown.
- Payment reconciliation checks the latest linked payment amount against invoice gross.

## Verification Endpoint

`GET /v1/billing/invoices/:invoiceId/vat-compliance`

Access:

- Workspace context is required.
- `billing:read` permission is required.
- The invoice must belong to the active workspace.

The endpoint returns a compliance report with explicit checks:

- BHD currency.
- Integer minor units.
- Non-negative amounts.
- 10 percent Bahrain VAT rate.
- VAT arithmetic for exclusive or inclusive pricing.
- Gross total equals net plus VAT.
- Issue timestamp exists.
- Linked payment amount matches invoice gross, when a payment exists.

## Automated Coverage

`apps/api/test/billing.test.ts` covers:

- Compliant Bahrain VAT invoice after checkout and capture.
- Broken VAT arithmetic is reported as non-compliant.
- Invoice PDF export is workspace-scoped.
- Another workspace cannot read an invoice PDF.
- Billing summaries remain scoped to the active workspace.
- Exclusive and inclusive VAT both preserve integer BHD fils.

## Launch Caveats

These items remain operational/legal inputs and should stay open until confirmed:

- Seller VAT registration number must be configured before production VAT invoices are issued.
- Customer VAT ID and reverse-charge handling are not yet modeled.
- A Bahrain tax advisor should review final invoice wording before public launch.
- Live payment gateway receipts must be attached once CrediMax, BENEFIT, or Stripe certification is complete.

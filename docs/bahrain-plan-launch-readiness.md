# Bahrain Plan Launch Readiness

This runbook tracks the M6 gate for launching Starter and Growth plans in Bahrain.

## Readiness Endpoint

`GET /v1/admin/bahrain-launch-readiness`

Access:

- Workspace context is required.
- `admin:read` permission is required.

The endpoint separates internal product readiness from external payment readiness:

- `planCatalogReady`: Starter and Growth exist, are active, use BHD, have positive integer fils pricing, have required quota limits, and have a 10 percent VAT breakdown.
- `gatewayReady`: at least one Bahrain local payment gateway, CrediMax or BENEFIT, has required credentials and webhook secret configured.
- `liveReady`: both `planCatalogReady` and `gatewayReady` are true.

## Current Plan Catalog

| Plan | Net | VAT | Gross | Currency |
| --- | ---: | ---: | ---: | --- |
| Starter | 18.000 BHD | 1.800 BHD | 19.800 BHD | BHD |
| Growth | 37.000 BHD | 3.700 BHD | 40.700 BHD | BHD |

All amounts are stored as integer fils.

## Required Gateway Environment

CrediMax can satisfy the Bahrain local gateway requirement when these are configured:

- `CREDIMAX_MERCHANT_ID`
- `CREDIMAX_API_PASSWORD`
- `CREDIMAX_WEBHOOK_SECRET`

BENEFIT can satisfy the Bahrain local gateway requirement when these are configured:

- `BENEFIT_MERCHANT_ID`
- `BENEFIT_API_KEY`
- `BENEFIT_WEBHOOK_SECRET`

Stripe remains an international fallback and does not by itself close the Bahrain local gateway requirement.

## Acceptance Evidence

Before marking the M6 launch item complete, collect:

- `GET /v1/admin/bahrain-launch-readiness` response with `liveReady: true`.
- Merchant certification proof for CrediMax or BENEFIT.
- A successful live checkout for Starter or Growth.
- A paid invoice with BHD fils, 10 percent VAT, and payment gateway reference.
- VAT compliance report for the paid invoice.

## Current Status

The code can verify plan catalog readiness now. The live launch item remains open until Bahrain merchant credentials, webhook secrets, and certification evidence are available.

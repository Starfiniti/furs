# Starfiniti FURS Kit

Unofficial infrastructure intended for open-source release for Slovenian fiscal verification of
invoices (`davčno potrjevanje računov`). It is developed by Starfiniti d.o.o.,
Pod gabri 33, 3000 Celje. It is not certified, endorsed, or operated by FURS.

The repository contains a strict TypeScript fiscal kernel, PostgreSQL workflow,
REST API, worker, operator console, receipt-code renderers, service clients and
platform adapter boundaries. It is a fiscalization engine—not an accounting or
invoice-calculation product.

## Current status

Local implementation is active and automated tests cover exact money/time,
ZOI, JWS, strict mTLS primitives, signed-response verification, official-schema
validation, business premises, invoice workflows, PostgreSQL idempotency,
outbox/retries/audit, REST intake, receipt codes and adapter replay.

The current local gate is 147 passing tests with no failures, skips or todos;
generated contracts and the 239-file repository secret scan pass, and the production
dependency audit reports no known vulnerabilities.

Production activation remains blocked until the requested FURS test certificate
arrives and the official test-environment gates pass. The payment/correction
scenario matrix also requires written review by a Slovenian accountant or tax
specialist. See `compliance/PHASE_*.md` and `docs/RELEASE_CHECKLIST.md`.
The latest source check also detected a changed SPOT online-retail guidance
digest; payment/adaptor policy remains frozen until that change is reviewed.

## Invariants

- Exact decimal strings are the legal money source; JavaScript floating point is not.
- One immutable Europe/Ljubljana issue time produces every required date form.
- Retries reuse the fiscal identity, issue time, canonical payload and ZOI.
- Fiscal sequences are never reused; rolled-back reservations become gaps.
- Confirmed documents are immutable; corrections are new linked documents whose
  outbound FURS payload derives its reference from the confirmed original record.
- Every submission is schema validated, RS256-signed, sent over strict mTLS, and
  accepted only after signed-response chain/signature verification.
- Private keys, P12 bytes, passwords, raw JWS tokens and full invoices are never logged.
- Payment/business policy stays in a reviewed upstream decision layer.

## Repository map

```text
apps/api                 authenticated REST API and readiness/metrics
apps/worker              durable FURS delivery and bounded retries
apps/console             same-origin redacted operator console
packages/core            domain, canonicalization, crypto, schema and transport
packages/persistence-*   PostgreSQL migrations, repository, outbox and audit
packages/codes           exact 60-digit data plus QR/PDF417/Code128
packages/service-*       OpenAPI, TypeScript/PHP clients and adapter boundary
packages/runtime-node    file-mounted secrets and operational health
packages/adapter-*       Next.js, WooCommerce, Medusa, Stripe and Shopify events
packages/testkit         replay fakes, fixtures and leak assertions
compliance               source register and phase evidence
deployment               PostgreSQL role init and Prometheus alert rules
```

## Development

Requires Node.js 24 and pnpm through Corepack.

```bash
corepack pnpm install
corepack pnpm check
node scripts/check-official-sources.mjs
```

Generate the checked-in OpenAPI contract after contract changes:

```bash
corepack pnpm contract:generate
```

After every external P0-P7 report and human approval exists, populate the
protected release-evidence manifest described in `docs/RELEASE_CHECKLIST.md` and
run `corepack pnpm release:verify`. The checked-in example intentionally fails.

## Self-hosted runtime

1. Copy `.env.example` to a private environment file and set only non-secret
   configuration plus paths to protected secret files.
2. Mount the FURS P12, its passphrase, reviewed schema, FURS trust anchors,
   database passwords, separate 32+ character read/write API tokens and the
   webhook secret read-only.
3. Keep `FURS_ENVIRONMENT=test` until every release gate is signed off.
4. Run `docker compose up --build` after the certificate and trust material are present.
5. Open `http://127.0.0.1:8080/console` and provide the API token; it remains
   only in page memory.

Full setup and security notes are in `docs/DEPLOYMENT.md`.

## License

Copyright 2026 Starfiniti d.o.o. Licensed under the
[Apache License 2.0](LICENSE). The standalone adapters are covered by the same
license; any future adapter that embeds into a copyleft platform must undergo a
separate compatibility review. See [NOTICE](NOTICE),
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and
[CONTRIBUTING.md](CONTRIBUTING.md).

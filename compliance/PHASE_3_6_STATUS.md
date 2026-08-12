# Phases 3–6 implementation status

Last updated: 12 August 2026
Gate status: local controls implemented; external/integration gates incomplete

## Phase 3 — fiscal workflow

Implemented immutable prepared commands, explicit state transitions, idempotency,
correction/cancellation linkage and confirmed-original outbound protocol references,
structured failure classification, bounded retry,
device-failure/VKR guard and redacted attempt hashes. Local tests cover standard,
correction, rejection, timeout/retry, manual review and invalid signed responses.
Explicit subsequent submissions remain `ISSUED_WITHOUT_EOR` across retries and
stale-worker recovery.

Not yet proven: official test-environment timeout/subsequent-submit/correction paths.

## Phase 4 — PostgreSQL service

Implemented schema constraints, non-reused/idempotent sequences, fiscal documents,
append-only attempts/audit, transactional outbox, `SKIP LOCKED` claims, stale-lease
recovery, reconciliation enqueueing, authenticated API, worker, readiness and metrics.
Migrations are digest locked. Read/write credentials are separated and rate limited.
Terminal results atomically enqueue redacted, hash-checked, HMAC-signed webhooks;
the worker has an alertable database heartbeat. PGlite migrations and repository
tests pass.

Not yet proven: real multi-connection PostgreSQL locking/crash behavior, legal-window
drill, production backup/PITR, load target and FURS-backed reconciliation.

## Phase 5 — codes and contract

Implemented OpenAPI 3.1 with validated examples and modeled success envelopes,
TypeScript and PHP clients, public exact-decimal coverage
for all core seller-tax groups including flat-rate compensation, exact official 60-digit vectors,
QR version 2/M, PDF417 error level 2, and official 2–6-part Code 128 segmentation.

Not yet proven: physical print/readability and independent ISO/GS1 verification.

## Phase 6 — adapters

Implemented replay-safe event boundaries for Next.js/custom, WooCommerce, Medusa,
Stripe and Shopify. Each requires an already verified platform event and explicit
reviewed fiscalization policy. Shopify, WooCommerce and Stripe include preferred
entry points that verify signatures over untouched raw requests before marking an
event authenticated. Medusa uses the current v2.18 `payment.captured` and
`payment.refunded` workflow events. Duplicate events return the original document.

Not yet proven: installable platform-specific distribution, live sandbox webhooks,
platform admin UX and accountant-approved refund/payment scenario mappings.

## Release blockers retained

- The 12 August source check detected a changed SPOT online-retail guidance
  digest; payment/adaptor policy release is frozen pending the recorded review.
- FURS test certificate and official environment evidence;
- Slovenian accountant/tax-specialist scenario signoff;
- real PostgreSQL/concurrency and operational hardening evidence;
- security, rotation, restore, soak and load reviews in the release checklist.

## Current local evidence

- `corepack pnpm check`: 139 passed, 0 failed, 0 skipped, 0 todo; the
  production-only bundle layout also passes.
- Secret scan: 226 repository files checked.
- `corepack pnpm audit --prod --audit-level=high`: no known vulnerabilities.
- OpenAPI generation/check and PHP syntax validation pass.
- Compose, Prometheus and GitHub Actions files parse as YAML; Docker runtime
  validation could not run because Docker is not installed on this workstation.

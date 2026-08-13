# Phases 3–6 implementation status

Last updated: 13 August 2026
Gate status: local controls implemented; external/integration gates incomplete

## Phase 3 — fiscal workflow

Implemented immutable prepared commands, explicit state transitions, idempotency,
correction/cancellation linkage and confirmed-original outbound protocol references,
structured failure classification, bounded retry,
device-failure/VKR guard and redacted attempt hashes. Local tests cover standard,
correction, rejection, timeout/retry, manual review and invalid signed responses.
Explicit subsequent submissions remain `ISSUED_WITHOUT_EOR` across retries and
stale-worker recovery.

Official test evidence now proves standard confirmation, deterministic signed
rejection, a linked correction and subsequent submission with unchanged identity,
issue time, payload and ZOI. A controlled connectivity interruption with measured
recovery timing remains separate and incomplete.

## Phase 4 — PostgreSQL service

Implemented schema constraints, non-reused/idempotent sequences, fiscal documents,
append-only attempts/audit, transactional outbox, `SKIP LOCKED` claims, stale-lease
recovery, reconciliation enqueueing, authenticated API, worker, readiness and metrics.
Migrations are digest locked. Read/write credentials are separated and rate limited.
Terminal results atomically enqueue redacted, hash-checked, HMAC-signed webhooks;
the worker has an alertable database heartbeat. PGlite migrations and repository
tests pass.

A current native PostgreSQL 17.10 run with all 13 migrations proved 128 unique
concurrent allocations, 64-to-1 idempotent reservation, competing `SKIP LOCKED`
claims, stale-lease recovery and a separate logical restore. A live worker-stop
drill queued one test invoice and later confirmed the same document and sequence
after restart. Not yet proven: legal-window drill, production backup/PITR, load
target and FURS-backed reconciliation under failure.

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
- independent cryptographic/security review and a second certificate for rotation;
- Slovenian accountant/tax-specialist scenario signoff;
- reviewed PostgreSQL evidence plus production PITR and operational hardening;
- production PITR, alert-routing, rotation, completed soak and approved load evidence.

## Current local evidence

- `corepack pnpm check`: 157 passed, 0 failed, 0 skipped, 0 todo; the
  production-only bundle layout also passes.
- Secret scan passed; protected runtime credentials and detailed evidence remain
  outside the repository.
- Native PostgreSQL 17.10 concurrency/crash and separate logical-restore
  integrity rehearsals passed; production PITR remains external.
- `corepack pnpm audit --prod --audit-level=high`: no known vulnerabilities.
- OpenAPI generation/check and PHP syntax validation pass.
- Current GitHub PR checks build the production image and report green test and
  container-security jobs; the official-source job remains intentionally red for
  the changed SPOT online-retail digest pending accountant review.

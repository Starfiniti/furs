# Handoff

## Implemented locally

- Pure fiscal core with exact money/time, ZOI, JWS, PKCS#12/PEM signer,
  pinned Draft-04 schemas, strict mTLS, typed signed responses and premise/invoice models.
- Explicit immutable workflow, corrections, outage/error taxonomy and bounded retry policy.
- PostgreSQL schema/repository with idempotent non-reused sequence reservation,
  append-only evidence, digest-locked migrations, transactional outbox, worker
  leases, heartbeat and crash recovery.
- Authenticated Fastify API, worker, operator console, OpenAPI plus TypeScript/PHP clients.
- Separate read/write API credentials, rate limiting and durable signed result webhooks.
- Official 60-digit receipt-code vectors and QR/PDF417/Code128 rendering.
- Replay-safe Next.js, WooCommerce, Medusa, Stripe and Shopify adapter boundaries;
  Shopify, WooCommerce and Stripe verify the untouched raw webhook before intake,
  and Medusa uses the current v2.18 payment event names.
- File-mounted runtime secrets, clock/certificate readiness, Docker Compose and alerts.
- Fail-closed evidence runners for the FURS test service, real PostgreSQL,
  restored databases, certificate rotation, controlled load and a two-day soak.

Local verification: 147 tests pass with no failures, skips or todos, the
239-file secret scan passes, the production-only bundle layout is verified, and
the production dependency audit reports no known vulnerabilities.

A native temporary PostgreSQL 17.10 run passed 128 unique concurrent sequence
allocations, 64-way idempotent reservation, competing worker claims and crash
recovery. A separate logical restore passed the read-only integrity verifier;
see `compliance/LOCAL_POSTGRES_EVIDENCE_2026-08-12.md`.

## External release gates

- FURS test certificate request was sent by Dejan Kletečki for Starfiniti d.o.o.
- When received, install it only in the protected local certificate directory and
  execute the Phase 1 echo, invoice-response and premise lifecycle evidence runs.
- Complete the official test-environment timeout/subsequent-submit/correction tests.
- Obtain written accountant/tax-specialist approval for the scenario matrix.
- Review the changed 12 August 2026 SPOT online-retail page digest before
  accepting a new baseline or releasing payment/adaptor policy.
- Preserve and review formal PostgreSQL evidence, then complete production PITR,
  Docker/container, soak, load, certificate rotation and external security tests.
The public repository, all current packages and standalone adapters are licensed
under Apache-2.0 by Starfiniti d.o.o.; contributions use DCO 1.1 sign-off.

No production activation is permitted before `docs/RELEASE_CHECKLIST.md` is complete.

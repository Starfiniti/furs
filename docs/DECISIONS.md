# Architecture decision log

## ADR-001 — Clean implementation rather than fork

**Status:** Accepted for foundation phase
**Date:** 2026-08-12

### Decision

Build a clean Starfiniti implementation from current official sources. Existing open-source libraries may be inspected for ideas but are not the implementation base or source of truth.

### Reasons

- currently visible libraries are incomplete or stale;
- at least one current TypeScript library decodes responses without cryptographic verification;
- date/amount canonicalization in a fiscal implementation must be independently validated;
- clean boundaries are needed for durable outbox, idempotency, certificate isolation, and multiple platform adapters;
- a permissive core license is desirable.

### Consequences

- higher initial engineering effort;
- lower inherited compliance and licensing risk;
- all critical behavior must have independent tests and test-environment evidence.

## ADR-002 — Fiscalization engine, not full invoicing system

**Status:** Accepted

The engine receives finalized commands and does not own commercial invoice calculation, accounting policy, or order/payment orchestration.

## ADR-003 — PostgreSQL as v1 workflow authority

**Status:** Accepted

PostgreSQL provides idempotency, sequence allocation, durable outbox, audit, and reconciliation. Redis is optional and non-authoritative.

## ADR-004 — Single legal entity per deployment first

**Status:** Accepted

Multi-tenant managed service is deferred until key isolation, authorization, auditing, and operations are proven.

## ADR-005 — Apache-2.0 core; ecosystem-specific adapters separately licensed

**Status:** Accepted
**Date:** 2026-08-12

The repository, service, SDK and current standalone adapters are Apache-2.0,
with copyright held by Starfiniti d.o.o. Contributions use DCO 1.1 sign-off.
The WooCommerce adapter is a separable HTTP/event integration and contains no
WordPress dependency or plugin code. Any future adapter embedded into a copyleft
runtime requires an explicit compatibility decision before implementation.

## ADR-006 — Exact money as canonical strings and bigint minor units

**Status:** Accepted for Phase 1
**Date:** 2026-08-12

Public fiscal amounts are canonical decimal strings with exactly two fractional digits. The core stores them as `bigint` minor units and emits the original canonical numeric token when building protocol JSON. JavaScript `number` is not part of the legal-money model.

## ADR-007 — Explicit Europe/Ljubljana wall-clock resolution

**Status:** Accepted for Phase 1
**Date:** 2026-08-12

The legal invoice time is parsed only from `YYYY-MM-DDTHH:mm:ss` without an offset. Nonexistent DST times are rejected. Ambiguous overlap times are rejected unless the caller explicitly selects the earlier or later occurrence. All protocol representations derive from this immutable value and do not depend on the host process time zone.

## ADR-008 — Validation creates the transportable payload boundary

**Status:** Accepted for Phase 2
**Date:** 2026-08-12

Domain mappers serialize exact fiscal number tokens and immediately validate the complete JSON against the digest-locked official schema. Only the opaque `ValidatedFursPayload` result is intended to cross into signing and transport orchestration. Plain domain values or unvalidated JSON are not transport commands.

## ADR-009 — FURS field semantics refine generic schema formats

**Status:** Accepted for Phase 2
**Date:** 2026-08-12

The official JSON schema assigns `date-time` to values whose official field tables/examples use three wire forms: date-only premise validity, local whole-second invoice time, and UTC response timestamps that can contain fractions. Schema compilation uses a FURS-specific validator covering those documented forms; strongly typed domain fields enforce the narrower legal representation for each outbound property.

## ADR-010 — Idempotent sequence reservation burns gaps

**Status:** Accepted
**Date:** 2026-08-12

PostgreSQL `nextval` is the sole allocator. A stable platform idempotency key
reserves one value, including under concurrent replay. Rollbacks and losing race
allocations create gaps; values are never decremented or reused.

## ADR-011 — Durable acceptance and asynchronous delivery

**Status:** Accepted

The API returns only after document, idempotency, immutable payload, outbox and
audit commit together. The worker owns FURS delivery, signed-response verification,
attempt evidence, bounded retries, stale-lease recovery and manual review.

## ADR-012 — Secrets are file-mounted; PostgreSQL stores metadata only

**Status:** Accepted

The Node runtime loads P12/passphrase, API token and database passwords from
protected read-only files. Private key material, passwords and raw tokens are not
stored in PostgreSQL or returned through operational endpoints.

## ADR-013 — Platform adapters consume reviewed finalized commands

**Status:** Accepted

Adapters authenticate/replay-protect events and propagate results. They do not
infer Slovenian tax treatment from payment success and do not implement crypto.
Every fiscalize/skip decision references an upstream reviewed policy version.

## ADR-014 — External evidence remains a release gate

**Status:** Accepted

Certificate-independent code may be completed locally while the test certificate
is pending. No local simulation substitutes for official FURS test-environment,
accountant, security, soak, rotation or restore evidence required by P0–P7.

## ADR-015 — Separate read and fiscalize credentials

**Status:** Accepted
**Date:** 2026-08-12

Single-entity v1 uses distinct file-mounted bearer credentials. A read
credential can call only `GET`/`HEAD` routes; invoice/premise submission,
device configuration, retry, reconciliation and echo require the write
credential. Both are rate limited, and an operator deployment still requires
SSO/MFA at its private reverse proxy.

## ADR-016 — Subsequent submission is durable state

**Status:** Accepted
**Date:** 2026-08-12

An invoice already issued under the approved network-outage procedure enters
the service only with the explicit official `SubsequentSubmit` flag. It is
stored as `ISSUED_WITHOUT_EOR`, and ordinary retries or worker lease recovery
must not erase that distinction. Issuing-device/software failure remains a
different blocked path requiring the operator/VKR procedure.

## ADR-017 — Terminal results use a transactional webhook outbox

**Status:** Accepted
**Date:** 2026-08-12

Terminal confirmation, rejection and manual-review transitions enqueue a
redacted webhook in the same database transaction. Stored bodies are
SHA-256-checked before delivery and signed with HMAC-SHA256. Delivery retries
are bounded and exhaust to a durable dead-letter state without changing the
fiscal result.

## ADR-018 — Applied database migrations are digest locked

**Status:** Accepted
**Date:** 2026-08-12

Every applied migration name and SHA-256 is recorded in PostgreSQL. Startup
refuses an edited historical migration. New behavior requires a new migration;
the ledger itself contains no fiscal or secret data.

## ADR-019 — Release evidence is executable and environment locked

**Status:** Accepted
**Date:** 2026-08-12

Release evidence is produced by version-controlled runners that validate their
target before acting and emit only redacted identifiers, states, timings and
cryptographic hashes. FURS, certificate-rotation and load runners refuse a
production target. PostgreSQL destructive setup is restricted to the exact
dedicated `furs_evidence` database with an explicit confirmation value.

An implemented runner is not evidence that its external gate passed. Its output,
commit SHA, environment metadata and named reviewer decision must be stored in
the protected release archive after execution.

## ADR-020 — Certificate and official-source provenance is active deployment state

**Status:** Accepted
**Date:** 2026-08-12

Runtime startup activates exactly one certificate-metadata profile for the legal
entity and environment; secret material remains file-mounted. Provisioning records
only named, dated, reviewed source digests in an append-only ledger. A placeholder
reviewer or conflicting certificate activation fails closed.

## ADR-021 — Submission and reconciliation share one active delivery lease

**Status:** Accepted
**Date:** 2026-08-12

`SUBMIT` and `RECONCILE` are two reasons to deliver the same immutable fiscal
document, not independent deliveries. PostgreSQL enforces one active job across
both types. Webhook delivery has its own active-job uniqueness boundary.

## ADR-022 — Correction references are derived from confirmed evidence

**Status:** Accepted
**Date:** 2026-08-12

Callers identify the internal original document but cannot supply its FURS
protocol identity. The API resolves the reference from a confirmed invoice in
the configured legal entity and places that original premise, device, sequence
and issue time in the new correction/cancellation payload. The new document gets
its own non-reused sequence, issue time and ZOI.

## ADR-023 — Authoritative fiscal retention fails closed pending legal schedule

**Status:** Accepted for pre-production
**Date:** 2026-08-12

The service provides no generic delete or retention job for fiscal documents,
identity, attempts, audit, idempotency or sequence state. `docs/DATA_RETENTION_PRIVACY.md`
defines the technical hold and minimization controls. Production remains blocked
until the data controller and Slovenian compliance reviewers approve exact record
class schedules and backup-expiry behavior.

## ADR-024 — Runtime images contain production-only portable bundles

**Status:** Accepted
**Date:** 2026-08-12

The container build uses pnpm's injected-workspace deployment model to create
separate API, worker and persistence bundles. It does not use workspace
`pnpm prune`, which fails non-interactively and can retain development packages.
Package file allowlists exclude sources, tests and build metadata. An executable
layout verifier proves entry-point imports, migrations, console assets and the
absence of PGlite/TypeScript before the secret scan. Evidence scripts remain in
a separate non-production Docker target.

The Node and PostgreSQL tags are also pinned to reviewed multi-platform manifest
digests in `deployment/container-images.json`. Image updates require an explicit
baseline change and renewed vulnerability evidence. A networked CI check compares
the current tag digest and update timestamp with that reviewed baseline so a
repointed tag cannot become silent dependency drift.

## ADR-025 — The public contract is executable documentation

**Status:** Accepted
**Date:** 2026-08-12

Every public success envelope has a reusable schema in OpenAPI and the Fastify
route, and representative invoice/premise/device/result/error examples validate
against their published component schemas. Compliance-sensitive request examples
also pass through the live API contract. Unexpected implementation failures are
generic HTTP 500 responses; malformed caller input is a redacted HTTP 400
`FURS_REQUEST_VALIDATION` response.

## ADR-026 — Final release approval is a verified external manifest

**Status:** Accepted
**Date:** 2026-08-12

Sensitive evidence stays in a protected release archive. A manifest outside the
repository records only hashes, test-environment identifiers, quantitative gate
results and named dated approvals. `release:verify` binds it to a clean exact
commit and fails closed across every P0-P7 evidence class, including the current
official-source state and final SPDX license. The deliberately incomplete example
manifest can never serve as approval.

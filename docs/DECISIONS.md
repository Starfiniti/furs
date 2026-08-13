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

The Node runtime uses the reviewed Alpine variant and removes npm and Corepack
after the production bundles are assembled. Package managers are build tools,
not runtime dependencies; excluding them removes their transitive vulnerability
surface without weakening the image scan gate.

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

## ADR-027 — Clock readiness uses a direct multi-server SNTP quorum

**Status:** Accepted for pre-production
**Date:** 2026-08-13

The FURS Echo endpoint does not provide the HTTP `Date` header previously
assumed by runtime health monitoring. Runtime clock health therefore uses
direct SNTP observations from an explicitly reviewed list of at least two
servers. Responses must be synchronized, usable-stratum server replies,
correlated to the exact request and within a bounded round trip. The median of
a configured response quorum is compared with the maximum drift threshold.

Clock observations expire after five minutes. API readiness and every worker
submission fail closed when the observation is missing, stale or outside the
drift bound; worker retries remain bounded and no FURS request is sent while the
gate is closed. NTP server selection and network reachability remain deployment
controls and must be included in operational review.

Plain SNTP is not cryptographically authenticated. This control detects
ordinary drift and unhealthy time sources; it is not proof against a network
attacker controlling every configured path. Production approval must prefer
controlled infrastructure time sources, restrict UDP/123 at the network edge
and explicitly review whether authenticated NTS is required by the deployment
threat model.

## ADR-028 — Fiscal DB privileges use narrow executable boundaries

**Status:** Accepted for pre-production
**Date:** 2026-08-13

The live FURS test path exposed two PostgreSQL privilege assumptions that unit
tests alone did not reproduce. Premise confirmation requires worker `SELECT` on
the internal premise identifier in addition to its existing lifecycle `UPDATE`.
Invoice sequence reservation uses row locks, which require broader table rights
than the API role should hold.

The worker receives only `SELECT (id)` on `business_premises`. Sequence locking
and allocation execute through the exact owner-controlled
`reserve_invoice_sequence(uuid,text,text,text)` function with `SECURITY DEFINER`,
a fixed `pg_catalog, furs` search path, revoked `PUBLIC` execution and explicit
`furs_api` execution. The API receives no general mutation right on legal
entities. Operator-created retry jobs seed their counter from the append-only
maximum fiscal attempt so attempt identities never restart or collide.

When FURS response verification succeeds but the terminal DB transaction fails,
the fallback manual-review attempt preserves the response hash and verified
certificate fingerprint. Raw signed tokens remain excluded.

## ADR-029 — Alert routing evidence is scoped to the exercised receiver

**Status:** Accepted for pre-production
**Date:** 2026-08-13

Prometheus rule evaluation and Alertmanager notification routing are separate
controls. `promtool` tests prove the committed expressions and hold times. The
alert-delivery evidence runner then uses an official checksum-verified
Alertmanager binary and a loopback webhook to prove that every required release
category traverses the actual grouping and notification path.

Local loopback evidence must record `productionRoutingVerified: false`. It cannot
approve a production receiver, on-call escalation, authentication, network
policy or delivery service. Those remain named deployment evidence rather than a
property inferred from a successful local webhook.

## ADR-030 — Inbound cryptographic transports have explicit semantic and size bounds

**Status:** Accepted for pre-production
**Date:** 2026-08-13

Strict TLS and a valid signature do not make every peer-controlled byte sequence
safe to process. FURS request and response bodies are bounded to 1 MiB, and
response stream errors/aborts settle through explicit fail-closed outcomes.
Interrupted responses are connection failures eligible only for the existing
bounded immutable retry path; an oversized response is not retried as success.

JWS verification supports the documented Base64URL RS256 form only. Unsupported
critical-header semantics and `b64:false` are rejected even when a token is
otherwise correctly signed. Configured mTLS and webhook URLs also reject query
strings so credentials cannot migrate from protected files into URLs.

## ADR-031 — Device-failure evidence cannot be inferred from network retries

**Status:** Accepted for pre-production
**Date:** 2026-08-13

A technical issuing-device drill uses a dedicated test-device identity, marks it
non-operational and submits one fresh ordinary command with
`subsequentSubmit: false`. Passing evidence requires the explicit
`FURS_DEVICE_FALLBACK_REQUIRED` boundary before any fiscal document or outbox job
exists, and the device remains non-operational after the drill.

This result proves only the software boundary. It must record human VKR execution
and production approval as false until a named operator and Slovenian
accounting/legal reviewer complete the paper/sales-book procedure and later
reconciliation. A connectivity-outage retry or ordinary FURS test invoice cannot
substitute for that evidence.

## ADR-032 — Worker concurrency and PostgreSQL claim capacity are one bound

**Status:** Accepted for pre-production
**Date:** 2026-08-13

The worker's configured concurrency is also the maximum atomic PostgreSQL
`SKIP LOCKED` outbox claim size. Configuration, worker validation, repository
validation and the digest-locked database function therefore share one hard
upper bound. A real PostgreSQL regression test must exercise a claim above the
former ceiling so a configuration-only change cannot silently fail at runtime.

The default remains 1. The upper bound of 250 exists for explicitly approved,
bounded Phase 7 evidence and is not a production sizing recommendation. A
failed throughput result does not justify increasing this bound or repeating a
shared-service load test without a capacity review and new approval.

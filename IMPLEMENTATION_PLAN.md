# Implementation plan — Starfiniti FURS Kit

## Goal

Deliver a production-ready open-source engine for Slovenian fiscal verification of invoices with:

- a pure TypeScript SDK;
- a self-hosted language-neutral REST service;
- durable PostgreSQL processing;
- optional receipt-code generation;
- integration adapters;
- a minimal operator console;
- an AI coding skill that keeps future implementations aligned with verified rules.

The first production target is a **single legal entity per service deployment**. Multi-tenant hosting comes only after certificate isolation, authorization, auditing, and operational controls are proven.

---

## Phase 0 — Compliance baseline and repository controls

### Deliverables

- Official-source register with document version, publication date, retrieval date, and digest.
- Requirements matrix with stable IDs.
- Architecture decision records.
- Threat model and data classification.
- Test-certificate request sent to FURS.
- Initial accountant/tax-advisor scenario matrix.
- CI skeleton and source-change detection.

### Work

1. Confirm the latest FURS technical-documentation version and schemas.
2. Download official schemas during a controlled build step and pin their SHA-256 digests.
3. Record the exact production/test endpoints and TLS expectations.
4. Map legal/operational requirements to testable software behavior.
5. Define the supported v1 invoice scenarios and explicitly list unsupported scenarios.
6. Get a written review of payment-method and correction scenarios from a Slovenian accountant/tax specialist.
7. Define secret-storage options for local, Docker, and production deployments.

### Gate P0

- No unresolved conflict in requirements required by Phase 1.
- Test certificate request submitted.
- Every Phase 1 task maps to at least one requirement ID.
- Security owner and compliance reviewer identified.

---

## Phase 1 — Cryptographic and transport spike

This phase must be a small command-line program and tests. No database, UI, or platform adapter yet.

### Deliverables

- Load a FURS test `.p12` certificate safely.
- Extract certificate metadata and validate expiry/purpose.
- Produce exact canonical ZOI input.
- Sign ZOI input with RSA-SHA256 and derive the required MD5 digest of the signature.
- Build and sign outbound JWS using RS256 and required certificate header fields.
- Establish mutual TLS to the official test echo endpoint.
- Parse, cryptographically verify, and schema-check the signed FURS response.
- Capture redacted fixtures and hashes for regression testing.

### Required design

- Use Node native `crypto`/TLS primitives where practical.
- Isolate signer behind an interface so file-based P12, PEM, Vault/OpenBao, PKCS#11, and cloud KMS/HSM implementations can be added.
- The verifier must validate signature, certificate chain, validity period, and expected trust relationship.
- Time and amount canonicalization must be pure functions with golden tests.

### Gate P1

- Echo succeeds against FURS test environment with strict TLS.
- Response signature verification fails when any response component is tampered with.
- Golden ZOI tests pass byte-for-byte.
- DST and decimal-edge tests pass.
- No secret appears in logs or test snapshots.
- A second developer reviews cryptographic code and test evidence.

---

## Phase 2 — Core domain, schemas, and business-premise operations

### Deliverables

- `@starfiniti/furs-core` package.
- Official Draft-04 JSON-schema validation integration.
- Internal strongly typed domain model that is independent of transport JSON.
- Canonical mappers between domain and FURS payloads.
- Register, update, and close business premises.
- Explicit support for real-estate and mobile premise identifiers required by v1 scope.
- Clear extension boundary for vending-machine premises.

### Core value types

- `SlovenianTaxNumber`
- `OperatorIdentity`
- `BusinessPremiseId`
- `ElectronicDeviceId`
- `InvoiceSequence`
- `FiscalInvoiceIdentity`
- `LocalInvoiceDateTime`
- `DecimalAmount`
- `VatRate`
- `MessageId`
- `ZOI`
- `EOR`

### Gate P2

- Every outbound payload passes pinned official schema validation.
- Invalid data cannot reach the transport layer.
- Round-trip tests cover all v1 domain fields.
- Premise lifecycle works in the FURS test environment.
- No application framework or database dependency exists in `core`.

---

## Phase 3 — Fiscal invoice workflow

### Deliverables

- Standard invoice fiscalization.
- All tax groups required by the approved v1 scenario matrix.
- Operator identity rules.
- Corrections/cancellations as new linked fiscal documents.
- Explicit subsequent-submission support for interrupted FURS connectivity.
- Explicit device/software-failure guard and operator/VKR fallback boundary.
- Structured FURS error model.
- Machine-readable result with ZOI, EOR, status, timestamps, and evidence hashes.

### Rules

- The caller supplies a finalized command; the fiscal service does not recalculate commercial invoice totals.
- The command is persisted before network delivery.
- The fiscal identity and issue time become immutable once prepared.
- A retry reuses the exact same canonical payload and ZOI.
- A correction references the original fiscal document and receives a new identity.

### Gate P3

- Standard, correction, rejected, timeout, and subsequent-submit paths pass integration tests.
- Tampered and invalid FURS responses are rejected.
- Repeated idempotency keys return the original operation/result.
- Concurrent commands cannot allocate the same sequence.

---

## Phase 4 — PostgreSQL service, outbox, retries, audit, and reconciliation

### Deliverables

- `apps/api` and `apps/worker`.
- PostgreSQL migrations and repositories.
- Transactional outbox.
- Idempotency ledger.
- Sequence allocator with database locking/uniqueness.
- Retry scheduler and dead-letter/manual-review state.
- Reconciliation job.
- Append-only audit events and evidence hashes.
- Health/readiness endpoints and metrics.

### State model

```text
DRAFT
READY
SENDING
CONFIRMED
ISSUED_WITHOUT_EOR
RETRY_PENDING
REJECTED
MANUAL_REVIEW
REVERSED
```

State transitions must be explicit and tested. Direct arbitrary status updates are forbidden.

### Suggested tables

- `legal_entities`
- `certificate_profiles`
- `business_premises`
- `electronic_devices`
- `invoice_sequences`
- `fiscal_documents`
- `fiscal_attempts`
- `outbox_jobs`
- `audit_events`
- `webhook_deliveries`
- `compliance_source_versions`

### Critical constraints

- Unique fiscal identity: `(legal_entity_id, business_premise_id, electronic_device_id, invoice_sequence)`.
- Unique idempotency key per legal entity and operation class.
- Confirmed records cannot be overwritten through ordinary repository methods.
- Store certificate metadata/fingerprint/expiry in PostgreSQL; store secret material in a dedicated secret provider or envelope-encrypted form.

### Gate P4

- Crash-recovery tests prove no command is lost between DB commit and delivery.
- Worker restart does not duplicate fiscal identities.
- Oldest pending/retry age is observable and alertable.
- Connection-outage flow can meet the legally required later-submission window.
- Device/software-failure drill correctly blocks ordinary electronic issuance and directs the approved VKR fallback.
- Audit events can reconstruct what happened without exposing sensitive content.

---

## Phase 5 — Receipt codes and service contract

### Deliverables

- `@starfiniti/furs-codes` optional package.
- Exact 60-digit code data construction and checksum.
- QR support first.
- PDF417 and segmented Code128 support after independent verification.
- OpenAPI document and generated TypeScript/PHP clients.

### API surface

```text
POST /v1/furs/echo
POST /v1/business-premises
PATCH /v1/business-premises/:id
POST /v1/fiscal-invoices
GET  /v1/fiscal-invoices/:id
POST /v1/fiscal-invoices/:id/retry
POST /v1/reconciliation/run
GET  /health/live
GET  /health/ready
```

`POST /v1/fiscal-invoices` requires an `Idempotency-Key` header.

### Gate P5

- Receipt-code payload matches independent test vectors.
- OpenAPI examples pass schema validation and contract tests.
- API does not expose certificate material or raw signed tokens.

---

## Phase 6 — Integration adapters

Build adapters one by one. Each adapter maps platform events to the same canonical service contract.

### Order

1. Custom/Next.js integration reference.
2. WooCommerce adapter.
3. Medusa adapter.
4. Stripe event adapter.
5. Shopify adapter.

### Adapter responsibilities

- decide when an upstream invoice is finalized;
- obtain the correct legal entity, premise, device, sequence policy, operator, payment context, and totals;
- create a deterministic idempotency key;
- send the fiscal command;
- store returned status/ZOI/EOR in platform metadata;
- render status and required receipt fields;
- surface failures to an operator;
- never hide a rejected or pending fiscalization.

### Explicit non-goal

Adapters must not independently implement cryptography, date formatting, ZOI, JWS, certificate handling, or FURS transport.

### Gate P6

- Each adapter has replay-safe webhook/event tests.
- Duplicate events cannot create duplicate fiscal documents.
- Refund/cancellation flows are approved in the scenario matrix.
- Platform administrators can identify pending/manual-review items.

---

## Phase 7 — Hardening and production release

### Required work

- Two-day continuous stable test against the FURS test environment.
- Load and concurrency test for expected peak plus safety margin.
- Certificate rotation rehearsal.
- TLS trust-chain rotation rehearsal.
- Database backup/restore and point-in-time recovery test.
- Incident runbooks, including separate connection-outage and issuing-device-failure/VKR procedures.
- Data-retention and privacy review.
- Dependency and container vulnerability scan.
- External security review of certificate and crypto handling.
- Accountant/tax-specialist signoff of supported scenarios.

### Gate P7

Production is blocked until:

- all P0–P6 gates pass;
- there are no critical/high unresolved security issues;
- outage and correction flows are proven;
- response signature verification is active;
- alerts for certificate expiry, clock drift, retry backlog, and manual-review records are active;
- rollback does not lose already-issued invoice identities or evidence;
- a named person accepts production compliance responsibility.

---

## Phase 8 — Advanced scope after v1

- Batch endpoints.
- VKR/sales-book invoice scenarios.
- Vending-machine premise and reporting support.
- Multi-tenant managed gateway.
- HSM/PKCS#11 and managed KMS signers.
- High-availability worker deployment.
- Additional language SDKs generated from the service contract.
- Compliance-source monitoring bot and signed release evidence bundle.

Advanced scope must not weaken v1 controls.

---

## Initial backlog, in execution order

1. Send test-certificate request.
2. Pin current official source versions and hashes.
3. Create `DecimalAmount` and canonical local-time value objects.
4. Create golden tests for the three date representations.
5. Implement P12 loader and signer abstraction.
6. Implement exact ZOI input and derivation.
7. Implement outbound JWS.
8. Implement strict mTLS echo.
9. Implement signed-response verification.
10. Validate official schemas.
11. Only then create business-premise and invoice workflows.

Do not begin with WooCommerce or a dashboard. The highest-risk defects are in canonicalization, cryptography, response verification, certificate handling, idempotency, and outage behavior.

# Architecture

## Architectural principle

Keep the legally sensitive fiscalization kernel small, deterministic, framework-independent, and heavily tested. Place workflow, persistence, adapters, and user interfaces around it.

## Components

### 1. `@starfiniti/furs-core`

Pure TypeScript package with no database or web-framework dependency.

Responsibilities:

- value objects and domain validation;
- canonical local date/time formatting;
- decimal amount canonicalization;
- invoice identity construction;
- FURS request and response mapping;
- official schema validation interface;
- ZOI generation;
- JWS signing and response verification;
- certificate metadata validation;
- mTLS transport interface;
- FURS error normalization.

It must not:

- allocate database sequences;
- persist records;
- render UI/PDF;
- process platform webhooks;
- decide tax/accounting policy;
- generate all barcode libraries by default.

### 2. `@starfiniti/furs-codes`

Optional package for machine-readable receipt codes. Kept outside core to avoid heavy native/image dependencies in server-only consumers.

### 3. `apps/api`

Fastify-based REST API recommended for v1.

Responsibilities:

- authentication and authorization;
- request validation;
- idempotency-key enforcement;
- command persistence;
- query endpoints;
- health and readiness;
- operator-safe error responses.

The synchronous API may wait briefly for a fast confirmation, but correctness must not depend on the HTTP connection remaining open. Every command is durably stored first.

### 4. `apps/worker`

Responsibilities:

- select pending outbox jobs with safe locking;
- submit to FURS;
- persist attempts and evidence hashes;
- transition document state;
- schedule bounded retries;
- flag manual review;
- run reconciliation and deadline checks;
- emit notifications/webhooks.

### 5. PostgreSQL

Authoritative store for workflow state, idempotency, invoice identities, outbox, audit, and reconciliation.

Use transactions and database constraints, not in-memory locks, as the primary correctness mechanism.

### 6. Secret provider

Signer abstraction examples:

```ts
interface FiscalSigner {
  getCertificateMetadata(): Promise<CertificateMetadata>;
  signRsaSha256(data: Uint8Array): Promise<Uint8Array>;
  getMtlsMaterial(): Promise<MtlsMaterialHandle>;
}
```

Implementations may use:

- local encrypted P12 file mounted read-only;
- PEM files with strict filesystem permissions;
- OpenBao/Vault transit or PKI integration;
- PKCS#11/HSM;
- platform-specific KMS where required operations are supported.

Do not force key export when an external signer can sign in place.

## Deployment modes

### Embedded SDK

A Node application imports `@starfiniti/furs-core` and owns persistence/workflow. Appropriate for tightly controlled custom systems.

### Self-hosted sidecar/service

The recommended integration for PHP/WordPress and heterogeneous stacks. The application calls the local/private REST service; the FURS certificate never enters WordPress/PHP/plugin storage.

### Managed multi-tenant gateway

Deferred. Requires per-tenant key isolation, strong tenant authorization, rate limiting, dedicated audit, incident separation, deletion/retention controls, and preferably non-exportable keys.

## Data flow

```text
Platform/ERP
   |
   | finalized fiscalization command + idempotency key
   v
API validation
   |
   | transaction: fiscal document + immutable payload + outbox job
   v
PostgreSQL
   |
   | locked delivery job
   v
Worker -> canonical payload -> ZOI -> JWS -> mutual TLS -> FURS
   |                                                   |
   | verified signed response                         |
   +---------------------------------------------------+
   |
   v
EOR/status/evidence persisted -> webhook/result -> receipt rendering
```

## Canonical time model

Store one canonical local invoice time:

```text
Europe/Ljubljana local date and time, second precision, no implicit UTC conversion
```

Derive, through tested pure functions:

- FURS JSON issue time: `YYYY-MM-DDTHH:mm:ss`;
- ZOI input time: `dd.MM.yyyy HH:mm:ss`;
- receipt-code time: `YYMMDDHHmmss`.

Also store an instant/UTC timestamp for system audit, but never reconstruct the legal invoice time by converting a server-local or browser-local timestamp later.

DST ambiguity must be rejected or explicitly resolved at command creation.

## Canonical money model

Use an exact decimal representation. Recommended public contract:

```json
{
  "invoiceAmount": "1245.56",
  "paymentAmount": "1245.56"
}
```

Internally use a decimal library or validated integer minor units where the field always has two decimal places. Keep the exact canonical string used in ZOI generation as immutable evidence.

## Idempotency and sequence allocation

- The upstream system supplies a stable idempotency key based on its final invoice identity/event.
- The API inserts the idempotency record, document, identity, and outbox entry in one transaction.
- Sequence allocation uses a row lock/advisory lock and a unique database constraint.
- The same idempotency key returns the original document.
- A retry never allocates a new sequence.
- A correction uses a new idempotency key and new sequence, linked to the original.

## Failure taxonomy

### Retryable

- connection timeout/reset;
- temporary DNS failure;
- selected HTTP 5xx responses;
- temporary FURS unavailability;
- worker process crash before confirmed persistence.

### Non-retryable without correction

- invalid schema/domain data;
- invalid certificate or expired certificate;
- rejected business-premise configuration;
- invalid operator identity;
- cryptographically invalid FURS response;
- duplicate/conflicting fiscal identity.

### Manual review

- outcome unknown after connection loss at an unsafe point;
- repeated business rejection;
- source/specification change;
- reconciliation conflict;
- expired legal submission window;
- certificate/trust-chain anomaly.

## Observability

Metrics and alerts:

- fiscal submissions by result/status;
- request latency;
- retry count and age;
- oldest `ISSUED_WITHOUT_EOR` document;
- manual-review count;
- outbox depth and oldest job;
- certificate days to expiry;
- FURS echo status;
- clock drift/NTP status;
- response-signature verification failures;
- reconciliation mismatches.

Use correlation IDs and document UUIDs. Avoid customer names, addresses, full tax numbers, line items, tokens, and secrets in logs.

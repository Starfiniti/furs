# Test and release plan

## Test layers

### 1. Pure unit tests

- exact decimal parsing and canonical formatting;
- canonical local invoice time;
- payload time, ZOI time, and receipt-code time;
- invoice-identity construction;
- message IDs and validation;
- ZOI input byte sequence;
- RSA-SHA256 signature and MD5 derivation;
- receipt-code decimal conversion, padding, and checksum;
- operator identity rules;
- state-transition guards;
- error classification and retry policy.

### 2. Schema tests

- every supported outbound request passes pinned official Draft-04 schema;
- every supported response fixture passes;
- required/optional fields, lengths, enums, numeric bounds, and one-of structures;
- malformed and unknown structures are rejected;
- schema version/hash included in test output.

### 3. Cryptographic mutation tests

For FURS response tokens, mutate independently:

- one payload byte;
- one header byte;
- signature byte;
- `x5c` certificate;
- certificate order;
- expired/not-yet-valid certificate;
- unknown trust anchor;
- algorithm identifier;
- malformed Base64URL/padding;
- missing token part.

All must fail closed.

### 4. Timezone tests

Run with host process time zones including UTC, Europe/Ljubljana, America/New_York, and Asia/Tokyo. Legal output must remain identical for the same canonical invoice time.

Cover:

- CET and CEST dates;
- spring-forward gap;
- autumn overlap;
- midnight/year boundary;
- leap day;
- second precision;
- rejection of milliseconds where not supported;
- no accidental `toISOString()` conversion in legal formatters.

### 5. Money tests

- `0.00`, `0.01`, `1.10`, `1245.56`;
- large allowed values;
- negative correction amounts where valid;
- more than two decimals rejected or handled only by explicit policy before finalization;
- locale commas rejected at API boundary unless a dedicated parser is explicitly used;
- no scientific notation;
- no loss through JSON serialization;
- tax subtotal and invoice-total scenarios from the approved matrix.

### 6. Persistence/concurrency tests

- 100+ concurrent sequence allocations never duplicate;
- transaction rollback does not consume/reuse incorrectly according to documented policy;
- repeated idempotency key returns same document;
- same key with different payload is a conflict;
- API crash after DB commit but before response;
- worker crash before send, during send, after response, and before result commit;
- outbox job locking under multiple workers;
- confirmed document immutability;
- backup/restore counter reconciliation.

### 7. Network/failure tests

- connect timeout;
- read timeout;
- DNS failure;
- TLS handshake failure;
- wrong client certificate;
- unknown CA;
- HTTP 4xx and 5xx;
- malformed JSON;
- valid JSON without token;
- invalid signed token;
- slow response and connection reset;
- retry exhaustion and manual review.

### 8. FURS test-environment integration tests

- echo;
- business-premise register/update/close;
- basic invoice;
- supported VAT/tax variants;
- foreign-operator scenario;
- self-service/no-physical-operator scenario;
- correction/reference document;
- simulated FURS connection outage followed by subsequent submission;
- simulated issuing-device/software failure that blocks ordinary electronic issuance and activates the VKR/manual runbook;
- duplicate/replay behavior;
- known rejection cases;
- code generation from accepted invoice.

Never run integration tests against production from CI.

## Golden vectors

Golden vectors must store:

- non-secret test key/certificate generated for repository tests;
- input value objects;
- exact ZOI input UTF-8 hex;
- signature hex/base64;
- expected ZOI;
- exact JWS protected header/payload representation where deterministic;
- exact 60-digit receipt-code payload.

Cross-check critical vectors with at least one independent implementation/language.

## Privacy tests

Automated tests scan logs, snapshots, errors, and telemetry payloads for:

- P12 markers/private-key PEM markers;
- configured certificate password;
- raw token structure;
- full test tax number/operator number;
- customer fixture email/address;
- full invoice payload.

## Performance targets

Set targets after measuring FURS latency, but test at minimum:

- expected peak fiscalization rate × 3 safety margin;
- no duplicate sequence under peak concurrency;
- bounded memory under a large retry backlog;
- reconciliation over at least the largest expected retention partition;
- API remains available while FURS is unavailable.

## Soak test

Before production, run at least two continuous days in the FURS test environment with:

- periodic echo;
- representative invoice submissions;
- controlled transient failures;
- worker restarts;
- certificate/trust validation active;
- monitoring and alerts enabled.

Store a release evidence report with timestamps, versions, schema hashes, commit SHA, test counts, failures, and reviewer approval.

## Production release checklist

- [ ] Current official-source versions/hashes reviewed.
- [ ] Compliance matrix reviewed and scenario matrix approved.
- [ ] Test certificate integration passed.
- [ ] Response JWS verification active and mutation tests pass.
- [ ] Strict mTLS active.
- [ ] Golden ZOI and code vectors pass.
- [ ] Sequence/idempotency concurrency tests pass.
- [ ] Connection-outage/subsequent-submit flow passes.
- [ ] Issuing-device-failure/VKR fallback drill passes.
- [ ] Correction/reference flow passes.
- [ ] No sensitive data in logs.
- [ ] Certificate expiry/rotation monitoring active.
- [ ] Clock-drift monitoring active.
- [ ] Backup/restore and sequence reconciliation tested.
- [ ] Two-day soak completed.
- [ ] Security review completed.
- [ ] Accountant/tax/legal scenario review signed.
- [ ] Incident owner and runbooks assigned.
- [ ] Production certificate is stored through approved secret provider.

## Executable evidence commands

These commands enforce the environment and redaction rules described in the
release runbooks. They must be executed only with protected external inputs and
their outputs reviewed; merely having the scripts is not a passed release gate.

```text
corepack pnpm evidence:furs
corepack pnpm evidence:postgres
corepack pnpm evidence:restore
corepack pnpm evidence:rotation
corepack pnpm evidence:load
corepack pnpm evidence:soak
```

See `docs/RELEASE_CHECKLIST.md`, `docs/BACKUP_RESTORE.md` and
`docs/CERTIFICATE_ROTATION.md` for required inputs and approval boundaries.

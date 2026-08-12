# Compliance and protocol requirements matrix

This matrix translates current official guidance into implementation requirements. It is not a substitute for legal advice. Every compliance-sensitive implementation and test should cite one or more IDs below.

| ID | Requirement | Software control | Required evidence/test |
|---|---|---|---|
| FURS-SRC-001 | Current official FURS documentation and schemas are the source of truth. | Pin source version/hash; block release on unexplained change. | Source-change report reviewed for each release. |
| FURS-TLS-001 | Communication uses mutual TLS with the designated certificate. | Strict mTLS transport; no production bypass. | Echo succeeds; missing/wrong client cert fails. |
| FURS-TLS-002 | TLS server certificate chain must be validated. | Trust appropriate root/intermediate chain; avoid leaf-only pinning. | Tampered/unknown chain fails; rotation rehearsal passes. |
| FURS-JWS-001 | Outbound message is a signed JWS/JWT using RS256 and required certificate header fields. | Deterministic JWS builder and signer abstraction. | Golden header/payload/signature tests. |
| FURS-JWS-002 | FURS response must be cryptographically verified, not merely decoded. | Verify signature, chain, certificate validity, and token structure. | Tampered header/payload/signature tests fail. |
| FURS-SCHEMA-001 | Outbound and inbound payloads conform to the current official JSON schema. | Pinned Draft-04 schema validator plus domain validation. | Full schema test suite, including negative fixtures. |
| FURS-TIME-001 | Invoice issue time is a local invoice value and is reused consistently. | Store one immutable `Europe/Ljubljana` local time. | DST and server-timezone-independent tests. |
| FURS-TIME-002 | Payload, ZOI input, and receipt code use their exact required formats. | Three pure canonical-format functions. | Golden tests for each representation. |
| FURS-MONEY-001 | Monetary values are represented and formatted exactly. | Decimal strings/integer minor units; no JS float source of truth. | Rounding, large, negative, and trailing-zero tests. |
| FURS-ZOI-001 | ZOI input uses the exact required field order and canonical values. | Typed builder with no optional reordering. | Official/independent golden vectors. |
| FURS-ZOI-002 | ZOI signs input using RSA-SHA256 and hashes signature as specified. | Isolated cryptographic function. | Deterministic test key vectors and cross-language check. |
| FURS-ID-001 | Invoice identity contains business premise, electronic device, and sequence. | Immutable value object and DB uniqueness. | Duplicate/concurrency tests. |
| FURS-ID-002 | Invoice sequence is never reused. | Transactional allocator and unique constraint. | Parallel allocation and crash-recovery tests. |
| FURS-IDEMP-001 | Repeated delivery must not create a new fiscal document. | Mandatory idempotency key and immutable command snapshot. | Duplicate request/event tests. |
| FURS-PREM-001 | Business premises are registered before use and lifecycle changes are reported. | Premise registry and lifecycle commands. | Test-environment register/update/close tests. |
| FURS-OP-001 | Physical operator uses the correct Slovenian tax identity where required. | Explicit operator model; no silent default. | Local, foreign, self-service, and missing-operator tests. |
| FURS-OP-002 | Foreign operator is represented using the protocol-prescribed fields. | Omit local operator number and set foreign flag where applicable. | Schema and integration tests. |
| FURS-OUT-001 | When immediate EOR is unavailable, required invoice data/ZOI is retained and submission follows later. | `ISSUED_WITHOUT_EOR`, durable outbox, deadline monitor. | Simulated outage and recovery test. |
| FURS-OUT-002 | Subsequent submission explicitly marks the invoice appropriately. | Immutable original payload plus subsequent-submit flag in retry command. | Official test-environment path. |
| FURS-DEV-001 | Failure of the electronic issuing device/software is distinct from loss of the FURS connection and requires the approved VKR fallback procedure. | Block ordinary electronic issuance, activate operator runbook, and support/import later SalesBookInvoice submission where in scope. | Device-failure drill and reviewed VKR runbook. |
| FURS-COR-001 | A confirmed invoice is not overwritten; correction/cancellation is a new linked record. | Append-only fiscal document model and reference relation. | Correction/storno scenario tests. |
| FURS-CODE-001 | Receipt machine-readable code is built from prescribed data and checksum. | Separate exact code-data builder. | Independent 60-digit golden vectors. |
| FURS-AUD-001 | Every attempt and state transition is auditable. | Append-only audit events and request/response hashes. | Reconstruction test and tamper controls. |
| FURS-SEC-001 | Private key and certificate password are protected. | Secret provider, least privilege, encryption, no logs. | Secret-scanning and access tests. |
| FURS-SEC-002 | Sensitive fiscal/customer data is minimized in logs and telemetry. | Structured redaction and allowlisted log fields. | Automated log-leak tests. |
| FURS-CERT-001 | Certificate expiry and rotation are operationally managed. | Metadata monitoring, alerts, dual-profile rotation procedure. | Rotation rehearsal and expiry alert test. |
| FURS-CLOCK-001 | System clock accuracy is monitored. | NTP/clock-drift health check and alert. | Drift simulation. |
| FURS-REL-001 | Test environment is used for stable pre-production verification. | Dedicated environment config and release gate. | Continuous soak evidence and signed release checklist. |
| FURS-PAY-001 | Whether fiscalization is required depends on legally reviewed payment/business scenarios. | Decision remains in a reviewed upstream policy layer; adapter scenario matrix. | Accountant/tax-specialist signoff. |
| FURS-VEND-001 | Vending-machine changes in current documentation are tracked even when deferred. | Explicit unsupported/Phase-2 status; domain not hard-coded against future fields. | Source monitoring and extension tests. |

## Scenario review matrix to complete before production

For each scenario record: legal entity, country, B2B/B2C, channel, payment method, moment of supply, invoice-issue moment, premise/device, operator model, correction/refund handling, and whether fiscalization is required.

Minimum scenarios:

- bank transfer/UPN;
- cash;
- payment card at POS;
- card payment in web checkout;
- Stripe payment;
- PayPal payment;
- cash on delivery;
- gift card/store credit;
- partial payment/deposit;
- subscription/recurring payment;
- full refund;
- partial refund;
- cancellation before fiscalization;
- cancellation after confirmation;
- self-service checkout;
- foreign operator;
- marketplace/merchant-of-record flow;
- B2B reverse-charge or exempt-tax cases relevant to actual customers.

Do not encode generic internet advice as tax policy. Get the completed matrix reviewed and versioned.

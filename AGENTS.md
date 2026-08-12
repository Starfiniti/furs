# AGENTS.md — Mandatory instructions for Codex, Claude Code and human contributors

## Mission

Build an enterprise-grade, open-source Slovenian FURS fiscalization engine. This is compliance-critical software. A successful HTTP response is not sufficient evidence of correctness.

## Source hierarchy

Use sources in this order:

1. Current official FURS technical documentation and official JSON schemas.
2. Current legislation on PISRS and official SPOT/FURS operational guidance.
3. Reproducible local cryptographic tests and official FURS test environment results.
4. Peer-reviewed implementation notes approved in this repository.
5. Existing open-source libraries only as non-authoritative implementation references.

When sources disagree, stop the affected release path, document the conflict, and require human compliance review. Never silently select the easiest interpretation.

## Mandatory workflow at the start of every coding session

1. Read this file.
2. Read `compliance/SOURCE_REGISTER.md`.
3. Run `node scripts/check-official-sources.mjs` when internet access is available.
4. Review the generated source-change report.
5. Read the relevant requirement IDs in `COMPLIANCE_MATRIX.md`.
6. State which phase and acceptance gate are being implemented.
7. Inspect existing tests before changing compliance-sensitive code.

## Non-negotiable engineering rules

- Never use JavaScript floating-point numbers as the legal source of truth for amounts.
- Accept decimal strings or integer minor units and canonicalize explicitly.
- Never create a new invoice identity, sequence, issue time, or ZOI merely because a request is retried.
- Never reuse a fiscal invoice sequence number.
- A confirmed fiscal record is immutable. Corrections and cancellations are new linked documents.
- Derive all required date representations from one canonical local invoice time in `Europe/Ljubljana`.
- Verify the FURS response JWS signature and certificate chain. Decoding the token is not verification.
- Validate outbound and inbound payloads against pinned official schemas and internal domain rules.
- Use mutual TLS and strict certificate validation in every environment.
- Pin or trust the appropriate root/intermediate chain, not a rotating leaf certificate.
- Do not disable TLS validation as a production escape hatch.
- Do not log private keys, certificate passwords, P12 bytes, raw signed tokens, full invoices, personal tax numbers, or payment secrets.
- Do not store private keys or P12 files unencrypted in PostgreSQL, source control, images, logs, CI artifacts, or object storage.
- Require an idempotency key for every fiscalization command.
- Do not automatically use the company tax number as the operator tax number except in an explicitly modelled self-service/no-physical-operator scenario.
- Preserve exact, redacted audit evidence and cryptographic hashes for every submission attempt.
- Use bounded retries with backoff and a durable outbox. Never retry indefinitely in a request thread.
- Track certificate expiry, clock drift, retry age, oldest unconfirmed invoice, and reconciliation failures.
- Distinguish interrupted FURS connectivity from failure of the electronic issuing device/software. Network outage may use subsequent submission; device failure requires the approved VKR/operator fallback and must not be disguised as an ordinary retry.
- Never claim the software is certified or endorsed by FURS.

## Compliance-sensitive code

The following areas require a requirement ID, tests, and reviewer acknowledgement in the pull request:

- canonical timestamp and amount formatting;
- invoice-number construction and sequence allocation;
- ZOI input construction and signing;
- JWS header construction, signing, parsing, and verification;
- certificate parsing, storage, rotation, and mTLS transport;
- official schema mapping and validation;
- outage/subsequent-submission flow;
- correction/reference flow;
- receipt code payload/checksum;
- operator identity rules;
- decision rules about whether an invoice must be fiscalized;
- retention, immutability, and audit behavior.

## Pull-request requirements

Every compliance-sensitive pull request must include:

- requirement IDs changed or implemented;
- official source version/date reviewed;
- tests added and exact commands run;
- impact on stored records and backward compatibility;
- security/privacy impact;
- migration/rollback plan when persistence changes;
- evidence from the FURS test environment when protocol behavior changed.

No unresolved `TODO`, `FIXME`, skipped test, disabled TLS check, or placeholder crypto code is allowed in a release candidate.

## Phase discipline

Do not build dashboards, WooCommerce screens, Shopify webhooks, or broad multi-tenant functionality before the cryptographic spike passes all Phase 1 gates.

Do not introduce microservices unless a measurable operational boundary requires them. Start with a modular monorepo, one API process, one worker, and PostgreSQL.

Do not make Redis mandatory in v1. PostgreSQL must be sufficient for durable outbox, idempotency, locking, and audit. Redis may be added later for non-authoritative acceleration.

## Self-improvement protocol

At the end of each implementation phase:

1. Compare actual findings with `IMPLEMENTATION_PLAN.md`.
2. Research official sources again where assumptions failed.
3. Add or amend requirement IDs before changing behavior.
4. Update architecture decisions in `docs/DECISIONS.md`.
5. Add regression tests for every defect or ambiguity found.
6. Improve this file only when the new rule is general and verified.

The plan is adaptable, but legal, cryptographic, security, audit, and release gates are not optional.

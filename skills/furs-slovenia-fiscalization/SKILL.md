---
name: furs-slovenia-fiscalization
description: Implement or review Slovenian FURS invoice fiscalization, including ZOI, JWS, mTLS, schemas, premises, outage submission, corrections, receipt codes, persistence, and platform adapters.
---

# FURS Slovenia fiscalization skill

## Trigger

Use this skill for any task involving:

- davčno potrjevanje računov;
- FURS fiscal invoices;
- ZOI or EOR;
- fiscal business premises/electronic devices;
- Slovenian fiscal receipt QR/PDF417/Code128;
- FURS test/production endpoints or certificates;
- WooCommerce, Shopify, Medusa, Stripe, POS, ERP, or custom integration with Slovenian fiscalization.

## First actions

1. Read repository `AGENTS.md`.
2. Read `compliance/SOURCE_REGISTER.md` and `COMPLIANCE_MATRIX.md`.
3. Run the official-source checker when online.
4. Identify the exact implementation phase and supported business scenario.
5. Refuse to infer normative behavior from an old library when an official source is available.

## Source hierarchy

1. Current official FURS documentation/schema.
2. Current PISRS legislation/regulation and official SPOT/FURS guidance.
3. Test-environment evidence and repository golden vectors.
4. Approved architecture decisions.
5. Existing code and third-party libraries as references only.

## Core invariants

- One immutable `Europe/Ljubljana` local invoice time produces all required date formats.
- Exact decimal values only; no floating-point source of truth.
- Exact field order/format for ZOI input.
- RSA-SHA256 signing and prescribed ZOI derivation.
- Outbound JWS uses required protected header.
- FURS response signature and certificate chain are verified.
- Strict mutual TLS is mandatory.
- Official schemas and internal business rules both validate payloads.
- A retry reuses identity, issue time, payload, and ZOI.
- Sequence numbers are never reused.
- Confirmed fiscal documents are immutable.
- Corrections/cancellations are linked new documents.
- Connection-outage invoices are durably tracked and subsequently submitted according to approved procedure.
- Issuing-device/software failure is handled through the approved VKR/operator fallback, not disguised as a network retry.
- Idempotency key is mandatory.
- Operator identity is explicit; company tax number is not a universal fallback.
- Certificate/private key/password/raw tokens/personal data never enter logs.

## Exact canonical representations to test

From one approved local invoice time, derive independently:

- JSON issue time: `YYYY-MM-DDTHH:mm:ss`;
- ZOI input time: `dd.MM.yyyy HH:mm:ss`;
- receipt-code time: `YYMMDDHHmmss`.

Do not use `Date.toISOString()` as the legal formatter.

Amounts in public contracts should be decimal strings such as `"1245.56"`.

## Review checklist

For every implementation/review, answer:

- Which official document/schema version is used?
- What exact bytes enter ZOI signing?
- How is the FURS response signature verified?
- How are trust anchors and certificate rotation handled?
- How are local time and DST handled?
- How are decimals and negative corrections handled?
- How is sequence uniqueness guaranteed under concurrency/restore?
- What makes retries idempotent?
- What happens when the FURS connection is unavailable, and separately when the issuing device/software is unavailable?
- How is a correction linked to the original?
- What sensitive data can appear in logs?
- Which test-environment evidence exists?
- Has the payment/business scenario been legally/accountingly reviewed?

## Anti-patterns to reject

- “JWT decoded successfully” presented as signature verification.
- UTC conversion inside ZOI formatting.
- `number.toFixed(2)` as the financial domain model.
- random invoice number generation.
- generating a new sequence on retry.
- updating/deleting a confirmed record.
- certificate embedded in a WordPress plugin or Docker image.
- `rejectUnauthorized: false` or equivalent in production.
- full invoice/token debug logging.
- starting with UI/adapters before crypto/transport tests pass.
- hard-coding payment-method legal policy from a blog post.
- claiming FURS certification or endorsement.

## Expected output from a coding agent

- requirement IDs addressed;
- files changed;
- tests added;
- commands run and results;
- official source version/hash reviewed;
- security/privacy impact;
- migrations and rollback implications;
- unresolved assumptions or required human review;
- updated phase gate status.

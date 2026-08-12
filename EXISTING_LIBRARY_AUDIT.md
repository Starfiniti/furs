# Existing open-source library audit

Review date: 12 August 2026

## Decision

Do **not** fork an existing repository as the production foundation. Build cleanly from current official sources and use existing projects only for comparative research.

## `nejcar20/furs-client-ts`

Positive points:

- TypeScript and MIT licensed;
- recent activity in December 2025;
- supports P12 loading, business-premise submission, basic invoice submission, and receipt-code generation;
- acknowledges strict TLS validation and test/production environments.

Release-blocking concerns found during code inspection:

1. Its response `decodeJWT` routine parses the three token parts and sets `valid: true` after JSON parsing; it does not cryptographically verify the FURS response signature or `x5c` chain.
2. Its ZOI helper converts the issue time through `toISOString()` and formats `YYYY-MM-DD HH:mm:ss`, whereas the current official ZOI example/rule requires the prescribed local invoice format `dd.MM.yyyy HH:mm:ss`.
3. It accepts JavaScript `number` values and uses `.toFixed(2)` as part of ZOI construction, which is not an adequate legal-money domain model.
4. It contains an unconditional invoice-data `console.log`, creating a privacy and operational leakage risk.
5. The core client lacks the durable outbox, idempotency ledger, sequence concurrency controls, reconciliation, submission-deadline monitoring, and immutable audit required for a production service.
6. It defaults `OperatorTaxNumber` to the company tax number, which is not universally correct for a physical operator.
7. Its scope is incomplete for a reusable enterprise engine and current protocol evolution.
8. Barcode/image dependencies are coupled to the client package rather than kept optional.

Conclusion: it can inform isolated implementation ideas, but every relevant behavior must be independently reimplemented/tested. Preserve attribution if any MIT-licensed code is actually reused.

## `mslenc/furs-invoices`

Positive points:

- stronger historical treatment of exact decimals (`BigDecimal`);
- explicit `Europe/Ljubljana` time handling;
- validation-rich domain classes;
- transport abstraction and asynchronous client option.

Concerns:

- last meaningful commits were in December 2018;
- it predates current 2025/2026 TLS, certificate, schema, and vending-machine changes;
- AGPLv3/commercial dual-license terms are not a good default foundation for a broadly embeddable Apache/MIT-style ecosystem;
- a modern Node/TypeScript service would still require substantial redesign.

Conclusion: useful as an older cross-language reference for domain design and test comparison, not as the current implementation base.

## Other repositories

GitHub searches mainly surfaced small, old, or forked projects. No clearly current, comprehensively tested, enterprise-grade implementation was found that combines:

- current v3.2 compatibility;
- exact canonicalization;
- verified signed responses;
- strict certificate lifecycle controls;
- durable outbox/idempotency/reconciliation;
- outage/correction workflows;
- platform-neutral service contract;
- active compliance-source monitoring.

## Reuse policy

Before reusing third-party code:

1. record repository, commit SHA, file/function, and license;
2. verify behavior against current official sources;
3. add independent golden/negative tests;
4. preserve required notices;
5. do not mix AGPL code into Apache-licensed packages without explicit compatible permission;
6. prefer clean-room reimplementation for short compliance-sensitive algorithms and mappers.

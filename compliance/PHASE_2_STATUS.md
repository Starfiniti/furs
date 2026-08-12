# Phase 2 status

Last updated: 12 August 2026
Requirements: `FURS-SCHEMA-001`, `FURS-ID-001`, `FURS-OP-001/002`, `FURS-PREM-001`, `FURS-VEND-001`
Gate: P2 — incomplete

## Completed local controls

- The core package has no database, web framework, or UI dependency.
- Slovenian tax number, business-premise ID, electronic-device ID, invoice sequence, fiscal identity, message ID, ZOI, EOR, VAT rate, and premise-validity date are immutable validated value types.
- Fiscal invoice mapping covers every field in the reviewed ordinary electronic-invoice schema, including all VAT/tax summary variants, local/foreign/self-service operators, subsequent submission, electronic-invoice references, and sales-book references.
- Fiscal amounts and rates remain exact decimal tokens in serialized JSON rather than being round-tripped through JavaScript floating point.
- Real-estate premises include property and address identifiers; movable premise types `A`, `B`, and `C` are explicit.
- Register/update/close payloads use the same immutable premise model, with closure mapped only to the official `Z` tag.
- Slovenian and foreign software suppliers are mutually exclusive domain variants.
- Vending types `D`, `E`, and `F` fail closed at an explicit extension boundary pending reviewed support.
- Invoice and premise mappers can return only a `ValidatedFursPayload` after validation against a digest-locked schema.
- Signed invoice responses yield a typed EOR or typed FURS rejection only after certificate-chain/signature verification, schema validation, and request/response message-ID correlation. Signed premise responses use the same fail-closed path.

## Verification evidence

- `corepack pnpm check`: 56 tests passed, 0 failed, 0 skipped, 0 todo.
- A comprehensive ordinary electronic-invoice payload covering every supported optional tax/reference field passed the unmodified official schema with SHA-256 `6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd`.
- A representative real-estate premise registration payload passed that same unmodified official schema.
- Locally signed confirmed/rejected invoice responses and accepted/rejected premise responses passed signature, trust-chain, official-schema, internal-outcome, and message-correlation checks.
- Negative tests cover ambiguous/missing response outcomes, incomplete errors, unexpected response fields, message-ID mismatch, local/foreign/self-service operators, exact decimal JSON tokens, identity rejection, premise registration/closure, all three movable types, supplier variants, and vending rejection.

## Gate blockers

- Gates P0 and P1 remain incomplete and must not be bypassed.
- Premise register, update, and close operations have not been exercised with a real certificate in the official FURS test environment.
- The supported v1 scenario matrix still requires Slovenian accountant/tax-specialist approval.
- Vending support remains intentionally deferred and unsupported.

The pure core is ready for continued workflow implementation and official test-environment validation, but Gate P2 is not passed.

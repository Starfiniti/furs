# Verified official baseline — 12 August 2026

This document records the official baseline used to create the foundation pack. Re-check sources before implementation and every release.

## Current technical baseline

FURS currently publishes **Technical Documentation version 3.2, dated 23 March 2026** for developers of fiscal cash-register software.

The current documentation includes JSON/REST integration, official JSON schemas, current certificate/trust information, test and production endpoints, JWS requirements, ZOI construction, receipt codes, business-premise messages, batch services, and newer vending-machine-related changes.

FURS also announced changes to accepted TLS cipher sets during 2026. Therefore TLS configuration must be treated as maintained operational configuration, not a one-time implementation detail.

## JSON endpoints

### Test

- Invoice: `https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices`
- Business premise: `https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register`
- Echo: `https://blagajne-test.fu.gov.si:9002/v1/cash_registers/echo`
- Batch invoice: `https://blagajne-test.fu.gov.si:9002/v1/cash_registers_batch/invoices`
- Batch business premise: `https://blagajne-test.fu.gov.si:9002/v1/cash_registers_batch/invoices/register`

### Production

Use the equivalent paths on `blagajne.fu.gov.si` over port `9003`.

Endpoint URLs must not be arbitrarily user-configurable in production.

## Transport and message protection

- Communication uses mutual TLS with the taxpayer's dedicated fiscalization certificate.
- JSON messages use a wrapper containing a signed token.
- JWS uses `RS256` and certificate-identifying protected-header fields prescribed by FURS.
- FURS responses are signed and include certificate information such as `x5c`.
- A response must be **cryptographically verified**. Parsing or Base64URL-decoding it is not verification.
- TLS trust should be based on the appropriate root/intermediate chain rather than a rotating leaf-only pin.
- Certificate expiry and trust-chain rotation require monitoring and rehearsed operations.

## Exact ZOI rules that require golden tests

ZOI input is a direct concatenation, in prescribed order, of:

1. taxpayer tax number;
2. invoice issue date/time;
3. invoice sequence number;
4. business-premise identifier;
5. electronic-device identifier;
6. invoice amount.

Critical canonical details:

- UTF-8 input;
- invoice time for ZOI formatted as `dd.MM.yyyy HH:mm:ss`;
- decimal point in the amount and exact two-decimal representation where required;
- sign the input with RSA-SHA256;
- calculate MD5 over the resulting signature bytes;
- output a 32-character lowercase hexadecimal ZOI.

The JSON invoice field uses a different date representation, `YYYY-MM-DDTHH:mm:ss`. The machine-readable receipt code uses `YYMMDDHHmmss`. All three must derive from one immutable local invoice time in `Europe/Ljubljana`, without accidental UTC conversion.

## Receipt-code data

The machine-readable code data is a 60-digit numeric string constructed from:

- ZOI hexadecimal converted to a 39-digit decimal value, left-padded with zeroes;
- taxpayer tax number as 8 digits;
- invoice date/time as 12 digits (`YYMMDDHHmmss`);
- final checksum digit based on the prescribed digit-sum rule.

Implement the data builder independently from the image/barcode renderer and verify it with cross-language golden vectors.

## Business-premise and operator behavior

- Business premises must be registered before use and lifecycle changes must be reportable.
- Fiscal invoice identity consists of business premise, electronic device, and invoice sequence.
- A physical operator's Slovenian tax number is used where required.
- A foreign operator is represented using the protocol's foreign-operator mechanism rather than inventing a local number.
- For self-service/no-physical-person cases, the issuer's tax number may be used only under the applicable official rule and explicit scenario model.
- Do not silently use the company tax number as a universal operator fallback.

## Outage, retries, device failure, and corrections

Two exceptional cases must not be mixed:

- **Interrupted electronic connection:** the invoice is issued with the prescribed data and ZOI but without EOR, persisted durably, and sent later with the applicable subsequent-submission marker. The normal statutory window is two working days from interruption, with the law's exception for justified reasons.
- **Electronic device/software failure:** this is not merely a network retry. The statutory fallback uses the bound invoice book (VKR), followed by later electronic submission under the applicable procedure. The service needs an operator runbook and must not fabricate an electronic invoice while the issuing device is unavailable.

A retry after connection interruption must preserve the original identity, issue time, payload, and ZOI. A confirmed record must remain immutable. A correction/cancellation is represented as a new linked fiscal document, not an edit of the confirmed original.

## Payment-method scope needs professional review

Official operational guidance distinguishes payment flows such as direct transaction-account payments, cards, cash on delivery, Stripe, PayPal, and other methods. The exact fiscalization decision depends on the legal and business scenario.

The open-source core should therefore not contain an oversimplified universal `paymentMethodRequiresFiscalization()` rule. Each adapter must use a versioned scenario policy approved for the actual merchant by a Slovenian accountant or tax/legal specialist.

## Test certificate and pre-production testing

FURS provides a test certificate process for software developers. The request should identify the company developing the solution. The delivered test credential is used only in the test environment.

FURS recommends a period of continuous stable test-environment operation before production. This project makes a minimum two-day soak test a release gate.

## Official sources

- Developer technical page: https://edavki.durs.si/edavkiportal/openportal/CommonPages/Opdynp/PageD.aspx?category=dpr_teh_spec
- Technical Documentation v3.2: https://www.datoteke.fu.gov.si/dpr/files/TehnicnaDokumentacijaVer3.2.pdf
- JSON schema: https://www.datoteke.fu.gov.si/dpr/files/wsdl_v1/FiscalVerificationSchema.json
- Batch JSON schema: https://www.datoteke.fu.gov.si/dpr/files/wsdl_v1/FiscalVerificationSchemaBatch.json
- ZDavPR: https://pisrs.si/pregledPredpisa?id=ZAKO7195
- Implementing regulation: https://pisrs.si/pregledPredpisa?id=PRAV12531
- SPOT operational guidance: https://spot.gov.si/sl/teme/vodenje-poslovnih-knjig
- SPOT online-retail guidance: https://spot.gov.si/sl/dejavnosti-in-poklici/dejavnosti/trgovina-na-drobno-po-posti-ali-po-internetu/

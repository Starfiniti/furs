# Phase 1 official-source notes

Review date: 12 August 2026
Official document: FURS Technical Documentation v3.2, 23 March 2026
Observed SHA-256: `7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547`
Gate: P1

## Verified implementation inputs

- Pages 10 and 90-91: mutual TLS is required; TLS 1.2 and 1.3 are supported; trust should anchor at the stated root/intermediate rather than a rotating leaf certificate.
- Pages 104-107: JSON messages use a `{ "token": "JWT" }` wrapper; the protected header uses `alg: RS256` plus certificate-derived `subject_name`, `issuer_name`, and `serial`; FURS responses additionally include `x5c`.
- Pages 118-121: ZOI input is UTF-8 concatenation in the exact order tax number, local issue time, invoice sequence, business-premise ID, electronic-device ID, and invoice amount; issue time uses `dd.MM.yyyy HH:mm:ss`; signing is RSA-SHA256; ZOI is lowercase MD5 hex of the signature bytes.
- Page 123: receipt-code time uses `YYMMDDHHmmss`; code data is 60 digits and includes a 39-digit decimal conversion of ZOI, the 8-digit taxpayer number, the 12-digit time, and a modulo-10 digit-sum check digit.
- The current official JSON schema constrains ordinary amounts to multiples of `0.01`, strictly between `-100000000000000` and `100000000000000`.
- The current JSON schema repeats short Draft-04 `id` values such as `InvoiceNumber`. These behave as descriptive labels in the FURS document but create ambiguous URI scopes in conforming validators. The pinned bytes are hashed first; only these non-behavioral `id` annotations are removed before Ajv compilation. All validation keywords and references remain unchanged.

- The schema labels invoice local time, premise validity date, and timestamped FURS responses with the same `date-time` format. The field tables/examples prescribe `YYYY-MM-DDTHH:mm:ss` for invoice values, `YYYY-MM-DD` for premise validity, and also show UTC/fractional response timestamps. The validator implements these documented FURS forms, while field-specific domain types enforce the narrower outbound representation.

These notes are implementation evidence, not baseline acceptance. Human source review and official FURS test-environment evidence remain mandatory gate items.

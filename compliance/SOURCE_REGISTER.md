# Official source register

## Review policy

- Only official FURS, PISRS, and SPOT sources are normative for this project.
- Record retrieval date, document version/date, SHA-256, reviewer, and impact notes.
- A changed source does not automatically mean behavior must change, but it blocks release until reviewed.
- Do not commit or redistribute official documents/schemas unless their redistribution terms are confirmed. Prefer source URLs plus pinned digests and controlled downloads.

## Current baseline used for this foundation pack

| Source | Current baseline | Why it matters |
|---|---|---|
| FURS developer technical page | Technical Documentation v3.2, dated 23 March 2026 | Index of current documentation, schemas, certificates, and developer notices. |
| FURS Technical Documentation v3.2 | Version 3.2 | Protocol, endpoints, JWS, TLS, data structures, ZOI, codes, errors, and testing guidance. |
| FiscalVerificationSchema.json | Current v1 JSON schema from official developer page | Runtime validation of ordinary messages. |
| FiscalVerificationSchemaBatch.json | Current batch schema | Deferred batch scope and compatibility monitoring. |
| ZDavPR on PISRS | NPB 4, applicable from 1 January 2026 | Legal obligations, outage/later submission, invoice data and operational requirements. The registry monitors the stable official PISRS integration PDF, not the JavaScript application shell. |
| Implementing regulation on PISRS | NPB 3, applicable from 1 January 2026 | Detailed implementation requirements and current vending-machine amendments. The registry monitors the stable official PISRS integration PDF. |
| SPOT bookkeeping/fiscal-register guidance | Current page | Operational onboarding, premise/operator/notice guidance. |
| SPOT online retail guidance | Current page | Payment-method and online-shop scenario guidance requiring professional review before hard-coding. |

## Known 2026 change signals

- FURS technical documentation is at version 3.2, dated 23 March 2026.
- FURS announced changes to accepted TLS cipher sets for test and production environments in 2026.
- Current documentation includes newer vending-machine-related fields/services that older open-source libraries may not support.

## Mandatory review questions after any source change

1. Did an endpoint, port, certificate chain, TLS protocol, or cipher requirement change?
2. Did JWS header, signature, response verification, or `x5c` behavior change?
3. Did any schema field, length, enum, required flag, or numeric constraint change?
4. Did ZOI input/canonicalization or receipt-code construction change?
5. Did business-premise or vending-machine behavior change?
6. Did outage/later-submission deadlines or flags change?
7. Did correction/reference behavior change?
8. Did payment-method guidance change?
9. Must stored historical payloads remain serializable under their original schema version?
10. Which tests and migration notes must be updated?

## Existing open-source projects

Existing GitHub/npm projects are deliberately excluded from the normative source registry. They may be listed in an architecture decision record as implementation research, with license, maintenance date, and independently verified defects. No copied behavior becomes trusted merely because a library labels itself production-ready.

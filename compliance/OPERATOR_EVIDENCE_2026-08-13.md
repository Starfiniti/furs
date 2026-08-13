# Operator-identity evidence – 13 August 2026

## Scope

Requirements: `FURS-OP-001`, `FURS-OP-002`, `FURS-AUD-001` and
`FURS-REL-001`. Environment: official FURS test environment through the local
test API and worker. No production system or data was involved.

The implementation models a Slovenian operator, a foreign operator and a
self-service device as separate domain variants. It does not substitute the
company tax number for a physical operator unless the request explicitly selects
the self-service variant.

## Official-test results

- A synthetic self-service invoice was queued during the worker-stop recovery
  drill and later reached `CONFIRMED` without changing its document identity or
  sequence. The protected recovery artifact SHA-256 is
  `16054527be8c275239a835623a6394d54607f8e47d60b249568c47a9fe2344ba`.
- A separate synthetic invoice explicitly selected the foreign-operator variant.
  No operator tax number was included in that command. FURS confirmed document
  `a4bb9bb5-d2e1-4d73-958d-3bd6cf923036` on 13 August 2026.
- The foreign-operator runner produced scenario SHA-256
  `b4958e4078eda6cfd2fff9fb6c4f5528b3538745e9cd4a745dca6a1fce5b19ea`
  and redacted evidence SHA-256
  `2948048554a5d7fe4ced32ee6df2c29b22c4a0dfa4a4b621f00cc636b826ab75`.
  The complete protected envelope has file SHA-256
  `08c7d347c045b0e88b06a55338ab80c5b845988649263fed5b3aa45ceb0ae6c5`.

## Evidence boundary

The protected artifacts contain only the minimum operational evidence and are
stored outside Git. This public record contains no tax number, bearer token,
certificate material, invoice payload, ZOI, EOR or signed FURS response.

These results prove the two tested operator-identity protocol paths. They do not
approve a real employee/operator mapping, an unattended-sales business policy,
or any production use, and they are not FURS certification or endorsement.

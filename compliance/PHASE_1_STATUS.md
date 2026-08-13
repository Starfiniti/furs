# Phase 1 status

Last updated: 13 August 2026
Requirements: `FURS-TIME-001/002`, `FURS-MONEY-001`, `FURS-ZOI-001/002`, `FURS-JWS-001/002`, `FURS-TLS-001/002`, `FURS-SCHEMA-001`, `FURS-SEC-001/002`, `FURS-CERT-001`
Gate: P1 — incomplete

## Completed local controls

- Decimal amounts use canonical strings and integer minor units; floating-point arithmetic is excluded from fiscal values.
- `Europe/Ljubljana` invoice time is resolved independently of the host time zone. DST gaps fail and overlaps require an explicit earlier/later choice.
- Software signing loads matching RSA material from PEM or PKCS#12, validates certificate dates, and exposes only the metadata required by FURS.
- ZOI construction follows the official UTF-8 field order and performs RSA-SHA256 followed by MD5 over the signature bytes.
- Outbound RS256 JWS headers are deterministic. Inbound signed responses fail closed for malformed compact encoding, algorithm substitution, payload/signature mutation, invalid `x5c` order, untrusted chains, expired certificates, and signer-pin mismatch.
- The transport is HTTPS-only, requires a client certificate, trusts only supplied server roots, permits TLS 1.2/1.3, and provides no certificate-verification bypass.
- The official Draft-04 schema is digest-locked before compilation, and schema errors are redacted so rejected fiscal data is not logged.
- The Phase 1 command-line spike reads secrets only from explicit environment-configured files/values and emits only hashes, certificate metadata, and TLS protocol information.
- Public test-only CA, client, server, and response certificates exercise the complete local cryptographic and mTLS paths.
- The real FURS developer test PKCS#12 is stored outside the repository and
  synchronised folders with a separate ACL-protected passphrase. Its RSA private
  key, certificate, test identity and validity were verified without retaining
  secret material in evidence.

## Verification evidence

- Latest `corepack pnpm check`: 147 tests passed, 0 failed, 0 skipped, 0 todo
  (the Phase 1 checkpoint originally contained 42 tests).
- The official schema with SHA-256 `6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd` compiled with the pinned Draft-04 validator.
- An independent OpenSSL 3 RSA-SHA256/MD5 calculation over the 51-byte canonical fixture produced the same 256-byte signature-derived ZOI as the Node implementation: `1da0adb4cc87fd85f909e0acb99a2aa4`.
- Local negative-path tests prove that missing client identity and an unknown server CA fail the TLS handshake.
- On 13 August 2026, two official test-environment Echo requests succeeded over
  strict mutual TLS 1.3. The retained redacted evidence has SHA-256
  `3e0e719109de03cdd8ab30b83d89a4897fc47f09a0f8401b01861e6729f032ff`.
- The official endpoint rejected both a missing client certificate and an
  unrelated test certificate. Redacted negative-control evidence has SHA-256
  `df6e514b3373595f7899a4d03864acee29b70ebf16ef418e1296665de6a800c4`.
- A deliberately certificate-identity-mismatched, schema-valid test request was
  rejected with FURS code `S005`. The response passed RS256 signature, SIGOV-CA
  chain, expected signer pin, official schema and MessageID-correlation checks.
  Only hashes and the error code were retained; the raw request, JWS tokens and
  tax identities were not. Redacted evidence has SHA-256
  `25372e8548d725b54d882843d3c5d9bd341ac3e0f0cf2dedce20377106f70e6d`.

## Gate blockers

- P0 source digests were accepted by Dejan Kletečki on 12 August 2026, but the
  remaining P0 ownership/accounting/licensing items are still open. The changed
  SPOT online-retail guidance remains frozen and did not affect these protocol
  tests.
- A second developer has not independently reviewed the cryptographic implementation and golden-vector evidence.

Official Echo and signed-response verification now pass, but Gate P1 must not be
marked passed until the independent cryptographic review is recorded and the
applicable P0 ownership gates are resolved.

# Phase 1 status

Last updated: 12 August 2026
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

## Verification evidence

- Latest `corepack pnpm check`: 56 tests passed, 0 failed, 0 skipped, 0 todo (the Phase 1 checkpoint originally contained 42 tests).
- The official schema with SHA-256 `6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd` compiled with the pinned Draft-04 validator.
- An independent OpenSSL 3 RSA-SHA256/MD5 calculation over the 51-byte canonical fixture produced the same 256-byte signature-derived ZOI as the Node implementation: `1da0adb4cc87fd85f909e0acb99a2aa4`.
- Local negative-path tests prove that missing client identity and an unknown server CA fail the TLS handshake.

## Gate blockers

- P0 source digests were accepted by Dejan Kletečki on 12 August 2026, but the remaining P0 ownership/accounting/licensing items are still open.
- A real FURS test PKCS#12 certificate has not been provisioned through the official process.
- The spike has not completed a mutual-TLS request against the official FURS test endpoint with that certificate.
- A real signed FURS test response has not been captured and verified against the official response certificate chain.
- A second developer has not independently reviewed the cryptographic implementation and golden-vector evidence.

The local implementation is ready for official test-environment verification, but Gate P1 must not be marked passed until every blocker above has auditable evidence.

# Local completion audit — 12 August 2026

## Decision

The certificate-independent v1 implementation is locally code-complete for the
reviewed scope. This is not a production-release approval and is not evidence of
FURS certification or endorsement.

## Implemented acceptance controls

- Exact decimal and Europe/Ljubljana canonicalization; immutable identity/time/ZOI.
- PKCS#12 signer boundary, outbound RS256 JWS, strict mutual TLS, pinned trust,
  signed-response verification and official-schema validation.
- Invoice, correction/cancellation, business-premise and operator models.
- Confirmed-original protocol references for corrections/cancellations and all
  supported seller tax groups, including flat-rate compensation, in the public contract.
- Explicit network-outage subsequent submission and separate device/VKR block.
- PostgreSQL idempotency, non-reused sequences, immutable evidence, audit,
  digest-locked migrations, transactional outbox, reconciliation, lease recovery
  and worker heartbeat.
- Singular active certificate metadata, append-only reviewed-source provenance and
  one active fiscal delivery across submit/reconcile jobs.
- Separate read/write API credentials, request bounds/rate limits, redacted
  operator console, readiness and Prometheus metrics/alerts.
- Redacted durable result webhooks with stored-payload hashing, HMAC-SHA256,
  bounded retries and dead-letter state.
- A signed terminal-result consumer boundary that authenticates raw bodies before
  parsing and requires durable consumer-side webhook-ID deduplication.
- OpenAPI 3.1 with schema-validated/live-route examples and complete success
  response models, TypeScript/PHP clients, exact receipt-code implementations,
  replay-safe platform event boundaries, raw-body webhook authentication and testkit.
- File-mounted secrets, least-privilege database roles, read-only/drop-capability
  container definition, deployment and incident/restore/rotation runbooks.
- A pinned-action CI image build, CycloneDX SBOM and HIGH/CRITICAL container scan.
- Digest-pinned Node/PostgreSQL images and verified production-only API, worker
  and migration bundles with development sources/tools excluded.
- Fail-closed, redacted evidence executors for official FURS test operations,
  PostgreSQL concurrency/crash recovery, restored-database invariants,
  certificate rotation, controlled test load and a two-day soak.
- A final protected-manifest verifier that binds every required P0-P7 report and
  named approval to the exact clean commit and approved SPDX license.

## Reproducible local evidence

| Check | Result |
|---|---|
| `corepack pnpm check` | 147 passed; 0 failed, skipped or todo; production bundle verifier passed |
| Secret scan | 233 repository files passed |
| `corepack pnpm audit --prod --audit-level=high` | No known vulnerabilities |
| OpenAPI generated artifact | Current and check passes |
| Generated PHP client | `php -l` passes |
| Compose/alerts/CI YAML | Parses successfully |
| Official source check | Core technical/schema/law sources unchanged; SPOT online-retail change remains under documented human review |
| Native PostgreSQL 17.10 | 128 unique allocations, 64-way idempotency, exclusive claims and crash recovery passed |
| Separate logical restore | Read-only high-water, payload-hash, migration and referential checks passed |

The source checker therefore intentionally remains non-green for the affected
online-retail payment-policy release path. Its failure is a retained compliance
freeze, not a failed core protocol test.

Docker is not installed on this workstation, so image build and
`docker compose config` runtime interpolation were not executed. A temporary
native PostgreSQL 17.10 server was executed successfully; its synthetic local
concurrency and logical-restore results are recorded in
`LOCAL_POSTGRES_EVIDENCE_2026-08-12.md`. Production PITR and reviewed evidence
remain separate release gates.

## External and human gates still blocking production

1. Receive and securely install the requested FURS test certificate.
2. Pass strict echo, business-premise lifecycle, invoice, rejection,
   correction and subsequent-submission tests in the official environment.
3. Review the changed SPOT online-retail page recorded in
   `SOURCE_CHANGE_REVIEW_2026-08-12.md`; only then accept its new digest.
4. Obtain accountant/tax-specialist signoff for payment, refund/correction and
   supported-scenario policy.
5. Preserve/review formal PostgreSQL evidence and run production PITR,
   Docker/container scan, load, rotation and two-day soak evidence.
6. Complete external security review, SSO/MFA/reverse-proxy deployment and
   named compliance-owner approval; approve the legal retention/privacy schedule
   described in `docs/DATA_RETENTION_PRIVACY.md`.
7. Approve the final repository/adaptor license and add the corresponding
   `LICENSE` file before calling the distribution open source.

Until those gates pass, keep `FURS_ENVIRONMENT=test` and do not activate this
software for production fiscal issuance.

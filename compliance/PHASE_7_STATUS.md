# Phase 7 implementation status

Last updated: 13 August 2026
Gate status: evidence automation implemented; external executions pending

## Implemented evidence controls

- `evidence:furs` verifies the API is configured for the expected test legal
  entity and source/schema version, submits only an approved protected scenario,
  polls terminal results and writes redacted IDs, states and hashes.
- `evidence:postgres` is locked to a dedicated `furs_evidence` database and tests
  concurrent idempotency, sequence uniqueness, competing outbox claims and stale
  worker recovery with independent PostgreSQL pools.
- `evidence:restore` opens a read-only repeatable-read transaction and verifies
  exact migration digests, sequence high-water state, identity/idempotency
  uniqueness, confirmed evidence, active outbox and every stored payload hash.
- `evidence:rotation` refuses production and proves both old and replacement test
  certificates can perform strict mTLS echo, have distinct fingerprints and move
  validity forward without exposing certificate contents.
- `evidence:load` requires explicit shared-test-service approval, imposes hard
  volume/concurrency limits, creates unique identities and reports redacted
  uniqueness plus latency evidence.
- `evidence:soak` defaults to 48 hours, creates a fresh invoice identity each
  cycle and emits only aggregate counts with a chained evidence hash.
- CI builds the release Dockerfile with commit-pinned actions, emits a CycloneDX
  SBOM and rejects HIGH/CRITICAL image vulnerabilities.
- Node and PostgreSQL image tags are manifest-digest pinned. The local release
  verifier builds portable production-only API/worker/persistence bundles,
  imports their entry points, checks all migrations/assets and rejects internal
  sources, tests, PGlite and the TypeScript compiler.
- CI compares the reviewed Node and PostgreSQL Docker Hub tag metadata with the
  pinned manifest digests and fails when either mutable tag is repointed.
- `release:verify` validates a protected P0-P7 evidence manifest against the
  exact clean commit and refuses unresolved sources, incomplete official FURS
  paths, insufficient load/soak/restore/rotation/drills/alerts, security findings,
  unnamed approvals or an unapproved/missing final license.
- Apache-2.0 is selected for the repository and all current standalone packages;
  canonical license text, notices, DCO policy, dependency inventory and runtime
  image preservation are machine-checked.

The API exposes authenticated read-only system identity metadata so evidence
runners can prove they are targeting the intended test deployment. The crypto
spike and all service runtime paths read certificate passphrases from protected
files, never command-line arguments or environment values.

## Local acceptance evidence

- `corepack pnpm check`: 147 passed, 0 failed, 0 skipped, 0 todo; release layout passed.
- Secret scan: 239 files passed.
- Production dependency audit: no known vulnerabilities.
- OpenAPI consistency, PHP syntax and four deployment/CI YAML files pass.
- Native PostgreSQL 17.10 concurrency/crash and separate logical-restore
  integrity rehearsals passed with redacted local evidence.
- A real FURS test PKCS#12 passed strict TLS 1.3 Echo, missing/wrong-client
  rejection and verified signed-rejection controls. Raw credentials, requests
  and JWS tokens remain outside the repository and retained evidence is redacted.
- GitHub Actions built the release image, uploaded its CycloneDX SBOM and passed
  the HIGH/CRITICAL Trivy gate on commit `29467e3`.

## External gates still required

The local PostgreSQL and logical-restore runners have now executed against a
temporary native PostgreSQL 17.10 server. Their local report is not production
PITR or named reviewer approval. The test certificate, initial official FURS
cryptographic evidence and CI container scan are available. Business-premise,
confirmed-invoice, correction, subsequent-submission, PITR, rotation, load and
48-hour soak evidence must still be executed and reviewed before production
approval. The technical retention hold is documented, but the data
controller/legal retention and privacy schedule also requires approval.

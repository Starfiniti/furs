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

## Current acceptance evidence

- `corepack pnpm check`: 157 passed, 0 failed, 0 skipped, 0 todo; release layout passed.
- Secret scan passed; protected evidence and credentials remain outside Git.
- Production dependency audit: no known vulnerabilities.
- Native PostgreSQL 17.10 concurrency/crash, worker-stop recovery and separate
  logical-restore integrity rehearsals passed with redacted evidence.
- Strict official-test mTLS, signed response, premise lifecycle, standard invoice,
  correction and subsequent-submission evidence passed.
- Official Prometheus `promtool` 3.13.1 parsed all six alert rules and synthetic
  unit tests proved firing for certificate, clock, retry backlog, manual review
  and worker-heartbeat categories; end-to-end delivery remains open.
- A 48-hour soak began on 13 August 2026 with a 15-minute interval. Its first
  cycle passed, but the release gate remains open until the full elapsed duration
  and final chained report are verified.

## External gates still required

The local PostgreSQL/logical-restore report is not production PITR or named
reviewer approval. The active soak must finish. Peak load requires explicit
shared-test-service volume approval. Rotation requires a second test certificate.
Production PITR, live alert delivery, independent security review, accountant
scenario signoff, named compliance ownership and the controller/legal retention
and privacy schedule remain required before production approval.

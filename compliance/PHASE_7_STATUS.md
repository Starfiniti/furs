# Phase 7 implementation status

Last updated: 12 August 2026
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

The API exposes authenticated read-only system identity metadata so evidence
runners can prove they are targeting the intended test deployment. The crypto
spike and all service runtime paths read certificate passphrases from protected
files, never command-line arguments or environment values.

## Local acceptance evidence

- `corepack pnpm check`: 147 passed, 0 failed, 0 skipped, 0 todo; release layout passed.
- Secret scan: 232 files passed.
- Production dependency audit: no known vulnerabilities.
- OpenAPI consistency, PHP syntax and four deployment/CI YAML files pass.

## External gates still required

No runner output exists yet because the requested FURS test certificate, Docker
and a real PostgreSQL server are unavailable on this workstation. The scripts
are executable controls, not fabricated evidence. Official FURS operations,
PostgreSQL/container runs, restore, rotation, load and 48-hour soak must be
executed and reviewed before production approval. The technical retention hold
is documented, but the data controller/legal retention and privacy schedule also
requires approval.

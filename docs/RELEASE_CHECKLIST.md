# Production release checklist

Production remains blocked until every applicable item has dated evidence and a
named reviewer. A green local test suite is necessary but not sufficient.

- [ ] Official source checker is green and source register is reviewed.
- [ ] FURS test certificate metadata is recorded without storing secret material.
- [ ] Strict mTLS echo succeeds; missing/wrong client certificate fails.
- [ ] Official test invoices cover standard, rejection, timeout, subsequent submit and correction.
- [ ] Business-premise register, update and close succeed in the test environment.
- [ ] Signed responses reject tampered header, payload, signature and trust chains.
- [ ] Independent ZOI and 60-digit receipt-code vectors match.
- [ ] Real PostgreSQL multi-connection sequence/outbox crash tests pass.
- [ ] Two-day stable FURS test-environment soak passes.
- [ ] Peak load plus safety margin passes without duplicate identities.
- [ ] Certificate and trust-chain rotation rehearsals pass.
- [ ] Backup, PITR restore and sequence high-water reconciliation pass.
- [ ] Network-outage and issuing-device/VKR drills pass separately.
- [ ] Certificate expiry, clock drift, retry age and manual-review alerts fire.
- [ ] Container/dependency/secret scans have no unresolved high or critical issues.
- [ ] External security review accepts certificate, auth and crypto boundaries.
- [ ] Data controller and legal reviewers approve the record-class retention/privacy schedule and backup expiry behavior.
- [ ] Slovenian accountant/tax specialist signs the supported scenario matrix.
- [ ] A named compliance owner accepts production responsibility.
- [x] Repository and current standalone adapters use Apache-2.0; `LICENSE`, `NOTICE`, dependency inventory and DCO policy are present.

Record unsupported scenarios explicitly. Never describe this software as FURS-certified.

## Final evidence manifest

Copy `templates/release-evidence-manifest.example.json` to a protected path
outside the repository. Replace every placeholder only from reviewed evidence;
leave the committed template deliberately failing closed. Store report/review
SHA-256 values and named decisions in the manifest, while keeping sensitive
reports in the protected release archive.

Set `FURS_RELEASE_EVIDENCE_MANIFEST_PATH` to that absolute external path and run:

```text
corepack pnpm release:verify
```

The verifier requires a clean worktree and an exact HEAD commit match. It rejects
production-labelled test evidence, unresolved official-source changes, missing
FURS scenarios, PostgreSQL/restore/rotation gaps, load below 3x expected peak,
a soak shorter than 48 hours, incomplete drills/alerts, container HIGH/CRITICAL
findings, placeholder or unapproved reviewers, and a missing/mismatched final
SPDX `LICENSE`. Preserve its redacted success output with the release evidence.

The `container-security` CI job builds the actual Dockerfile, produces a
CycloneDX SBOM and fails on any HIGH/CRITICAL image finding. Every third-party
action is pinned to a full commit SHA; the Trivy action is pinned to the signed
v0.36.0 release. Preserve the green workflow URL and SBOM artifact with release
evidence. A workflow definition without a successful GitHub run is not evidence
that this gate passed.

## Official test evidence runner

Copy `templates/furs-evidence-scenario.example.json` to a protected path outside
the repository. Set its configured legal-entity UUID and add only scenarios
approved for test execution. Do not commit fiscal commands or tax numbers.

```text
FURS_API_URL=http://127.0.0.1:8080
FURS_API_WRITE_TOKEN_FILE=<protected write-token path>
FURS_EVIDENCE_SCENARIO_PATH=<protected scenario path>
```

Run `corepack pnpm evidence:furs`. The runner refuses a production-configured
API and emits only document IDs, states and cryptographic hashes. Redirect its
JSON output into the protected release-evidence archive and record the commit SHA.

For the required continuous run, mark at least one approved standard test
invoice operation with `"repeatEachCycle": true` in the protected scenario.
Run `corepack pnpm evidence:soak`; defaults are 48 hours and one cycle every 15
minutes. Each cycle receives a fresh message ID, local issue time and
idempotency key, while the final report contains only aggregate counts and a
SHA-256 evidence chain. Worker restarts and controlled network interruptions
must still be orchestrated and recorded by the reviewer during the run.

For a reviewed test-load scenario containing one ordinary standard invoice,
set `FURS_LOAD_CONFIRMATION=furs-test-load-approved`, plus the desired
`FURS_LOAD_TOTAL` and `FURS_LOAD_CONCURRENCY` (hard limits: 1000 and 20). Run
`corepack pnpm evidence:load`. It creates fresh message IDs, issue times and
idempotency keys; requires the configured expected terminal result; proves
document/fiscal-identity uniqueness; and reports redacted p50/p95 latency.
Agree the load and schedule with the responsible reviewer before contacting the
shared FURS test service.

# Production release checklist

Production remains blocked until every applicable item has dated evidence and a
named reviewer. A green local test suite is necessary but not sufficient.

- [ ] Official source checker is green and source register is reviewed.
- [x] FURS test certificate metadata is recorded without storing secret material.
- [x] Strict mTLS echo succeeds; missing/wrong client certificate fails.
- [ ] Official test invoices cover standard, rejection, timeout, subsequent submit and correction.
- [x] Business-premise register, update and close succeed in the test environment.
- [x] Signed responses reject tampered header, payload, signature and trust chains.
- [x] Independent ZOI and 60-digit receipt-code vectors match.
- [x] Real PostgreSQL multi-connection sequence/outbox crash tests pass.
- [ ] Two-day stable FURS test-environment soak passes.
- [ ] Peak load plus safety margin passes without duplicate identities.
- [ ] Certificate and trust-chain rotation rehearsals pass.
- [ ] Backup, PITR restore and sequence high-water reconciliation pass.
- [ ] Network-outage and issuing-device/VKR drills pass separately.
- [x] Certificate expiry, clock drift, retry age and manual-review alerts fire locally and traverse Alertmanager; production routing remains deployment evidence.
- [x] Container/dependency/secret scans have no unresolved high or critical issues.
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

For the separate controlled network-outage gate, copy
`templates/furs-network-outage-scenario.example.json` to a protected path
outside the repository and replace every placeholder. Use an isolated test
window with an empty outbox and a healthy worker. While outbound connectivity
from the worker to the FURS test endpoint is blocked, set:

```text
FURS_OUTAGE_CONFIRMATION=furs-test-network-outage-approved
FURS_OUTAGE_PHASE=prepare
FURS_OUTAGE_SCENARIO_PATH=<protected scenario path>
FURS_OUTAGE_STATE_PATH=<protected state path>
FURS_API_URL=http://127.0.0.1:8080
FURS_API_WRITE_TOKEN_FILE=<protected write-token path>
```

Run `corepack pnpm evidence:outage`. The prepare phase fails unless the worker
remains healthy, the invoice remains `ISSUED_WITHOUT_EOR`, a failed connection
attempt is observed and the same command remains in the durable outbox. Always
restore connectivity in an operating-system-level `finally`/cleanup boundary.
Then set `FURS_OUTAGE_PHASE=recover` and
`FURS_OUTAGE_EVIDENCE_PATH=<protected evidence path>` and run the same command.
Recovery fails unless the official test service confirms the same document,
invoice sequence, issue time, message ID, payload digest and ZOI digest with the
explicit subsequent-submission flag. This is network-outage evidence only; it
must never be used as evidence for the legally separate issuing-device/VKR
procedure.

Copy `templates/furs-load-scenario.example.json` to a protected path, replace
every placeholder and record the reviewed `expectedPeakPerSecond`. Set
`FURS_LOAD_CONFIRMATION=furs-test-load-approved`, plus the desired
`FURS_LOAD_TOTAL` and `FURS_LOAD_CONCURRENCY` (hard limits: 1000 and 20). Run
`corepack pnpm evidence:load`. It creates fresh message IDs, issue times and
idempotency keys; requires the configured expected terminal result; proves
document/fiscal-identity uniqueness; and reports elapsed throughput plus redacted
p50/p95 latency. The command exits non-zero when achieved throughput is below
three times the reviewed peak. Agree the load and schedule with the responsible
reviewer before contacting the shared FURS test service.

For local end-to-end alert-routing evidence, use the official Alertmanager binary
whose release archive checksum was independently verified. Set
`FURS_ALERTMANAGER_EXECUTABLE_PATH`, an external protected
`FURS_ALERT_EVIDENCE_DIR`, the independently recorded
`FURS_ALERTMANAGER_EXECUTABLE_SHA256`, and
`FURS_ALERT_DELIVERY_CONFIRMATION=furs-alert-routing-approved`, then run
`corepack pnpm evidence:alerts`. The runner starts an isolated loopback-only
Alertmanager and webhook receiver, submits every required release alert category,
and fails unless all categories traverse the real routing path. Its output
deliberately records `productionRoutingVerified: false`; production receiver,
escalation and access-control evidence remains a deployment gate.

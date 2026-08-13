# FURS test load evidence — 13 August 2026

## Decision

The Phase 7 peak-load acceptance gate remains **open**. The approved expected
peak was 60 invoices per second, so the repository policy required at least
180 confirmed invoices per second. The final bounded run achieved 67.198 per
second.

This is a capacity-gate failure, not a fiscal-integrity failure: every submitted
invoice reached `CONFIRMED`, all 1,000 document IDs and fiscal identities were
unique, and no duplicate identity was observed. No further shared FURS test
load was executed after the final approved run.

## Approval and scope

- environment: official FURS test environment;
- reviewed by: Dejan Kletečki;
- policy version: `starfiniti-v1-2026-08-13`;
- approved expected peak: 60 invoices per second;
- required safety target: 180 confirmed invoices per second (3×);
- bounded volume: 1,000 invoices;
- bounded worker/load concurrency: 250;
- FURS technical documentation: 3.2;
- pinned technical-documentation SHA-256:
  `7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547`;
- pinned official-schema SHA-256:
  `6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd`.

## Final run result

| Measure | Result |
| --- | ---: |
| submission canary | confirmed |
| terminal invoices | 1,000 confirmed |
| unique documents | 1,000 |
| unique fiscal identities | 1,000 |
| duplicate fiscal identities | 0 |
| elapsed time | 14,881 ms |
| achieved throughput | 67.198/s |
| required throughput | 180/s |
| minimum latency | 700 ms |
| p50 latency | 3,457 ms |
| p95 latency | 4,656 ms |
| maximum latency | 4,745 ms |

Protected evidence artifact: `load-1786623530088.json`.

- semantic evidence SHA-256:
  `b8952eeb54ce448b63381415dc2d525047402f7d5270ca989b368eeab4359ce9`;
- complete protected-file SHA-256:
  `051381aaff64a4921c9c7b74f78b6ed2263b49c61013e49088be07902829870e`.

The protected artifact remains outside Git and contains redacted aggregate
evidence only.

## Engineering finding

The run exposed a configuration mismatch before submission: the worker and
runtime accepted a batch of 250 while the authoritative PostgreSQL claim layer
still rejected values above 100. No load run occurred in that failed start.
Digest-locked migration `014_worker_claim_capacity.sql` and a real PostgreSQL
regression test now align the bounded claim capacity at 250 while keeping the
runtime default at 1.

The successful 1,000/1,000 confirmations do not waive the throughput gate.
Before another shared-service load run, capacity architecture and the expected
peak must be reviewed, a new explicit reviewer approval must be recorded, and
the test must remain bounded and scheduled with the responsible party.

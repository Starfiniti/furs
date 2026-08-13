# Network-outage and subsequent-submission evidence — 13 August 2026

## Decision

The technical `FURS-OUT-001` and `FURS-OUT-002` network-connectivity drill
passed against the official FURS test environment. This evidence does not cover
failure of the electronic issuing device or the human VKR/sales-book procedure.

## Controlled scenario

- environment: FURS test;
- scenario: one fresh standard invoice with explicit `SubsequentSubmit`;
- interruption boundary: only `blagajne-test.fu.gov.si` was temporarily
  resolved to a closed loopback TCP target;
- preflight: the official IPv4 endpoint was reachable on port 9002 before the
  interruption and the controlled target was proven unreachable before invoice
  creation;
- software boundary: API, PostgreSQL and a freshly started worker remained
  operational;
- restoration: the Windows hosts file was restored byte-for-byte to its
  original SHA-256 and no temporary firewall rule remained.

The prepared state recorded `connectivity-interrupted`, a healthy worker and one
durably retained outbox job. After normal name resolution was restored, the
worker automatically confirmed that same retained job before the evidence
runner's explicit retry request. The resulting HTTP 409 represented an already
terminal document, not a failed recovery. A fresh authenticated read proved the
confirmation before the runner accepted the result.

## Preserved identity and terminal evidence

The protected final artifact verifies all of the following:

- final status `CONFIRMED`;
- same document ID;
- same invoice sequence;
- same local issue time;
- same message ID;
- same canonical payload SHA-256;
- same ZOI SHA-256;
- explicit subsequent-submission flag;
- verified signed FURS response;
- operational issuing software throughout the connectivity interruption;
- zero active outbox jobs after recovery;
- zero evidence failures.

The protected artifact remains outside Git:
`network-outage-20260813-145924-evidence.json`.

- semantic evidence SHA-256:
  `b5363afeed6f1a537caf9b84cf8f964fb1eeb49c2c35d8ae7df02b3e80ed14a1`;
- complete protected-file SHA-256:
  `dc26a41b1776eecb9d0d5bdcf868916308c29f335a9471e7a53c1df4ce46cdd9`;
- FURS technical documentation v3.2 SHA-256:
  `7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547`;
- official schema SHA-256:
  `6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd`.

## Regression finding

Recovery may race with the normal durable worker: the worker can confirm the
retained job before, or between, an evidence read and an explicit operator retry.
The runner now skips retry for an already confirmed document and accepts a retry
HTTP 409 only when a fresh authenticated read proves that exact immutable
document is confirmed. Other 409 outcomes still fail closed. Regression tests
cover both timing windows and changed fiscal identity remains rejected.

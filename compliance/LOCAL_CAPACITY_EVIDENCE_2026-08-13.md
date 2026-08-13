# Local mTLS transport capacity evidence — 13 August 2026

## Decision

The local transport-capacity gate passes after replacing one TLS connection per
request with a bounded, persistent mTLS agent. This evidence is deliberately
local: it used repository fixture certificates and a loopback HTTPS server and
did not contact a FURS endpoint.

The official Phase 7 FURS load gate remains open. Its last approved run achieved
67.198 confirmed invoices/second against the required 180/second. A new bounded
shared-service run still requires explicit reviewer approval.

## Requirement and source review

- phase and gate: Phase 7, local capacity analysis supporting `FURS-REL-001`;
- related invariants: `FURS-TLS-001`, `FURS-TLS-002`, `FURS-ID-002`;
- official technical-documentation version reviewed: 3.2;
- source check date: 2026-08-13;
- technical documentation and pinned official schemas: unchanged;
- SPOT online-retail guidance: changed digest, still held for named
  accountant/tax review and not used to justify this transport change.

## Reproducible result

Command:

```text
corepack pnpm evidence:capacity:local
```

| Measure | Result |
| --- | ---: |
| local fixture requests | 1,000 |
| client concurrency | 100 |
| maximum mTLS sockets | 32 |
| secure connections observed | 32 |
| unique connections observed | 32 |
| elapsed time | 496.651 ms |
| achieved local throughput | 2,013.486/s |
| comparison target | 180/s |
| strict mTLS verification | passed |
| socket bound | passed |
| FURS endpoint contacted | no |

Evidence SHA-256:
`0b396c0ff202bdec0239d0e14bafaa9ce1bb61fe68c7c07adc9d7403e36c61ec`.

The runner reports elapsed performance for this workstation, but the durable
regression assertion is protocol and connection behavior: every response must
arrive over an authorized TLS 1.2/1.3 connection and the number of connections
must not exceed the configured bound. Workstation timing is not a production
capacity guarantee.

## Engineering finding and change

The previous low-level path created and destroyed a new `https.Agent` for every
request, forcing one full mutually authenticated TLS connection per invoice. A
500-request loopback diagnostic measured 169.1 requests/second and 500 secure
connections with that behavior. Reusing a bounded agent in the same diagnostic
reduced the connections to 32 and measured 1,593 requests/second.

The production transport now owns one strictly configured agent per runtime:

- `keepAlive` is enabled;
- active, total and free sockets share a configurable hard bound;
- the default bound is 32 and accepted values are 1 through 250;
- CA trust, hostname verification, client-certificate authentication and the
  TLS 1.2–1.3 bounds remain mandatory;
- TLS session caching remains disabled;
- oversized responses destroy the affected connection and fail closed;
- runtime shutdown explicitly destroys the agent.

No invoice identity, sequence, timestamp, ZOI, retry, schema, persistence or
immutability behavior changed. The FURS batch endpoint remains deferred; this
change does not introduce undocumented batching or broaden the approved load
scope.

## Remaining acceptance work

The local result shows that the client transport is no longer the measured
workstation bottleneck. It does not establish FURS service capacity, end-to-end
PostgreSQL/worker capacity under official latency, production network capacity,
or permission to send another load. After the active soak and operational checks,
a named reviewer may approve one new bounded FURS test run to reassess the
180/second Phase 7 gate.

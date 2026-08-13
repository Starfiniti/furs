# Alertmanager delivery evidence – 13 August 2026

## Scope

Requirements: `FURS-CERT-001`, `FURS-CLOCK-001`, `FURS-OUT-001`,
`FURS-AUD-001` and `FURS-REL-001`. This report complements the committed
Prometheus rule-evaluation evidence with an actual Alertmanager notification
routing test. It is local pre-production evidence, not production receiver
approval.

The official Alertmanager 0.32.1 Windows AMD64 release archive was downloaded
from the Prometheus GitHub release. Its SHA-256 matched the published asset
digest:

`04191f62a87a944371abda919eedf2e36066ad544aa5d09c22620343e3046873`

The extracted executable SHA-256 was:

`86c81cbccd585a350edff94f757ab9e29820709d6d71c8be98faae1d21b879c3`

## Result

`corepack pnpm evidence:alerts` started an isolated Alertmanager bound only to
loopback, configured a temporary loopback webhook, submitted synthetic firing
alerts through Alertmanager's v2 API and observed five webhook deliveries. The
following required categories all traversed the real grouping/routing path:

- certificate expiry;
- clock drift;
- retry/unconfirmed backlog;
- manual review;
- missing worker heartbeat.

The first delivery arrived after 9,948 milliseconds. The redacted evidence
payload SHA-256 is
`2fd51307d5a5d60bc03b0666e2e74059b99fdb5843c8eed34c25d17335570a53`;
the complete protected JSON file SHA-256 is
`f701cabca859cae12387adeb0a58233fe38b01f61dff5ed848ceac329dc913dd`.

## Evidence boundary

The protected evidence and temporary Alertmanager state are outside Git. The
runner accepts only a credential-free loopback webhook and records
`productionRoutingVerified: false`. This proves local rule-to-router delivery
when combined with `promtool` rule tests. A named production receiver, on-call
escalation, access controls, network policy and notification-provider
availability remain deployment review items.

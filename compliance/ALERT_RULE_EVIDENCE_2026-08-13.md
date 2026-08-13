# Prometheus alert-rule evidence – 13 August 2026

## Scope

Requirements: `FURS-CERT-001`, `FURS-CLOCK-001`, `FURS-OUT-001`,
`FURS-AUD-001` and `FURS-REL-001`.

The production rule file was parsed and unit-tested with the official Prometheus
`promtool` 3.13.1 Windows AMD64 release. The downloaded archive SHA-256 matched
the digest published in the GitHub release API:

`5409abdcac847984ab7869d7814e6e8cff65b4411d62e7477b960b92eadfa08a`

## Result

`promtool check rules deployment/prometheus-alerts.yml` parsed all six rules.
`promtool test rules prometheus-alerts.test.yml`, executed from `deployment`,
proved the configured hold times and firing labels/annotations for:

- manual review present after five minutes;
- oldest unconfirmed invoice over one hour after five minutes;
- certificate expiry warning after one hour;
- certificate critical window after five minutes;
- clock drift after two minutes;
- missing/stale worker heartbeat after one minute.

The committed synthetic input is `deployment/prometheus-alerts.test.yml`. It
contains no credentials or operational data.

## Evidence boundary

This proves PromQL syntax and deterministic transition to firing for all required
categories. It does not prove production scraping, Alertmanager routing, receipt
by a named operator, escalation or notification-provider availability. The final
release alert gate therefore remains unchecked until an end-to-end deployment
drill records those events.

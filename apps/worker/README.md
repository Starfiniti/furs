# Starfiniti FURS worker

Durable outbox processor. It claims PostgreSQL jobs with `SKIP LOCKED`, signs
the already-persisted payload, uses strict mTLS, verifies the signed FURS
response, and commits attempt evidence with the resulting state transition.

The worker recovers stale leases after process crashes, applies bounded retry
backoff, and routes certificate, trust, schema and signature anomalies to
manual review. It never creates a new invoice identity during delivery.

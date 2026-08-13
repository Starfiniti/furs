# Worker stop and durable-outbox recovery evidence – 13 August 2026

## Scope

Requirements: `FURS-ID-002`, `FURS-IDEMP-001`, `FURS-OUT-001` and
`FURS-AUD-001`. Environment: official FURS test environment through the local
test API/worker; no production system or data was involved.

## Drill and result

1. The only test worker was stopped.
2. One synthetic self-service invoice was accepted by the API and durably entered
   `READY` with invoice sequence `4` while no worker was running.
3. After 41.145 seconds the authenticated metrics endpoint reported a stale
   worker heartbeat and exactly one active outbox item.
4. The worker was restarted with the protected certificate and database-password
   files outside the repository.
5. The queued document reached `CONFIRMED`; its document ID and sequence `4`
   remained unchanged. The active outbox returned to zero and heartbeat age was
   3.825 seconds at the recorded observation.

No retry created a new invoice identity or sequence. The first restart attempt
used an incorrect local database name and failed closed before submission; the
queued record remained durable and was then processed after the configuration
was corrected. This is useful runbook evidence that startup configuration errors
do not discard the authoritative queue.

## Evidence boundary

The protected redacted JSON artifact has SHA-256
`16054527be8c275239a835623a6394d54607f8e47d60b249568c47a9fe2344ba`.
It contains no tax number, bearer token, certificate material, invoice payload,
ZOI, EOR or signed FURS response.

This proves worker-stop/durable-queue recovery for one synthetic test invoice.
It is not the separate legal network-outage/subsequent-submission drill, a device
failure/VKR drill, peak-load evidence or production failover evidence.

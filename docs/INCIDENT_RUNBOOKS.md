# Incident runbooks

## FURS connectivity outage

1. Confirm the issuing device/software is operational; do not confuse device
   failure with network loss.
2. Preserve the existing fiscal identity, issue time, payload and ZOI.
3. Monitor `ISSUED_WITHOUT_EOR`, retry age and the legal submission deadline.
4. Restore connectivity and use durable subsequent submission/reconciliation.
5. Verify the signed response before recording EOR; retain only redacted hashes.
6. Escalate any unknown outcome or expired window to manual review.

## Issuing device/software failure

1. Block ordinary electronic issuance from the failed device.
2. Activate the approved VKR/operator sales-book procedure.
3. Do not disguise the event as a network retry.
4. Preserve paper identifiers and later submit the reviewed SalesBookInvoice flow.
5. Reconcile electronic and sales-book records before restoring normal operation.

## Invalid signed response or trust anomaly

1. Never mark the invoice confirmed.
2. Move the document to `MANUAL_REVIEW` and alert security/operations.
3. Preserve raw material only in encrypted restricted incident storage.
4. Check source changes, response certificate chain, clock and FURS notices.
5. Do not disable verification to clear the queue.

## Certificate compromise or expiry

1. Stop the affected signer and preserve audit evidence.
2. Contact the designated responsible person and follow official revocation rules.
3. Rotate credentials/certificate and validate metadata before activation.
4. Run echo and signed-response tests, then reconcile the affected interval.

## PostgreSQL outage or restore

1. Stop API intake and workers if database authority is unavailable.
2. Restore using `docs/BACKUP_RESTORE.md`; never recreate identities in memory.
3. Reconcile sequence high-water marks and all active documents before restart.

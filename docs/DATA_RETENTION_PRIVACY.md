# Data retention and privacy posture

Last updated: 12 August 2026
Gate status: technical controls defined; legal retention schedule and controller approval pending

## Scope and decision

Fiscal documents, immutable canonical payloads, correction links, attempts,
audit events, idempotency records and sequence state are authoritative compliance
records. The v1 service has no automatic deletion, anonymization or compaction
job for those records. This fail-closed hold remains in place until a Slovenian
accountant/legal reviewer and the data controller approve a record-class retention
schedule that accounts for fiscal, accounting, tax, privacy and dispute duties.

The hold is not a claim that every record must be kept forever. It prevents an
unreviewed cleanup setting from destroying invoice identity or evidence. A future
retention implementation requires its own requirement IDs, migration, restore
tests, legal review and rollback/evidence plan.

## Data minimization already enforced

- PostgreSQL stores certificate metadata and fingerprints, never private keys,
  PKCS#12 bytes or certificate passphrases.
- Raw signed JWS requests/responses are not stored in ordinary tables, logs,
  webhooks or metrics. Durable evidence uses canonical-payload and response hashes.
- Operational endpoints, webhooks and console views expose internal identifiers,
  status and the minimum result evidence; they do not return certificate material.
- Logs and metrics use allowlisted fields and omit full tax numbers, invoice
  payloads, operator identity values and customer data.
- Source-review records contain source provenance, digests, dates and reviewer
  identity, not invoice/customer data.

## Access and processing rules

- Treat stored fiscal payloads, operator identifiers, correction links, database
  backups and corresponding exports as confidential fiscal/personal data.
- Limit API write, API read, worker, migration, backup and security-review roles
  separately. Audit privileged changes and restore operations.
- Encrypt database storage, backups and transport; keep backups outside ordinary
  application access and test restores using the controlled runbook.
- Do not copy production records into developer fixtures, issue trackers, CI,
  support tools or AI prompts. Use synthetic data for local and automated tests.
- A data-subject or deletion request must be routed to the data controller. The
  application must not silently edit confirmed evidence; any lawful restriction,
  export or later redaction process must preserve required fiscal integrity.

## Record classes requiring a dated schedule before production

| Record class | Current v1 action | Decision owner |
|---|---|---|
| Fiscal documents, payloads, identities and correction links | Indefinite technical hold; no automated deletion | Data controller + accountant/legal reviewer |
| Attempts, audit events and idempotency evidence | Same hold as the fiscal record they protect | Compliance owner |
| Sequence and migration/source ledgers | Preserve as authoritative integrity state | Compliance owner |
| Certificate metadata and rotation audit | Preserve for the approved audit period; revoke/rotate secret material separately | Security + compliance owners |
| Database backups/PITR archives | Protected schedule pending RPO/RTO and legal review | Operations + data controller |
| Application/reverse-proxy/security logs | Minimized, access-restricted schedule pending deployment threat review | Security owner |
| Release evidence and SBOMs | Protected per-release archive schedule pending release policy | Release owner |

## Production gate

Before production, record the controller, processors/subprocessors, purposes and
legal bases, exact retention/deletion periods, backup-expiry behavior, subject-right
handling, breach contacts, cross-border processing, access-review cadence and the
named approvers. Execute and retain evidence of a restore and an authorized expiry
exercise against synthetic/non-authoritative data. Until then this document closes
the unsafe-default design question but does not complete the P7 privacy review.

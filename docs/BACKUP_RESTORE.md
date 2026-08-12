# PostgreSQL backup and restore

PostgreSQL is authoritative for fiscal identity, idempotency, payload evidence,
outbox, attempts and audit. Back up with encrypted storage, restricted access and
tested point-in-time recovery appropriate to the deployment.

## Rehearsal procedure

1. Stop API writes and workers at a recorded instant or use a consistent PITR point.
2. Restore into an isolated database with no FURS network access.
3. Run migrations and integrity checks without changing fiscal records.
4. Compare document, idempotency, sequence-allocation, attempt, outbox and audit counts.
5. Confirm the maximum allocated sequence is below the database sequence's next value.
6. Confirm every active document has an appropriate active/recoverable outbox path.
7. Start one worker against a fake/test transport and verify stale-lease recovery.
8. Record hashes/counts and reviewer approval before returning a production restore.

Never decrement `furs.invoice_number_sequence`. Gaps are legal safety evidence;
reuse is forbidden. Never restore production into the FURS test environment with
active delivery enabled.

## Real PostgreSQL concurrency/crash evidence

Create a new disposable database named exactly `furs_evidence`; never point the
runner at an operational database. The runner refuses any other database name,
requires the literal confirmation `furs_evidence`, and refuses a database that
already contains fiscal documents.

```text
DATABASE_URL=postgresql://<owner>@<host>:5432/furs_evidence
DATABASE_PASSWORD_FILE=<protected password path>
FURS_EVIDENCE_DATABASE_CONFIRMATION=furs_evidence
```

Run `corepack pnpm evidence:postgres`. It uses two independent connection pools,
128 concurrent unique allocations, 64 concurrent idempotent reservations,
competing outbox claims, a simulated crashed lease, recovery, and a sequence
high-water assertion. Archive its redacted JSON output, then destroy the
disposable database through the approved database-administration procedure.

When Docker is available, `compose.evidence.yaml` creates that database on an
ephemeral `tmpfs`, runs the same evidence harness, and has no external network:

```bash
docker compose -f compose.evidence.yaml up --build --abort-on-container-exit \
  --exit-code-from postgres-evidence-runner
```

Archive the runner's JSON log, then run `docker compose -f
compose.evidence.yaml down`. The database disappears with the containers.

## Restored database verifier

After restoring into an isolated PostgreSQL instance with outbound FURS access
blocked, set `FURS_RESTORE_CONFIRMATION=read-only-restore-verification` and run
`corepack pnpm evidence:restore`. The verifier opens a repeatable-read,
read-only transaction and checks sequence high-water, fiscal identity
uniqueness, idempotency references, EOR completeness, active outbox coverage,
audit coverage, migration digests and every stored canonical payload hash. It
outputs only counts and hashes; it never outputs payloads or tax numbers.

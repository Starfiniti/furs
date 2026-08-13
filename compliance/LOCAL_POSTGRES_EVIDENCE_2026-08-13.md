# Local PostgreSQL recovery evidence – 13 August 2026

## Scope

Requirements: `FURS-ID-002`, `FURS-IDEMP-001`, `FURS-OUT-001`,
`FURS-AUD-001` and `FURS-REL-001`.

This is synthetic, certificate-independent evidence from an isolated local
PostgreSQL 17.10 server. It does not contain tax numbers, invoice payloads,
certificate material, tokens or production data. It is not evidence of
encrypted production backups, WAL archiving/PITR, production RPO/RTO or an
independent production review.

## Concurrency and crash recovery

`corepack pnpm evidence:postgres` ran against the guarded disposable database
named exactly `furs_evidence` and produced:

| Control | Result |
|---|---|
| Concurrent unique sequence allocations | 128/128 unique |
| Concurrent callers sharing one idempotency key | 64 |
| Sequences returned to those idempotent callers | 1 |
| Competing outbox claim | Mutually exclusive |
| Simulated crashed lease | Recovered |
| Outbox job identity after recovery | Preserved |
| Sequence high-water | Safe |
| Digest-tracked migrations | 13 |

## Logical backup and isolated restore

`pg_dump --format=custom` created a 78,954-byte synthetic backup with SHA-256:

`72172910d77e7fbe5372d1191d8e4b564b6d8784b30d8ac70dd76257c00800e0`

The dump was restored into the separate database `furs_restore_evidence`.
`corepack pnpm evidence:restore` then ran in a repeatable-read, read-only
transaction and proved:

- sequence high-water is not below any allocation;
- payload hashes match stored canonical payloads;
- fiscal identity, idempotency, EOR, outbox, audit and migration checks pass;
- restored counts are one document, one attempt and three audit events;
- counts SHA-256 is
  `47345f967bbf162ffe6f2280217c6112b1c2e7a197f3660b437646e9a515501d`.

The detailed redacted JSON report and dump are kept in the protected local
evidence archive outside the repository. The two disposable databases are
removed after verification; the operational `furs_runtime` database is not
modified by this rehearsal.

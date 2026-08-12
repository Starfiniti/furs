# Local PostgreSQL evidence — 12 August 2026

## Scope and status

Requirements: FURS-ID-002, FURS-IDEMP-001, FURS-OUT-001, FURS-AUD-001 and
FURS-REL-001.

This report records a certificate-independent local rehearsal. It is synthetic,
redacted evidence of the repository controls, not production PITR evidence and
not a reviewer-approved P7 report.

## Runtime provenance

- PostgreSQL: `17.10`, x86-64 Windows, EDB binary distribution linked from the
  official PostgreSQL Windows download page.
- Archive: `postgresql-17.10-2-windows-x64-binaries.zip`, 333,927,270 bytes.
- Archive SHA-256:
  `ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106`.
- Source: `https://get.enterprisedb.com/postgresql/postgresql-17.10-2-windows-x64-binaries.zip`.
- The server was extracted under ignored workspace `tmp`, bound only to
  `127.0.0.1:55432`, and never installed as a Windows service.
- The disposable cluster used local trust authentication. No production or FURS
  credential was used; the evidence runner's required password-file input was a
  non-secret placeholder ignored by the local server.

## Multi-connection and crash-recovery run

Command: `corepack pnpm evidence:postgres`.

Generated at `2026-08-12T17:01:44.309Z`:

| Control | Result |
|---|---|
| Unique concurrent allocations | 128 of 128 |
| Concurrent idempotent callers | 64 |
| Resulting idempotent sequences | 1 |
| Competing outbox claim | Mutually exclusive |
| Simulated stale worker lease | Recovered |
| Outbox job identity after recovery | Preserved |
| Sequence high-water | Safe |
| Digest-tracked migrations | 11 |

## Logical backup and isolated restore

- `pg_dump --format=custom` produced a 79,715-byte synthetic backup.
- Backup SHA-256:
  `8243264a7a3f4d06b504cbfe425f8f121bb02051607dd174272e7528a335fbd4`.
- The backup was restored into a separate database named
  `furs_restore_evidence`.
- `corepack pnpm evidence:restore` ran at `2026-08-12T17:02:16.873Z` in a
  repeatable-read, read-only transaction.
- Sequence high-water, payload hashes and referential checks passed.
- Restored counts were one document, one attempt and three audit events; counts
  SHA-256 was
  `47345f967bbf162ffe6f2280217c6112b1c2e7a197f3660b437646e9a515501d`.
- PostgreSQL shut down cleanly and the port stopped accepting connections.

## Evidence boundary

This rehearsal does not prove encrypted production backup handling, WAL
archiving, point-in-time recovery to a selected timestamp, production RPO/RTO,
Docker image behavior, or independent review. Those controls remain mandatory
before P7 approval. Temporary binaries, databases and the dump remain ignored
and are not release artifacts.

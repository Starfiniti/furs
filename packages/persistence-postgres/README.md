# `@starfiniti/furs-persistence-postgres`

PostgreSQL authority for FURS fiscal identities, idempotency, immutable command snapshots, outbox delivery, attempts, audit and reconciliation.

Runtime startup atomically activates the mounted certificate's metadata (never
its key or P12 bytes) and records rotation in the append-only audit trail.
Provisioning also requires a named human source-review manifest and stores those
digests in the immutable `compliance_source_versions` ledger.

The database permits only one active certificate profile per legal entity and
environment, one active fiscal delivery job per document across submission and
reconciliation, and one independently active webhook delivery. Confirmation
evidence (EOR, certificate fingerprint and confirmation time) is immutable once set.

The schema deliberately consumes sequence values through a PostgreSQL sequence. PostgreSQL sequences are non-transactional: a rolled-back preparation can create a gap, but its number is never reused. This prioritizes `FURS-ID-002` over gap-free numbering.

External FURS calls never run inside a database transaction. Workers atomically claim short-lived outbox leases with `FOR UPDATE SKIP LOCKED`, commit the claim, perform network I/O, then persist the result in a second short transaction.

Private keys, PKCS#12 bytes, passwords and raw signed tokens have no columns in this schema.

## Runtime

```ts
import { PgPoolDatabase, PostgresFiscalRepository, createPostgresPool, runMigrations } from '@starfiniti/furs-persistence-postgres';

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
const database = new PgPoolDatabase(pool);
await runMigrations(database);
const repository = new PostgresFiscalRepository(database);
```

Production deployments should use a transaction-mode pooler, a non-superuser login granted one of the migration-defined roles, and explicit connection/statement timeouts.

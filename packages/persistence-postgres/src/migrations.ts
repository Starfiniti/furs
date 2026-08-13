import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import type { SqlClient } from './database.js';

export const MIGRATION_FILES = Object.freeze([
  '001_initial.sql', '002_roles.sql', '003_idempotent_sequence.sql',
  '004_business_premise_outbox.sql', '005_device_sequence_guard.sql',
  '006_durable_webhooks.sql', '007_subsequent_submission.sql',
  '008_worker_heartbeats.sql', '009_certificate_profile_activation.sql',
  '010_single_active_fiscal_delivery.sql',
  '011_confirmation_evidence_immutability.sql',
  '012_worker_business_premise_confirmation.sql',
  '013_sequence_reservation_privilege_boundary.sql'
] as const);

export async function readMigration(name: (typeof MIGRATION_FILES)[number]): Promise<string> {
  return readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
}

export async function runMigrations(client: SqlClient): Promise<void> {
  await client.query(`
    create schema if not exists furs;
    create table if not exists furs.schema_migrations (
      name text primary key,
      sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz not null default clock_timestamp()
    );
  `);
  for (const name of MIGRATION_FILES) {
    const sql = await readMigration(name);
    const digest = createHash('sha256').update(sql, 'utf8').digest('hex');
    const existing = await client.query<{ sha256: string }>(
      'select sha256 from furs.schema_migrations where name = $1', [name]
    );
    const applied = existing.rows[0];
    if (applied !== undefined) {
      if (applied.sha256 !== digest) throw new Error(`Applied migration ${name} has a different SHA-256 digest`);
      continue;
    }
    await client.query(sql);
    await client.query('insert into furs.schema_migrations (name, sha256) values ($1, $2)', [name, digest]);
  }
}

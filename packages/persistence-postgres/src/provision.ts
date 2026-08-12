import { readFile } from 'node:fs/promises';

import { createPostgresPool, PgPoolDatabase } from './database.js';
import { PostgresFiscalRepository } from './repository.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for legal-entity provisioning`);
  return value;
}

interface SourceManifest {
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly sources: readonly { readonly sourceId: string; readonly sha256: string }[];
}

function parseSourceManifest(text: string): SourceManifest {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Compliance source manifest is not valid JSON'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Compliance source manifest must be an object');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.reviewedBy !== 'string' || typeof record.reviewedAt !== 'string' ||
    !Array.isArray(record.sources) || !record.sources.every((source) =>
      typeof source === 'object' && source !== null && !Array.isArray(source) &&
      typeof (source as Record<string, unknown>).sourceId === 'string' &&
      typeof (source as Record<string, unknown>).sha256 === 'string'
    )
  ) {
    throw new Error('Compliance source manifest has an invalid shape');
  }
  return record as unknown as SourceManifest;
}

const password = (await readFile(required('DATABASE_PASSWORD_FILE'), 'utf8')).replace(/\r?\n$/, '');
const taxNumber = (await readFile(required('FURS_LEGAL_ENTITY_TAX_NUMBER_FILE'), 'utf8')).replace(/\r?\n$/, '');
const sourceManifest = parseSourceManifest(await readFile(required('FURS_COMPLIANCE_SOURCE_MANIFEST_PATH'), 'utf8'));
const pool = createPostgresPool({ connectionString: required('DATABASE_URL'), password });
try {
  const repository = new PostgresFiscalRepository(new PgPoolDatabase(pool));
  await repository.createLegalEntity({
    id: required('FURS_LEGAL_ENTITY_ID'),
    taxNumber,
    legalName: required('FURS_LEGAL_ENTITY_NAME')
  });
  await repository.recordComplianceSourceVersions(sourceManifest.sources.map((source) => ({
    ...source, reviewedBy: sourceManifest.reviewedBy, reviewedAt: sourceManifest.reviewedAt
  })));
  process.stdout.write('FURS legal entity and reviewed compliance sources provisioned.\n');
} finally {
  await pool.end();
}

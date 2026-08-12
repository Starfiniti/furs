import assert from 'node:assert/strict';
import test from 'node:test';

import { assertEvidenceDatabase } from './run-postgres-evidence.mjs';

test('FURS-ID-002: real-PostgreSQL evidence runner is locked to a dedicated database', () => {
  assert.doesNotThrow(() => assertEvidenceDatabase('postgresql://localhost:5432/furs_evidence', 'furs_evidence'));
  assert.throws(() => assertEvidenceDatabase('postgresql://localhost:5432/furs', 'furs_evidence'), (error) => error.code === 'FURS_PG_EVIDENCE_GUARD');
  assert.throws(() => assertEvidenceDatabase('postgresql://localhost:5432/furs_evidence', 'wrong'), (error) => error.code === 'FURS_PG_EVIDENCE_GUARD');
});

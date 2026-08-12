import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('FURS-SEC-002: the spike reports configuration failures without stack or environment leakage', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/cli.js', import.meta.url))], {
    encoding: 'utf8',
    env: {}
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), {
    code: 'FURS_SPIKE_CONFIG',
    message: 'Required setting FURS_TEST_P12_PATH is missing'
  });
  assert.equal(result.stderr.includes('stack'), false);
});

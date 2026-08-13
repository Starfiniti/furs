import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePostgresPoolConfig } from '../dist/database.js';

test('FURS-SEC-001: mounted database password is not overwritten by a passwordless URL', () => {
  const normalized = normalizePostgresPoolConfig({
    connectionString: 'postgresql://furs_api_login@127.0.0.1:55432/furs_runtime?application_name=furs-api',
    password: 'protected-test-password'
  });

  assert.equal(normalized.connectionString, undefined);
  assert.equal(normalized.user, 'furs_api_login');
  assert.equal(normalized.host, '127.0.0.1');
  assert.equal(normalized.port, '55432');
  assert.equal(normalized.database, 'furs_runtime');
  assert.equal(normalized.application_name, 'furs-api');
  assert.equal(normalized.password, 'protected-test-password');
});

test('FURS-SEC-001: an explicit mounted password wins over URL credentials', () => {
  const normalized = normalizePostgresPoolConfig({
    connectionString: 'postgresql://service:url-password@localhost/database',
    password: 'mounted-password'
  });

  assert.equal(normalized.password, 'mounted-password');
});

test('a URL without a separate password keeps native node-postgres parsing', () => {
  const config = { connectionString: 'postgresql://service:url-password@localhost/database' };
  assert.equal(normalizePostgresPoolConfig(config), config);
});

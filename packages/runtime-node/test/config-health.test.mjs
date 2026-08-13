import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeHealthMonitor, loadRuntimeConfig } from '../dist/index.js';

const base = {
  DATABASE_URL: 'postgres://local/test', DATABASE_PASSWORD_FILE: '/run/secrets/database-password', FURS_LEGAL_ENTITY_ID: '019ff57a-f30d-7290-9bb9-951bed760401', FURS_ENVIRONMENT: 'test', FURS_CERTIFICATE_PATH: '/run/secrets/cert.p12',
  FURS_CERTIFICATE_PASSPHRASE_FILE: '/run/secrets/passphrase', FURS_API_READ_TOKEN_FILE: '/run/secrets/read-token',
  FURS_API_WRITE_TOKEN_FILE: '/run/secrets/write-token',
  FURS_INVOICE_SCHEMA_PATH: '/schemas/invoice.json', FURS_INVOICE_SCHEMA_SHA256: 'a'.repeat(64),
  FURS_RESPONSE_SCHEMA_PATH: '/schemas/response.json', FURS_RESPONSE_SCHEMA_SHA256: 'b'.repeat(64),
  FURS_SERVER_CA_PATHS_JSON: '["/trust/server.pem"]', FURS_RESPONSE_CA_PATHS_JSON: '["/trust/response.pem"]',
  FURS_NTP_SERVERS_JSON: '["time.cloudflare.com","time.google.com"]'
};

test('FURS-SEC-001: runtime requires file-mounted secrets and pinned trust/schema paths', () => {
  const config = loadRuntimeConfig(base);
  assert.equal(config.environment, 'test'); assert.equal(config.runMigrations, false); assert.equal(config.apiHost, '127.0.0.1');
  assert.equal(config.apiMaximumRequestsPerMinute, 600);
  assert.equal(config.workerConcurrency, 1);
  assert.equal(config.readBearerTokenFile, '/run/secrets/read-token');
  assert.equal(config.writeBearerTokenFile, '/run/secrets/write-token');
  assert.throws(() => loadRuntimeConfig({ ...base, FURS_ENVIRONMENT: 'custom' }), /test or production/);
  assert.throws(() => loadRuntimeConfig({ ...base, FURS_SERVER_CA_PATHS_JSON: '[]' }), /at least one/);
  assert.throws(() => loadRuntimeConfig({ ...base, FURS_NTP_SERVERS_JSON: '["time.example"]' }), /two distinct/);
  assert.throws(() => loadRuntimeConfig({ ...base, FURS_NTP_SERVERS_JSON: '["time.example","time.example"]' }), /two distinct/);
  assert.equal(loadRuntimeConfig({ ...base, FURS_API_MAXIMUM_REQUESTS_PER_MINUTE: '100000' }).apiMaximumRequestsPerMinute, 100_000);
  assert.throws(() => loadRuntimeConfig({ ...base, FURS_API_MAXIMUM_REQUESTS_PER_MINUTE: '100001' }), /invalid/);
  assert.equal(loadRuntimeConfig({ ...base, FURS_WORKER_CONCURRENCY: '20' }).workerConcurrency, 20);
  assert.throws(() => loadRuntimeConfig({ ...base, FURS_WORKER_CONCURRENCY: '101' }), /invalid/);
  assert.throws(() => loadRuntimeConfig({ ...base, FURS_WEBHOOK_URL: 'https://example.test/hook' }), /configured together/);
  assert.throws(() => loadRuntimeConfig({
    ...base, FURS_WEBHOOK_DESTINATION_ID: 'primary', FURS_WEBHOOK_URL: 'http://example.test/hook',
    FURS_WEBHOOK_SECRET_FILE: '/run/secrets/webhook'
  }), /HTTPS/);
  assert.throws(() => loadRuntimeConfig({
    ...base, FURS_WEBHOOK_DESTINATION_ID: 'primary', FURS_WEBHOOK_URL: 'https://example.test/hook?token=secret',
    FURS_WEBHOOK_SECRET_FILE: '/run/secrets/webhook'
  }), /query/);
});

test('FURS-CERT-001/CLOCK-001: certificate expiry and stale/drifting clocks fail readiness', () => {
  const metadata = { subjectName: 'x', issuerName: 'y', serialNumberDecimal: '1', fingerprint256: 'a', validFrom: new Date('2026-01-01T00:00:00Z'), validTo: new Date('2026-09-30T00:00:00Z') };
  const monitor = new RuntimeHealthMonitor(metadata, 5000, 14);
  assert.doesNotThrow(() => monitor.assertCertificateReady(new Date('2026-08-12T00:00:00Z')));
  assert.throws(() => monitor.assertCertificateReady(new Date('2026-09-20T00:00:00Z')), /validity/);
  assert.throws(() => monitor.assertClockReady(new Date('2026-08-12T00:00:00Z')), /missing/);
  monitor.observeClock({ clockDriftMs: 100, observedAt: new Date('2026-08-12T00:00:00.100Z'), responseCount: 2, maximumRoundTripMs: 20 });
  assert.doesNotThrow(() => monitor.assertClockReady(new Date('2026-08-12T00:01:00Z')));
  assert.throws(() => monitor.assertClockReady(new Date('2026-08-12T00:06:00Z')), /stale/);
  monitor.observeClock({ clockDriftMs: 5_001, observedAt: new Date('2026-08-12T00:06:00.100Z'), responseCount: 2, maximumRoundTripMs: 20 });
  assert.throws(() => monitor.assertClockReady(new Date('2026-08-12T00:06:01Z')), /drift/);
  monitor.observeClock({ clockDriftMs: 100, observedAt: new Date('2026-08-12T00:10:20.000Z'), responseCount: 2, maximumRoundTripMs: 20 });
  assert.throws(() => monitor.assertClockReady(new Date('2026-08-12T00:10:00Z')), /stale/);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { FursDomainError, LocalInvoiceDateTime } from '../dist/index.js';

test('FURS-TIME-001/002: all legal representations derive from one local value', () => {
  const time = LocalInvoiceDateTime.parse('2015-08-15T10:13:32');

  assert.equal(time.timeZone, 'Europe/Ljubljana');
  assert.equal(time.offsetMinutes, 120);
  assert.equal(time.toPayloadDateTime(), '2015-08-15T10:13:32');
  assert.equal(time.toZoiDateTime(), '15.08.2015 10:13:32');
  assert.equal(time.toReceiptCodeDateTime(), '150815101332');
});

test('FURS-TIME-001: standard and daylight offsets are resolved explicitly', () => {
  assert.equal(LocalInvoiceDateTime.parse('2025-01-15T12:00:00').offsetMinutes, 60);
  assert.equal(LocalInvoiceDateTime.parse('2025-07-15T12:00:00').offsetMinutes, 120);
});

test('FURS-TIME-001: a spring-forward gap is rejected', () => {
  assert.throws(
    () => LocalInvoiceDateTime.parse('2025-03-30T02:30:00'),
    (error) => error instanceof FursDomainError && error.code === 'FURS_TIME_DST_GAP'
  );
});

test('FURS-TIME-001: an autumn overlap requires explicit resolution', () => {
  assert.throws(
    () => LocalInvoiceDateTime.parse('2025-10-26T02:30:00'),
    (error) => error instanceof FursDomainError && error.code === 'FURS_TIME_DST_OVERLAP'
  );

  const earlier = LocalInvoiceDateTime.parse('2025-10-26T02:30:00', {
    disambiguation: 'earlier'
  });
  const later = LocalInvoiceDateTime.parse('2025-10-26T02:30:00', {
    disambiguation: 'later'
  });

  assert.equal(earlier.offsetMinutes, 120);
  assert.equal(later.offsetMinutes, 60);
  assert.equal(later.toEpochMilliseconds() - earlier.toEpochMilliseconds(), 3_600_000);
  assert.equal(earlier.toPayloadDateTime(), later.toPayloadDateTime());
});

test('FURS-TIME-001/002: malformed, normalized, offset and millisecond values are rejected', () => {
  for (const value of [
    '2025-02-29T12:00:00',
    '2024-02-30T12:00:00',
    '2025-01-01 12:00:00',
    '2025-01-01T12:00',
    '2025-01-01T12:00:00.000',
    '2025-01-01T12:00:00Z',
    '2025-01-01T12:00:00+01:00'
  ]) {
    assert.throws(() => LocalInvoiceDateTime.parse(value), FursDomainError, value);
  }
});

test('FURS-TIME-001: legal output is independent of the host process time zone', () => {
  const moduleUrl = new URL('../dist/index.js', import.meta.url).href;
  const script = `
    import { LocalInvoiceDateTime } from ${JSON.stringify(moduleUrl)};
    const value = LocalInvoiceDateTime.parse('2025-07-15T12:34:56');
    process.stdout.write(JSON.stringify([
      value.toPayloadDateTime(),
      value.toZoiDateTime(),
      value.toReceiptCodeDateTime(),
      value.offsetMinutes
    ]));
  `;
  const outputs = new Set();

  for (const timeZone of ['UTC', 'Europe/Ljubljana', 'America/New_York', 'Asia/Tokyo']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
      env: { ...process.env, TZ: timeZone }
    });
    assert.equal(result.status, 0, result.stderr);
    outputs.add(result.stdout);
  }

  assert.equal(outputs.size, 1);
});

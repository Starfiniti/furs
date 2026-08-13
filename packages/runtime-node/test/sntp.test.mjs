import assert from 'node:assert/strict';
import test from 'node:test';

import { createSntpRequest, observeNtpClock, parseSntpResponse } from '../dist/sntp.js';

const epochSeconds = 2_208_988_800;

function writeTimestamp(target, offset, unixMilliseconds) {
  const seconds = Math.floor(unixMilliseconds / 1_000) + epochSeconds;
  const milliseconds = unixMilliseconds - Math.floor(unixMilliseconds / 1_000) * 1_000;
  target.writeUInt32BE(seconds >>> 0, offset);
  target.writeUInt32BE(Math.floor(milliseconds / 1_000 * 2 ** 32), offset + 4);
}

function responseFor(request, receivedAtMs, transmittedAtMs) {
  const response = Buffer.alloc(48);
  response[0] = 0x24; // LI=0, VN=4, mode=4 (server)
  response[1] = 2;
  request.copy(response, 24, 40, 48);
  writeTimestamp(response, 32, receivedAtMs);
  writeTimestamp(response, 40, transmittedAtMs);
  return response;
}

test('FURS-CLOCK-001: correlated SNTP timestamps calculate local clock drift and delay', () => {
  const started = new Date('2026-08-13T08:00:00.000Z');
  const request = createSntpRequest(started);
  const response = responseFor(request, started.getTime() + 760, started.getTime() + 762);
  const sample = parseSntpResponse('time.example', request, started, response, new Date(started.getTime() + 22), 100);
  assert.equal(sample.clockDriftMs, -750);
  assert.equal(sample.roundTripMs, 20);
});

test('FURS-CLOCK-001: unsynchronized, uncorrelated and slow NTP responses fail closed', () => {
  const started = new Date('2026-08-13T08:00:00.000Z');
  const request = createSntpRequest(started);
  const valid = responseFor(request, started.getTime() + 10, started.getTime() + 12);
  const unsynchronized = Buffer.from(valid); unsynchronized[0] = 0xe4;
  assert.throws(() => parseSntpResponse('time.example', request, started, unsynchronized, new Date(started.getTime() + 22), 100), /unsynchronized/);
  const uncorrelated = Buffer.from(valid); uncorrelated[24] ^= 1;
  assert.throws(() => parseSntpResponse('time.example', request, started, uncorrelated, new Date(started.getTime() + 22), 100), /correlate/);
  assert.throws(() => parseSntpResponse('time.example', request, started, valid, new Date(started.getTime() + 500), 100), /round trip/);
});

test('FURS-CLOCK-001: clock health requires a multi-server quorum and uses its median', async () => {
  const observedAt = new Date('2026-08-13T08:00:00.100Z');
  const values = new Map([['a.example', -750], ['b.example', -740]]);
  const observation = await observeNtpClock({
    servers: ['a.example', 'b.example', 'unavailable.example'], minimumResponses: 2, timeoutMs: 100,
    query: async (server) => {
      if (!values.has(server)) throw new Error('unavailable');
      return { server, clockDriftMs: values.get(server), roundTripMs: 20, observedAt };
    }
  });
  assert.equal(observation.clockDriftMs, -745);
  assert.equal(observation.responseCount, 2);
  await assert.rejects(() => observeNtpClock({
    servers: ['a.example', 'b.example'], minimumResponses: 2, timeoutMs: 100,
    query: async (server) => { if (server === 'b.example') throw new Error('unavailable'); return { server, clockDriftMs: -750, roundTripMs: 20, observedAt }; }
  }), /quorum/);
  await assert.rejects(() => observeNtpClock({
    servers: ['a.example', 'b.example'], minimumResponses: 2, timeoutMs: 100, maximumClockSpreadMs: 1_000,
    query: async (server) => ({ server, clockDriftMs: server === 'a.example' ? -750 : 5_000, roundTripMs: 20, observedAt })
  }), /do not agree/);
});

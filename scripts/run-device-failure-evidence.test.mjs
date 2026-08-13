import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDeviceFailureScenario, runDeviceFailureEvidence } from './run-device-failure-evidence.mjs';

const entity = '019ff57a-f30d-7290-9bb9-951bed760501';
const message = '019ff57a-f30d-7290-9bb9-951bed760502';
const deviceRecord = '019ff57a-f30d-7290-9bb9-951bed760503';
const sourceVersion = {
  technicalDocumentation: '3.2',
  technicalDocumentationSha256: '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547',
  schemaSha256: '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd'
};
const scenario = {
  environment: 'test', scenarioId: 'device-failure-v1', legalEntityId: entity, sourceVersion,
  device: { businessPremiseId: 'TESTPREMISE', electronicDeviceId: 'FAILEDDEVICE' },
  operation: {
    idempotencyKey: 'device-failure:test:one',
    request: {
      legalEntityId: entity, kind: 'STANDARD', businessPremiseId: 'TESTPREMISE',
      electronicDeviceId: 'FAILEDDEVICE', messageId: message, subsequentSubmit: false
    }
  }
};

function json(value, status = 200) { return new Response(JSON.stringify(value), { status }); }
function summary(confirmed = 4) { return { documentsByStatus: { CONFIRMED: confirmed }, activeOutboxJobs: 0 }; }

test('FURS-DEV-001: scenario cannot disguise device failure as a subsequent submission', () => {
  assert.equal(parseDeviceFailureScenario(JSON.stringify(scenario)).operation.request.subsequentSubmit, false);
  assert.throws(
    () => parseDeviceFailureScenario(JSON.stringify({
      ...scenario, operation: { ...scenario.operation, request: { ...scenario.operation.request, subsequentSubmit: true } }
    })),
    (error) => error.code === 'FURS_DEVICE_SCENARIO'
  );
});

test('FURS-DEV-001: live boundary blocks creation and retains no outbox command', async () => {
  const responses = [
    json({ environment: 'test', legalEntityId: entity }), json(summary()),
    json({ id: deviceRecord, operational: true }), json({ id: deviceRecord, operational: false }),
    json({ error: { code: 'FURS_DEVICE_FALLBACK_REQUIRED', message: 'blocked', correlationId: message } }, 400),
    json({ documents: [] }), json(summary()), json({ id: deviceRecord, operational: false })
  ];
  const evidence = await runDeviceFailureEvidence({
    scenarioText: JSON.stringify(scenario), apiUrl: 'http://127.0.0.1:8080', token: 'x'.repeat(32),
    fetch: async () => responses.shift()
  });
  assert.equal(evidence.ordinaryElectronicIssuanceBlocked, true);
  assert.equal(evidence.noFiscalDocumentCreated, true);
  assert.equal(evidence.subsequentSubmissionNotUsed, true);
  assert.equal(evidence.humanVkrProcedureExecuted, false);
  assert.equal(responses.length, 0);
});

test('FURS-DEV-001: unexpected invoice acceptance fails closed and still disables the device', async () => {
  const responses = [
    json({ environment: 'test', legalEntityId: entity }), json(summary()),
    json({ id: deviceRecord, operational: true }), json({ id: deviceRecord, operational: false }),
    json({ status: 'READY' }, 202), json({ id: deviceRecord, operational: false })
  ];
  await assert.rejects(
    runDeviceFailureEvidence({
      scenarioText: JSON.stringify(scenario), apiUrl: 'http://127.0.0.1:8080', token: 'x'.repeat(32),
      fetch: async () => responses.shift()
    }),
    (error) => error.code === 'FURS_DEVICE_HTTP'
  );
  assert.equal(responses.length, 0);
});

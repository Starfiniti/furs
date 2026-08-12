import assert from 'node:assert/strict';
import { createVerify } from 'node:crypto';
import test from 'node:test';

import { FursDomainError, SoftwareFiscalSigner } from '../dist/index.js';
import { createTestClientPkcs12, fixture } from '../test-support/crypto-helpers.mjs';

test('FURS-SEC-001/CERT-001: a test PKCS#12 loads and signs without exposing secret material', async () => {
  const signer = SoftwareFiscalSigner.fromPkcs12(
    createTestClientPkcs12(),
    'public-test-password'
  );
  const message = Buffer.from('public deterministic test message');
  const signature = await signer.signRsaSha256(message);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(message);
  verifier.end();

  assert.equal(verifier.verify(fixture('test-client-cert.pem'), signature), true);
  assert.deepEqual(signer.getCertificateMetadata(), {
    subjectName: 'CN=Test Fiscal Client,OU=12345678,O=Starfiniti Test,C=SI',
    issuerName: 'CN=Starfiniti Test CA,O=Starfiniti Test,C=SI',
    serialNumberDecimal: '4099',
    fingerprint256: signer.getCertificate().fingerprint256.toLowerCase(),
    validFrom: new Date(signer.getCertificate().validFrom),
    validTo: new Date(signer.getCertificate().validTo)
  });
});

test('FURS-SEC-001: wrong PKCS#12 passwords and malformed containers fail closed', () => {
  assert.throws(
    () => SoftwareFiscalSigner.fromPkcs12(createTestClientPkcs12(), 'wrong-password'),
    (error) => error instanceof FursDomainError && error.code === 'FURS_P12_PARSE'
  );
  assert.throws(
    () => SoftwareFiscalSigner.fromPkcs12(Buffer.from('not-pkcs12'), 'password'),
    FursDomainError
  );
});

test('FURS-CERT-001: loading fails when the verification time is outside certificate validity', () => {
  assert.throws(
    () => SoftwareFiscalSigner.fromPem({
      privateKeyPem: fixture('test-client-key.pem'),
      certificatePem: fixture('test-client-cert.pem'),
      now: new Date('2040-01-01T00:00:00Z')
    }),
    (error) => error instanceof FursDomainError && error.code === 'FURS_CERT_VALIDITY'
  );
});

import assert from 'node:assert/strict';
import { createVerify } from 'node:crypto';
import test from 'node:test';

import {
  buildCanonicalZoiInput,
  calculateZoi,
  DecimalAmount,
  LocalInvoiceDateTime,
  SoftwareFiscalSigner
} from '../dist/index.js';
import { fixture } from '../test-support/crypto-helpers.mjs';

const signer = SoftwareFiscalSigner.fromPem({
  privateKeyPem: fixture('test-client-key.pem'),
  certificatePem: fixture('test-client-cert.pem'),
  certificateChainPem: [fixture('test-ca-cert.pem')]
});

const input = {
  taxNumber: '12345678',
  issueDateTime: LocalInvoiceDateTime.parse('2015-08-15T10:13:32'),
  invoiceNumber: '12345',
  businessPremiseId: 'blag001',
  electronicDeviceId: '11245',
  invoiceAmount: DecimalAmount.parse('1245.56')
};

test('FURS-ZOI-001: canonical input order and UTF-8 bytes are exact', () => {
  const canonical = buildCanonicalZoiInput(input);
  const expected = '1234567815.08.2015 10:13:3212345blag001112451245.56';

  assert.equal(canonical.text, expected);
  assert.equal(
    canonical.utf8Hex,
    '313233343536373831352e30382e323031352031303a31333a33323132333435626c61673030313131323435313234352e3536'
  );
});

test('FURS-ZOI-002: ZOI is lowercase MD5 hex of the RSA-SHA256 signature bytes', async () => {
  const canonical = buildCanonicalZoiInput(input);
  const signature = await signer.signRsaSha256(canonical.bytes);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(canonical.bytes);
  verifier.end();

  assert.equal(verifier.verify(fixture('test-client-cert.pem'), signature), true);
  assert.equal(await calculateZoi(input, signer), '1da0adb4cc87fd85f909e0acb99a2aa4');
});

import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import test from 'node:test';

import {
  FursDomainError,
  signJws,
  SoftwareFiscalSigner,
  verifyFursJws
} from '../dist/index.js';
import { createResponseToken, fixture } from '../test-support/crypto-helpers.mjs';

const outboundSigner = SoftwareFiscalSigner.fromPem({
  privateKeyPem: fixture('test-client-key.pem'),
  certificatePem: fixture('test-client-cert.pem'),
  certificateChainPem: [fixture('test-ca-cert.pem')]
});
const trustAnchors = [fixture('test-ca-cert.pem')];

test('FURS-JWS-001: outbound protected header and RS256 signature are deterministic', async () => {
  const payloadJson = '{"EchoRequest":"furs"}';
  const signed = await signJws(payloadJson, outboundSigner);
  assert.equal(
    signed.protectedHeaderJson,
    '{"alg":"RS256","subject_name":"CN=Test Fiscal Client,OU=12345678,O=Starfiniti Test,C=SI","issuer_name":"CN=Starfiniti Test CA,O=Starfiniti Test,C=SI","serial":4099}'
  );
  assert.deepEqual(signed.wrapper, { token: signed.token });

  const [header, payload, signature] = signed.token.split('.');
  assert.equal(Buffer.from(payload, 'base64url').toString('utf8'), payloadJson);
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`, 'ascii'),
      outboundSigner.getCertificate().publicKey,
      Buffer.from(signature, 'base64url')
    ),
    true
  );
});

test('FURS-JWS-002: a signed FURS response is verified through its trusted chain', () => {
  const token = createResponseToken({ EchoResponse: 'furs' });
  const result = verifyFursJws(token, { trustAnchors });

  assert.deepEqual(result.payload, { EchoResponse: 'furs' });
  assert.equal(result.protectedHeader.alg, 'RS256');
  assert.equal(result.signerCertificate.subject.includes('FURS Test Response'), true);
});

function replacePart(token, index, replacement) {
  const parts = token.split('.');
  parts[index] = replacement;
  return parts.join('.');
}

test('FURS-JWS-002: payload and signature mutation fail closed', () => {
  const token = createResponseToken({ EchoResponse: 'furs' });
  const parts = token.split('.');
  const mutatedPayload = Buffer.from('{"EchoResponse":"evil"}').toString('base64url');
  const signature = Buffer.from(parts[2], 'base64url');
  signature[0] ^= 1;

  assert.throws(
    () => verifyFursJws(replacePart(token, 1, mutatedPayload), { trustAnchors }),
    (error) => error instanceof FursDomainError && error.code === 'FURS_JWS_SIGNATURE'
  );
  assert.throws(
    () => verifyFursJws(replacePart(token, 2, signature.toString('base64url')), { trustAnchors }),
    (error) => error instanceof FursDomainError && error.code === 'FURS_JWS_SIGNATURE'
  );
});

test('FURS-JWS-002: algorithm, x5c order, trust, validity and signer pins fail closed', () => {
  const wrongAlgorithm = createResponseToken({ EchoResponse: 'furs' }, { alg: 'HS256' });
  const valid = createResponseToken({ EchoResponse: 'furs' });
  const responseCert = outboundSigner.getCertificate().raw.toString('base64');
  const caCert = new (outboundSigner.getCertificate().constructor)(fixture('test-ca-cert.pem'));
  const wrongOrder = createResponseToken(
    { EchoResponse: 'furs' },
    { x5c: [caCert.raw.toString('base64'), responseCert] }
  );

  assert.throws(() => verifyFursJws(wrongAlgorithm, { trustAnchors }), /algorithm must be RS256/);
  assert.throws(() => verifyFursJws(wrongOrder, { trustAnchors }), FursDomainError);
  assert.throws(
    () => verifyFursJws(valid, { trustAnchors: [fixture('test-client-cert.pem')] }),
    /trusted anchor/
  );
  assert.throws(
    () => verifyFursJws(valid, { trustAnchors, now: new Date('2040-01-01T00:00:00Z') }),
    /not valid/
  );
  assert.throws(
    () => verifyFursJws(valid, { trustAnchors, expectedLeafFingerprints256: ['00'] }),
    /not an expected certificate/
  );
});

test('FURS-JWS-002: malformed compact and Base64URL encodings fail closed', () => {
  const valid = createResponseToken({ EchoResponse: 'furs' });
  assert.throws(() => verifyFursJws('one.two', { trustAnchors }), /exactly three/);
  assert.throws(() => verifyFursJws(replacePart(valid, 0, '***'), { trustAnchors }), /Base64URL/);
  assert.throws(() => verifyFursJws(replacePart(valid, 2, ''), { trustAnchors }), /non-empty/);
});

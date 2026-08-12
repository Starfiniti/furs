import { createPrivateKey, sign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';

import forge from 'node-forge';

const fixtureUrl = new URL('../test/fixtures/', import.meta.url);

export function fixture(name) {
  return readFileSync(new URL(name, fixtureUrl));
}

export function createTestClientPkcs12(password = 'public-test-password') {
  const privateKey = forge.pki.privateKeyFromPem(fixture('test-client-key.pem').toString('utf8'));
  const client = forge.pki.certificateFromPem(fixture('test-client-cert.pem').toString('utf8'));
  const ca = forge.pki.certificateFromPem(fixture('test-ca-cert.pem').toString('utf8'));
  const asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [client, ca], password, {
    algorithm: '3des',
    generateLocalKeyId: true
  });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

export function createResponseToken(payload, headerOverrides = {}) {
  const certificate = new X509Certificate(fixture('test-response-cert.pem'));
  const ca = new X509Certificate(fixture('test-ca-cert.pem'));
  const protectedHeader = {
    alg: 'RS256',
    x5c: [certificate.raw.toString('base64'), ca.raw.toString('base64')],
    ...headerOverrides
  };
  const encodedHeader = Buffer.from(JSON.stringify(protectedHeader)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(signingInput, 'ascii'),
    createPrivateKey(fixture('test-response-key.pem'))
  );
  return `${signingInput}.${signature.toString('base64url')}`;
}

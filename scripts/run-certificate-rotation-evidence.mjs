#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FursMtlsTransport, SoftwareFiscalSigner } from '../packages/core/dist/index.js';

class RotationEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function readSecret(path, label) {
  let bytes;
  try { bytes = await readFile(path); } catch { throw new RotationEvidenceError('FURS_ROTATION_FILE', `Unable to read ${label}`); }
  if (bytes.length === 0) throw new RotationEvidenceError('FURS_ROTATION_FILE', `${label} is empty`);
  return bytes;
}

async function probeCertificate(configuration) {
  const [p12, passphraseBytes, trustAnchor] = await Promise.all([
    readSecret(configuration.p12Path, 'PKCS#12 certificate'),
    readSecret(configuration.passphraseFile, 'certificate passphrase'),
    readSecret(configuration.serverCaPath, 'server trust anchor')
  ]);
  const passphrase = passphraseBytes.toString('utf8').replace(/\r?\n$/, '');
  passphraseBytes.fill(0);
  let signer;
  try { signer = SoftwareFiscalSigner.fromPkcs12(p12, passphrase); }
  finally { p12.fill(0); }
  const transport = new FursMtlsTransport({ environment: 'test', signer, serverTrustAnchors: [trustAnchor] });
  const value = `rotation-${randomUUID()}`;
  const echo = await transport.echoWithMetadata(value);
  if (echo.value !== value) throw new RotationEvidenceError('FURS_ROTATION_ECHO', 'Certificate echo did not match');
  const metadata = signer.getCertificateMetadata();
  return Object.freeze({
    fingerprint256: metadata.fingerprint256, validFrom: metadata.validFrom, validTo: metadata.validTo,
    echo: 'verified', serverDateObserved: echo.serverDate !== undefined
  });
}

export async function runCertificateRotationEvidence(options) {
  if (options.environment !== 'test') throw new RotationEvidenceError('FURS_ROTATION_ENVIRONMENT', 'Rotation evidence may run only against FURS test');
  const probe = options.probe ?? probeCertificate;
  const oldResult = await probe(options.oldCertificate);
  const newResult = await probe(options.newCertificate);
  if (oldResult.fingerprint256 === newResult.fingerprint256) throw new RotationEvidenceError('FURS_ROTATION_IDENTITY', 'Old and replacement certificates have the same fingerprint');
  if (new Date(newResult.validTo).getTime() <= new Date(oldResult.validTo).getTime()) {
    throw new RotationEvidenceError('FURS_ROTATION_VALIDITY', 'Replacement certificate does not extend validity');
  }
  const safe = (result) => ({
    fingerprint256Suffix: result.fingerprint256.replaceAll(':', '').slice(-16),
    validFrom: new Date(result.validFrom).toISOString(), validTo: new Date(result.validTo).toISOString(),
    echo: result.echo, serverDateObserved: result.serverDateObserved
  });
  const evidence = {
    evidenceVersion: 1, generatedAt: new Date().toISOString(), environment: 'test',
    oldCertificate: safe(oldResult), replacementCertificate: safe(newResult),
    distinctCertificate: true, replacementExtendsValidity: true
  };
  return Object.freeze({ ...evidence, evidenceSha256: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') });
}

function configuration(prefix) {
  const p12Path = process.env[`FURS_ROTATION_${prefix}_P12_PATH`];
  const passphraseFile = process.env[`FURS_ROTATION_${prefix}_PASSPHRASE_FILE`];
  const serverCaPath = process.env[`FURS_ROTATION_${prefix}_SERVER_CA_PATH`];
  if (!p12Path || !passphraseFile || !serverCaPath) throw new RotationEvidenceError('FURS_ROTATION_CONFIG', `${prefix} certificate paths are required`);
  return { p12Path, passphraseFile, serverCaPath };
}

async function main() {
  const evidence = await runCertificateRotationEvidence({
    environment: process.env.FURS_ENVIRONMENT,
    oldCertificate: configuration('OLD'), newCertificate: configuration('NEW')
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof RotationEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_ROTATION_FAILURE', message: 'Certificate rotation evidence failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}

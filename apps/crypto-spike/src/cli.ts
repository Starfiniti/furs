#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  buildCanonicalZoiInput,
  calculateZoi,
  DecimalAmount,
  FursDomainError,
  FursMtlsTransport,
  LocalInvoiceDateTime,
  PinnedOfficialSchemaValidator,
  signJws,
  SoftwareFiscalSigner,
  verifyFursJws
} from '@starfiniti/furs-core';

const OFFICIAL_SCHEMA_SHA256 =
  '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new FursDomainError('FURS_SPIKE_CONFIG', `Required setting ${name} is missing`);
  return value;
}

async function readRequiredFile(path: string, label: string): Promise<Buffer> {
  try {
    const bytes = await readFile(path);
    if (bytes.length === 0) throw new Error('empty');
    return bytes;
  } catch {
    throw new FursDomainError('FURS_SPIKE_FILE', `Unable to read required ${label}`);
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function main(): Promise<void> {
  const p12Path = requiredEnvironment('FURS_TEST_P12_PATH');
  const passphraseBytes = await readRequiredFile(
    requiredEnvironment('FURS_TEST_P12_PASSWORD_FILE'), 'PKCS#12 passphrase'
  );
  const passphrase = passphraseBytes.toString('utf8').replace(/\r?\n$/, '');
  passphraseBytes.fill(0);
  if (!passphrase) throw new FursDomainError('FURS_SPIKE_FILE', 'PKCS#12 passphrase file is empty');
  const serverCaPath = requiredEnvironment('FURS_TEST_SERVER_CA_PATH');
  const schemaPath = requiredEnvironment('FURS_OFFICIAL_SCHEMA_PATH');

  const p12 = await readRequiredFile(p12Path, 'PKCS#12 certificate');
  const serverCa = await readRequiredFile(serverCaPath, 'server trust anchor');
  const schema = await readRequiredFile(schemaPath, 'official JSON schema');
  let transport: FursMtlsTransport | undefined;

  try {
    const signer = SoftwareFiscalSigner.fromPkcs12(p12, passphrase);
    const schemaValidator = PinnedOfficialSchemaValidator.fromUtf8Bytes(
      schema,
      OFFICIAL_SCHEMA_SHA256
    );
    const issueDateTime = LocalInvoiceDateTime.parse(
      requiredEnvironment('FURS_INVOICE_LOCAL_TIME')
    );
    const invoiceAmount = DecimalAmount.parse(requiredEnvironment('FURS_INVOICE_AMOUNT'));
    const zoiInput = {
      taxNumber: requiredEnvironment('FURS_TEST_TAX_NUMBER'),
      issueDateTime,
      invoiceNumber: requiredEnvironment('FURS_INVOICE_NUMBER'),
      businessPremiseId: requiredEnvironment('FURS_BUSINESS_PREMISE_ID'),
      electronicDeviceId: requiredEnvironment('FURS_ELECTRONIC_DEVICE_ID'),
      invoiceAmount
    };
    const canonical = buildCanonicalZoiInput(zoiInput);
    const zoi = await calculateZoi(zoiInput, signer);
    const signedProbe = await signJws('{"CryptoProbe":"phase-1"}', signer);
    transport = new FursMtlsTransport({
      environment: 'test',
      signer,
      serverTrustAnchors: [serverCa]
    });
    const echoResponse = await transport.send('echo', '{"EchoRequest":"furs"}');
    let echoPayload: unknown;
    try {
      echoPayload = JSON.parse(echoResponse.body);
    } catch {
      throw new FursDomainError('FURS_ECHO_JSON', 'FURS echo response is not valid JSON');
    }
    if (
      typeof echoPayload !== 'object' ||
      echoPayload === null ||
      Array.isArray(echoPayload) ||
      (echoPayload as Record<string, unknown>).EchoResponse !== 'furs'
    ) {
      throw new FursDomainError('FURS_ECHO_MISMATCH', 'FURS echo response did not match');
    }

    let signedResponseVerification: 'not-provided' | 'verified' = 'not-provided';
    const signedResponseTokenPath = process.env.FURS_SIGNED_RESPONSE_TOKEN_PATH;
    if (signedResponseTokenPath) {
      const responseCaPath = requiredEnvironment('FURS_RESPONSE_TRUST_CA_PATH');
      const token = (await readRequiredFile(signedResponseTokenPath, 'signed response token'))
        .toString('utf8')
        .trim();
      const responseCa = await readRequiredFile(responseCaPath, 'response trust anchor');
      verifyFursJws(token, { trustAnchors: [responseCa] });
      signedResponseVerification = 'verified';
    }

    const metadata = signer.getCertificateMetadata();
    const evidence = Object.freeze({
      phase: 'P1',
      source: Object.freeze({
        technicalDocumentation: '3.2',
        schemaSha256: schemaValidator.sha256
      }),
      certificate: Object.freeze({
        fingerprint256Suffix: metadata.fingerprint256.replaceAll(':', '').slice(-16),
        validTo: metadata.validTo.toISOString()
      }),
      canonicalization: Object.freeze({
        zoiInputSha256: sha256(canonical.bytes),
        zoiSha256: sha256(zoi),
        issueTimeSha256: sha256(issueDateTime.toPayloadDateTime()),
        amountSha256: sha256(invoiceAmount.toString())
      }),
      jws: Object.freeze({
        protectedHeaderSha256: sha256(signedProbe.protectedHeaderJson),
        tokenSha256: sha256(signedProbe.token)
      }),
      transport: Object.freeze({
        echo: 'verified',
        tlsProtocol: echoResponse.tlsProtocol
      }),
      signedResponseVerification
    });

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    transport?.close();
    p12.fill(0);
  }
}

main().catch((error: unknown) => {
  const safe =
    error instanceof FursDomainError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_SPIKE_FAILURE', message: 'Phase 1 spike failed' };
  process.stderr.write(`${JSON.stringify(safe)}\n`);
  process.exitCode = 1;
});

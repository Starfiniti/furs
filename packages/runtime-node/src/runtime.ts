import { readFile } from 'node:fs/promises';

import {
  FursMtlsTransport,
  PinnedOfficialSchemaValidator,
  SoftwareFiscalSigner
} from '@starfiniti/furs-core';
import {
  createPostgresPool,
  PgPoolDatabase,
  PostgresFiscalRepository,
  runMigrations
} from '@starfiniti/furs-persistence-postgres';

import type { RuntimeConfig } from './config.js';
import { RuntimeHealthMonitor } from './health.js';
import { observeNtpClock } from './sntp.js';

async function secret(path: string): Promise<string> {
  const value = await readFile(path, 'utf8');
  const withoutFinalNewline = value.replace(/\r?\n$/, '');
  if (!withoutFinalNewline) throw new Error('Mounted secret file is empty');
  return withoutFinalNewline;
}

export async function createNodeRuntime(config: RuntimeConfig) {
  const [pkcs12, passphrase, readBearerToken, writeBearerToken, webhookSecret, databasePassword, invoiceSchemaBytes, responseSchemaBytes, serverTrustAnchors, responseTrustAnchors] = await Promise.all([
    readFile(config.certificatePath),
    secret(config.certificatePassphraseFile),
    config.readBearerTokenFile === undefined ? Promise.resolve(undefined) : secret(config.readBearerTokenFile),
    config.writeBearerTokenFile === undefined ? Promise.resolve(undefined) : secret(config.writeBearerTokenFile),
    config.webhookSecretFile === undefined ? Promise.resolve(undefined) : secret(config.webhookSecretFile),
    secret(config.databasePasswordFile),
    readFile(config.invoiceSchemaPath),
    readFile(config.responseSchemaPath),
    Promise.all(config.serverCaPaths.map((path) => readFile(path))),
    Promise.all(config.responseCaPaths.map((path) => readFile(path)))
  ]);
  let signer: SoftwareFiscalSigner;
  try { signer = SoftwareFiscalSigner.fromPkcs12(pkcs12, passphrase); }
  finally { pkcs12.fill(0); }
  if (readBearerToken !== undefined && readBearerToken.length < 32) throw new Error('Mounted API read token must contain at least 32 characters');
  if (writeBearerToken !== undefined && writeBearerToken.length < 32) throw new Error('Mounted API write token must contain at least 32 characters');
  if (readBearerToken !== undefined && writeBearerToken !== undefined && readBearerToken === writeBearerToken) {
    throw new Error('API read and write tokens must be different');
  }
  if (webhookSecret !== undefined && webhookSecret.length < 32) throw new Error('Mounted webhook secret must contain at least 32 characters');

  const invoiceSchema = PinnedOfficialSchemaValidator.fromUtf8Bytes(invoiceSchemaBytes, config.invoiceSchemaSha256);
  const responseSchema = PinnedOfficialSchemaValidator.fromUtf8Bytes(responseSchemaBytes, config.responseSchemaSha256);
  const transport = new FursMtlsTransport({
    environment: config.environment,
    signer,
    serverTrustAnchors,
    maximumSockets: config.transportMaximumSockets
  });
  const pool = createPostgresPool({ connectionString: config.databaseUrl, password: databasePassword });
  const database = new PgPoolDatabase(pool);
  if (config.runMigrations) await runMigrations(database);
  const repository = new PostgresFiscalRepository(database, {
    ...(config.webhookDestinationId === undefined ? {} : { webhookDestinationId: config.webhookDestinationId })
  });
  const certificateMetadata = signer.getCertificateMetadata();
  await repository.activateCertificateProfile({
    legalEntityId: config.legalEntityId,
    environment: config.environment === 'test' ? 'TEST' : 'PRODUCTION',
    fingerprint256: certificateMetadata.fingerprint256,
    subjectName: certificateMetadata.subjectName,
    issuerName: certificateMetadata.issuerName,
    serialNumberDecimal: certificateMetadata.serialNumberDecimal,
    validFrom: certificateMetadata.validFrom,
    validTo: certificateMetadata.validTo
  });
  const health = new RuntimeHealthMonitor(
    certificateMetadata, config.maximumClockDriftMs, config.certificateMinimumDaysRemaining
  );

  async function echo(value: string): Promise<string> {
    const observation = await transport.echoWithMetadata(value);
    return observation.value;
  }

  async function refreshClockHealth(): Promise<void> {
    health.observeClock(await observeNtpClock({
      servers: config.ntpServers,
      minimumResponses: config.ntpMinimumResponses,
      timeoutMs: config.ntpTimeoutMs,
      maximumClockSpreadMs: config.maximumClockDriftMs
    }));
  }

  return Object.freeze({
    config,
    readBearerToken,
    writeBearerToken,
    webhook: config.webhookDestinationId === undefined || config.webhookUrl === undefined || webhookSecret === undefined
      ? undefined
      : Object.freeze({ destinationId: config.webhookDestinationId, url: config.webhookUrl, secret: webhookSecret }),
    signer,
    invoiceSchema,
    responseSchema,
    responseTrustAnchors: Object.freeze(responseTrustAnchors),
    transport,
    repository,
    health,
    echo,
    refreshExternalHealth: refreshClockHealth,
    close: async () => {
      transport.close();
      await pool.end();
    }
  });
}

export type NodeRuntime = Awaited<ReturnType<typeof createNodeRuntime>>;

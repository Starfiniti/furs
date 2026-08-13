export interface RuntimeConfig {
  readonly databaseUrl: string;
  readonly databasePasswordFile: string;
  readonly legalEntityId: string;
  readonly environment: 'test' | 'production';
  readonly certificatePath: string;
  readonly certificatePassphraseFile: string;
  readonly readBearerTokenFile: string | undefined;
  readonly writeBearerTokenFile: string | undefined;
  readonly invoiceSchemaPath: string;
  readonly invoiceSchemaSha256: string;
  readonly responseSchemaPath: string;
  readonly responseSchemaSha256: string;
  readonly serverCaPaths: readonly string[];
  readonly responseCaPaths: readonly string[];
  readonly runMigrations: boolean;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly apiMaximumRequestsPerMinute: number;
  readonly workerConcurrency: number;
  readonly transportMaximumSockets: number;
  readonly maximumClockDriftMs: number;
  readonly ntpServers: readonly string[];
  readonly ntpMinimumResponses: number;
  readonly ntpTimeoutMs: number;
  readonly certificateMinimumDaysRemaining: number;
  readonly webhookDestinationId: string | undefined;
  readonly webhookUrl: string | undefined;
  readonly webhookSecretFile: string | undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Required runtime setting ${name} is missing`);
  return value;
}

function paths(env: NodeJS.ProcessEnv, name: string): readonly string[] {
  let value: unknown;
  try { value = JSON.parse(required(env, name)); } catch { throw new Error(`${name} must be a JSON array of paths`); }
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === 'string' && entry.length > 0)) {
    throw new Error(`${name} must contain at least one path`);
  }
  return Object.freeze([...value]);
}

function ntpServers(env: NodeJS.ProcessEnv): readonly string[] {
  const values = paths(env, 'FURS_NTP_SERVERS_JSON');
  if (values.length < 2 || new Set(values).size !== values.length) throw new Error('FURS_NTP_SERVERS_JSON must contain at least two distinct servers');
  if (!values.every((value) => /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/.test(value))) {
    throw new Error('FURS_NTP_SERVERS_JSON contains an invalid server name');
  }
  return values;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} is invalid`);
  return parsed;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const environment = required(env, 'FURS_ENVIRONMENT');
  if (environment !== 'test' && environment !== 'production') throw new Error('FURS_ENVIRONMENT must be test or production');
  const apiHost = env.FURS_API_HOST ?? '127.0.0.1';
  if (!/^[A-Za-z0-9.:-]+$/.test(apiHost)) throw new Error('FURS_API_HOST is invalid');
  const legalEntityId = required(env, 'FURS_LEGAL_ENTITY_ID');
  if (!/^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$/.test(legalEntityId)) {
    throw new Error('FURS_LEGAL_ENTITY_ID must be a UUID');
  }
  const webhookValues = [env.FURS_WEBHOOK_DESTINATION_ID, env.FURS_WEBHOOK_URL, env.FURS_WEBHOOK_SECRET_FILE];
  const webhookConfigured = webhookValues.filter((value) => value !== undefined).length;
  if (webhookConfigured !== 0 && webhookConfigured !== webhookValues.length) {
    throw new Error('FURS webhook destination ID, URL and secret file must be configured together');
  }
  if (env.FURS_WEBHOOK_DESTINATION_ID !== undefined && !/^[A-Za-z0-9._:-]{1,200}$/.test(env.FURS_WEBHOOK_DESTINATION_ID)) {
    throw new Error('FURS_WEBHOOK_DESTINATION_ID is invalid');
  }
  if (env.FURS_WEBHOOK_URL !== undefined) {
    let url: URL;
    try { url = new URL(env.FURS_WEBHOOK_URL); } catch { throw new Error('FURS_WEBHOOK_URL is invalid'); }
    const loopbackTestUrl = environment === 'test' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !loopbackTestUrl) throw new Error('FURS_WEBHOOK_URL must use HTTPS (or loopback HTTP in test)');
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('FURS_WEBHOOK_URL must not contain credentials, a query or a fragment');
    }
  }
  const configuredNtpServers = ntpServers(env);
  const configuredNtpMinimumResponses = integer(env, 'FURS_NTP_MINIMUM_RESPONSES', 2, 2, configuredNtpServers.length);
  return Object.freeze({
    databaseUrl: required(env, 'DATABASE_URL'),
    databasePasswordFile: required(env, 'DATABASE_PASSWORD_FILE'),
    legalEntityId: legalEntityId.toLowerCase(),
    environment,
    certificatePath: required(env, 'FURS_CERTIFICATE_PATH'),
    certificatePassphraseFile: required(env, 'FURS_CERTIFICATE_PASSPHRASE_FILE'),
    readBearerTokenFile: env.FURS_API_READ_TOKEN_FILE,
    writeBearerTokenFile: env.FURS_API_WRITE_TOKEN_FILE,
    invoiceSchemaPath: required(env, 'FURS_INVOICE_SCHEMA_PATH'),
    invoiceSchemaSha256: required(env, 'FURS_INVOICE_SCHEMA_SHA256'),
    responseSchemaPath: required(env, 'FURS_RESPONSE_SCHEMA_PATH'),
    responseSchemaSha256: required(env, 'FURS_RESPONSE_SCHEMA_SHA256'),
    serverCaPaths: paths(env, 'FURS_SERVER_CA_PATHS_JSON'),
    responseCaPaths: paths(env, 'FURS_RESPONSE_CA_PATHS_JSON'),
    runMigrations: env.FURS_RUN_MIGRATIONS === 'true',
    apiHost,
    apiPort: integer(env, 'FURS_API_PORT', 8080, 1, 65535),
    apiMaximumRequestsPerMinute: integer(env, 'FURS_API_MAXIMUM_REQUESTS_PER_MINUTE', 600, 10, 100_000),
    workerConcurrency: integer(env, 'FURS_WORKER_CONCURRENCY', 1, 1, 250),
    transportMaximumSockets: integer(env, 'FURS_TRANSPORT_MAXIMUM_SOCKETS', 32, 1, 250),
    maximumClockDriftMs: integer(env, 'FURS_MAX_CLOCK_DRIFT_MS', 5000, 100, 60000),
    ntpServers: configuredNtpServers,
    ntpMinimumResponses: configuredNtpMinimumResponses,
    ntpTimeoutMs: integer(env, 'FURS_NTP_TIMEOUT_MS', 2000, 250, 10000),
    certificateMinimumDaysRemaining: integer(env, 'FURS_CERTIFICATE_MINIMUM_DAYS', 14, 1, 180),
    webhookDestinationId: env.FURS_WEBHOOK_DESTINATION_ID,
    webhookUrl: env.FURS_WEBHOOK_URL,
    webhookSecretFile: env.FURS_WEBHOOK_SECRET_FILE
  });
}

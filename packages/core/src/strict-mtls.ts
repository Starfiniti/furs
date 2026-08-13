import { Agent, request } from 'node:https';
import { TLSSocket, type SecureContext } from 'node:tls';

import { FursDomainError } from './domain-error.js';
import type { SoftwareFiscalSigner } from './fiscal-signer.js';

const MAX_RESPONSE_BYTES = 1_048_576;

export interface StrictMtlsRequest {
  readonly endpoint: URL;
  readonly body: string;
  readonly secureContext: SecureContext;
  readonly timeoutMilliseconds?: number;
}

export interface StrictMtlsResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly body: string;
  readonly tlsProtocol: string | null;
}

export type FursEnvironment = 'test' | 'production';
export type FursService = 'echo' | 'invoices' | 'business-premises';

const FURS_ENDPOINTS: Readonly<Record<FursEnvironment, Readonly<Record<FursService, string>>>> =
  Object.freeze({
    test: Object.freeze({
      echo: 'https://blagajne-test.fu.gov.si:9002/v1/cash_registers/echo',
      invoices: 'https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices',
      'business-premises': 'https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register'
    }),
    production: Object.freeze({
      echo: 'https://blagajne.fu.gov.si:9003/v1/cash_registers/echo',
      invoices: 'https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices',
      'business-premises': 'https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices/register'
    })
  });

function assertHttpsEndpoint(endpoint: URL): void {
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  ) {
    throw new FursDomainError('FURS_TLS_ENDPOINT', 'mTLS endpoint must be a credential-free HTTPS URL');
  }
}

/** Low-level strict mTLS primitive. Production callers should use FursMtlsTransport. */
export function postJsonWithStrictMtls(input: StrictMtlsRequest): Promise<StrictMtlsResponse> {
  assertHttpsEndpoint(input.endpoint);
  if (typeof input.body !== 'string' || Buffer.byteLength(input.body, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new FursDomainError('FURS_TLS_REQUEST_SIZE', 'FURS request body exceeds the allowed size');
  }
  const timeoutMilliseconds = input.timeoutMilliseconds ?? 15_000;
  if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > 120_000) {
    throw new FursDomainError('FURS_TLS_TIMEOUT', 'mTLS timeout must be between 1 and 120000 milliseconds');
  }

  return new Promise((resolve, reject) => {
    const agent = new Agent({
      secureContext: input.secureContext,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      keepAlive: false,
      maxCachedSessions: 0
    });
    const req = request(
      input.endpoint,
      {
        method: 'POST',
        agent,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json; charset=UTF-8',
          'content-length': Buffer.byteLength(input.body, 'utf8')
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        let length = 0;
        let responseFinished = false;
        const tlsProtocol =
          response.socket instanceof TLSSocket ? response.socket.getProtocol() : null;

        const failResponse = (error: Error): void => {
          if (responseFinished) return;
          responseFinished = true;
          agent.destroy();
          reject(error);
        };

        response.on('data', (chunk: Buffer) => {
          if (responseFinished) return;
          length += chunk.length;
          if (length > MAX_RESPONSE_BYTES) {
            failResponse(new FursDomainError('FURS_TLS_RESPONSE_SIZE', 'FURS response exceeds the allowed size'));
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', (error) => failResponse(error));
        response.on('aborted', () => {
          failResponse(new FursDomainError('FURS_TLS_RESPONSE_ABORTED', 'FURS response was interrupted'));
        });
        response.on('end', () => {
          if (responseFinished) return;
          responseFinished = true;
          const statusCode = response.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString('utf8');
          if (statusCode < 200 || statusCode >= 300) {
            agent.destroy();
            const retryable = statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
            reject(
              new FursDomainError(
                retryable ? 'FURS_TLS_HTTP_RETRYABLE' : 'FURS_TLS_HTTP_CLIENT',
                `FURS returned HTTP status ${statusCode}`
              )
            );
            return;
          }
          resolve(
            Object.freeze({
              statusCode,
              headers: Object.freeze({ ...response.headers }),
              body,
              tlsProtocol
            })
          );
          agent.destroy();
        });
      }
    );

    req.setTimeout(timeoutMilliseconds, () => {
      req.destroy(new FursDomainError('FURS_TLS_TIMEOUT', 'FURS mTLS request timed out'));
    });
    req.on('error', (error) => {
      agent.destroy();
      reject(error);
    });
    req.end(input.body, 'utf8');
  });
}

export interface FursMtlsTransportOptions {
  readonly environment: FursEnvironment;
  readonly signer: SoftwareFiscalSigner;
  readonly serverTrustAnchors: readonly (string | Buffer)[];
  readonly timeoutMilliseconds?: number;
}

export interface FursEchoObservation {
  readonly value: string;
  readonly serverDate: string | undefined;
  readonly observedAt: Date;
}

/** Requirements: FURS-TLS-001 and FURS-TLS-002. */
export class FursMtlsTransport {
  readonly #environment: FursEnvironment;
  readonly #secureContext: SecureContext;
  readonly #timeoutMilliseconds: number | undefined;

  public constructor(options: FursMtlsTransportOptions) {
    this.#environment = options.environment;
    this.#secureContext = options.signer.createMtlsSecureContext(options.serverTrustAnchors);
    this.#timeoutMilliseconds = options.timeoutMilliseconds;
  }

  public async send(service: FursService, body: string): Promise<StrictMtlsResponse> {
    const endpoint = new URL(FURS_ENDPOINTS[this.#environment][service]);
    return postJsonWithStrictMtls({
      endpoint,
      body,
      secureContext: this.#secureContext,
      ...(this.#timeoutMilliseconds === undefined
        ? {}
        : { timeoutMilliseconds: this.#timeoutMilliseconds })
    });
  }

  public async echoWithMetadata(value: string): Promise<FursEchoObservation> {
    if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
      throw new FursDomainError('FURS_ECHO_VALUE', 'Echo value must contain 1 to 256 characters');
    }
    const response = await this.send('echo', JSON.stringify({ EchoRequest: value }));
    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new FursDomainError('FURS_ECHO_JSON', 'FURS echo response is not valid JSON');
    }
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).EchoResponse !== value
    ) {
      throw new FursDomainError('FURS_ECHO_MISMATCH', 'FURS echo response does not match the request');
    }
    const date = response.headers.date;
    return Object.freeze({
      value,
      serverDate: typeof date === 'string' ? date : undefined,
      observedAt: new Date()
    });
  }

  public async echo(value: string): Promise<string> {
    return (await this.echoWithMetadata(value)).value;
  }
}

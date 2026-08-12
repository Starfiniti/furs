import type {
  BusinessPremiseRequest,
  EchoResponse,
  ElectronicDeviceRequest,
  ElectronicDeviceResponse,
  ErrorResponse,
  FiscalDocumentResponse,
  FiscalInvoiceRequest,
  OperatorDocumentsResponse,
  OperatorSummaryResponse,
  ReadyHealthResponse,
  ReconciliationResponse,
  RetryAcceptedResponse,
  SystemInfoResponse
} from './types.js';

export class FursApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly correlationId: string | undefined;

  public constructor(statusCode: number, error: ErrorResponse['error']) {
    super(error.message);
    this.name = 'FursApiClientError';
    this.statusCode = statusCode;
    this.code = error.code;
    this.correlationId = error.correlationId;
  }
}

export interface FursApiClientOptions {
  readonly baseUrl: string;
  readonly bearerToken: string;
  readonly fetch?: typeof globalThis.fetch;
}

export class FursApiClient {
  readonly #baseUrl: URL;
  readonly #bearerToken: string;
  readonly #fetch: typeof globalThis.fetch;

  public constructor(options: FursApiClientOptions) {
    this.#baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(this.#baseUrl.hostname);
    if (this.#baseUrl.protocol !== 'https:' && !(this.#baseUrl.protocol === 'http:' && loopback)) {
      throw new TypeError('FURS API URL must use HTTPS outside loopback');
    }
    if (this.#baseUrl.username !== '' || this.#baseUrl.password !== '' || this.#baseUrl.search !== '' || this.#baseUrl.hash !== '') {
      throw new TypeError('FURS API base URL must not contain credentials, query or fragment');
    }
    if (options.bearerToken.length < 32) throw new TypeError('FURS API bearer token must contain at least 32 characters');
    this.#bearerToken = options.bearerToken;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  public createFiscalInvoice(request: FiscalInvoiceRequest, idempotencyKey: string): Promise<FiscalDocumentResponse> {
    return this.#request('v1/fiscal-invoices', 'POST', request, { 'idempotency-key': idempotencyKey });
  }

  public getFiscalInvoice(id: string): Promise<FiscalDocumentResponse> {
    return this.#request(`v1/fiscal-invoices/${encodeURIComponent(id)}`, 'GET');
  }

  public retryFiscalInvoice(id: string): Promise<RetryAcceptedResponse> {
    return this.#request(`v1/fiscal-invoices/${encodeURIComponent(id)}/retry`, 'POST');
  }

  public upsertBusinessPremise(request: BusinessPremiseRequest, idempotencyKey: string): Promise<FiscalDocumentResponse> {
    return this.#request('v1/business-premises', 'POST', request, { 'idempotency-key': idempotencyKey });
  }

  public updateBusinessPremise(id: string, request: BusinessPremiseRequest, idempotencyKey: string): Promise<FiscalDocumentResponse> {
    return this.#request(`v1/business-premises/${encodeURIComponent(id)}`, 'PATCH', request, { 'idempotency-key': idempotencyKey });
  }

  public runReconciliation(): Promise<ReconciliationResponse> {
    return this.#request('v1/reconciliation/run', 'POST');
  }

  public configureElectronicDevice(id: string, request: ElectronicDeviceRequest): Promise<ElectronicDeviceResponse> {
    return this.#request(`v1/electronic-devices/${encodeURIComponent(id)}`, 'PUT', request);
  }

  public echo(value: string): Promise<EchoResponse> {
    return this.#request('v1/furs/echo', 'POST', { value });
  }

  public getSystemInfo(): Promise<SystemInfoResponse> {
    return this.#request('v1/system/info', 'GET');
  }

  public getOperatorSummary(): Promise<OperatorSummaryResponse> {
    return this.#request('v1/operator/summary', 'GET');
  }

  public listOperatorDocuments(status?: string, limit = 100): Promise<OperatorDocumentsResponse> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (status !== undefined) query.set('status', status);
    return this.#request(`v1/operator/documents?${query}`, 'GET');
  }

  public getReadyHealth(): Promise<ReadyHealthResponse> {
    return this.#request('health/ready', 'GET');
  }

  public getLiveHealth(): Promise<{ readonly status: 'ok' }> {
    return this.#request('health/live', 'GET');
  }

  async #request<T>(path: string, method: string, body?: unknown, headers: Readonly<Record<string, string>> = {}): Promise<T> {
    const response = await this.#fetch(new URL(path, this.#baseUrl), {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.#bearerToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const value = await response.json() as unknown;
    if (!response.ok) {
      const envelope = value as Partial<ErrorResponse>;
      const error = envelope.error;
      if (error && typeof error.code === 'string' && typeof error.message === 'string') {
        throw new FursApiClientError(response.status, error);
      }
      throw new FursApiClientError(response.status, {
        code: 'FURS_CLIENT_HTTP_ERROR', message: `FURS API returned HTTP ${response.status}`,
        correlationId: '00000000-0000-0000-0000-000000000000'
      });
    }
    return value as T;
  }
}

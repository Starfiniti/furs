import { createHash, randomUUID } from 'node:crypto';

import type {
  FiscalDocumentResponse,
  FiscalGateway,
  FiscalInvoiceRequest,
  FiscalResultMetadataSink
} from '@starfiniti/furs-service-contract';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export class InMemoryFiscalGateway implements FiscalGateway {
  readonly #documents = new Map<string, { hash: string; document: FiscalDocumentResponse }>();
  public calls = 0;

  public async createFiscalInvoice(request: FiscalInvoiceRequest, idempotencyKey: string): Promise<FiscalDocumentResponse> {
    this.calls += 1;
    const hash = createHash('sha256').update(stable(request)).digest('hex');
    const existing = this.#documents.get(idempotencyKey);
    if (existing) {
      if (existing.hash !== hash) throw new Error('FURS_IDEMPOTENCY_CONFLICT');
      return existing.document;
    }
    const now = '2026-08-12T10:00:00.000Z';
    const document = Object.freeze({
      id: randomUUID(), operationClass: 'FISCAL_INVOICE' as const, kind: request.kind,
      ...(request.correctionOfDocumentId === undefined ? {} : { correctionOfDocumentId: request.correctionOfDocumentId }),
      status: request.subsequentSubmit === true ? 'ISSUED_WITHOUT_EOR' as const : 'READY' as const,
      businessPremiseId: request.businessPremiseId,
      electronicDeviceId: request.electronicDeviceId,
      issueLocalTime: request.issueLocalTime,
      messageId: request.messageId,
      payloadSha256: hash,
      schemaSha256: 'a'.repeat(64),
      createdAt: now,
      updatedAt: now,
      subsequentSubmit: request.subsequentSubmit === true
    });
    this.#documents.set(idempotencyKey, { hash, document });
    return document;
  }
}

export class RecordingMetadataSink implements FiscalResultMetadataSink {
  public readonly writes: unknown[] = [];
  public async write(result: unknown): Promise<void> { this.writes.push(Object.freeze(result)); }
}

export function fiscalInvoiceFixture(overrides: Partial<FiscalInvoiceRequest> = {}): FiscalInvoiceRequest {
  return {
    legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760401', taxNumber: '12345678', kind: 'STANDARD',
    businessPremiseId: 'TRGOVINA1', electronicDeviceId: 'BLAG1', issueLocalTime: '2026-08-12T12:34:56',
    messageId: '4e64a93a-40fa-4c02-afb1-488534b85e4c', numberingStructure: 'B',
    invoiceAmount: '12.20', paymentAmount: '12.20',
    taxesPerSeller: [{ vat: [{ rate: '22.00', taxableAmount: '10.00', taxAmount: '2.20' }] }],
    operator: { kind: 'slovenian', taxNumber: '87654321' },
    ...overrides
  };
}

export function assertNoSensitiveLeak(text: string, secrets: readonly string[] = []): void {
  const forbidden = [
    '-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----', 'BEGIN PKCS12',
    '12345678', '87654321', ...secrets.filter(Boolean)
  ];
  for (const value of forbidden) {
    if (text.includes(value)) throw new Error('Sensitive value found in output');
  }
  if (/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text)) {
    throw new Error('Raw signed token found in output');
  }
}

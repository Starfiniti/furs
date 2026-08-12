import { createHash } from 'node:crypto';

import type { FiscalDocumentResponse, FiscalInvoiceRequest } from './types.js';

export interface FiscalGateway {
  createFiscalInvoice(request: FiscalInvoiceRequest, idempotencyKey: string): Promise<FiscalDocumentResponse>;
}

export interface FiscalResultMetadataSink {
  write(result: Readonly<{
    platform: string; aggregateId: string; eventId: string; documentId: string;
    status: FiscalDocumentResponse['status']; zoi?: string; eor?: string;
  }>): Promise<void>;
}

export type ReviewedFiscalizationDecision =
  | { readonly action: 'fiscalize'; readonly policyVersion: string; readonly reviewedBy: string }
  | { readonly action: 'skip'; readonly policyVersion: string; readonly reviewedBy: string; readonly reasonCode: string };

export interface FinalizedPlatformFiscalEvent {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly revision: string;
  readonly signatureVerified: boolean;
  readonly decision: ReviewedFiscalizationDecision;
  readonly command?: FiscalInvoiceRequest;
}

export type PlatformFiscalEventResult =
  | { readonly kind: 'skipped'; readonly reasonCode: string }
  | { readonly kind: 'submitted'; readonly document: FiscalDocumentResponse; readonly idempotencyKey: string };

function boundedSafeText(value: string, name: string, maximum = 100): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !/^[A-Za-z0-9._:/-]+$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

export function createPlatformIdempotencyKey(
  platform: string,
  event: Pick<FinalizedPlatformFiscalEvent, 'aggregateId' | 'revision'>
): string {
  const namespace = boundedSafeText(platform.toLowerCase(), 'Platform', 30);
  const aggregate = boundedSafeText(event.aggregateId, 'Aggregate ID');
  const revision = boundedSafeText(event.revision, 'Revision');
  const digest = createHash('sha256').update(`${namespace}\0${aggregate}\0${revision}`, 'utf8').digest('base64url');
  return `${namespace}:${digest}`;
}

/** FURS-IDEMP-001/PAY-001: reviewed upstream policy plus stable delivery key. */
export async function processFinalizedPlatformFiscalEvent(
  platform: string,
  event: FinalizedPlatformFiscalEvent,
  gateway: FiscalGateway,
  metadata: FiscalResultMetadataSink
): Promise<PlatformFiscalEventResult> {
  if (!event.signatureVerified) throw new Error('Platform event signature must be verified before fiscalization');
  if (!event.decision.policyVersion.trim() || !event.decision.reviewedBy.trim()) {
    throw new Error('Fiscalization decision must reference a reviewed policy version');
  }
  if (event.decision.action === 'skip') return Object.freeze({ kind: 'skipped', reasonCode: event.decision.reasonCode });
  if (event.command === undefined) throw new Error('Fiscalized platform event requires a finalized fiscal command');
  const idempotencyKey = createPlatformIdempotencyKey(platform, event);
  const document = await gateway.createFiscalInvoice(event.command, idempotencyKey);
  await metadata.write({
    platform, aggregateId: event.aggregateId, eventId: event.eventId,
    documentId: document.id, status: document.status,
    ...(document.zoi === undefined ? {} : { zoi: document.zoi }),
    ...(document.eor === undefined ? {} : { eor: document.eor })
  });
  return Object.freeze({ kind: 'submitted', document, idempotencyKey });
}

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FiscalStatus } from './types.js';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ZOI = /^[a-f0-9]{32}$/;
const TERMINAL_STATUSES = new Set<FiscalStatus>(['CONFIRMED', 'REJECTED', 'MANUAL_REVIEW', 'REVERSED']);

export interface SignedFiscalResultWebhookInput {
  readonly rawBody: string | Uint8Array;
  readonly webhookId: string | undefined;
  readonly timestampHeader: string | undefined;
  readonly signatureHeader: string | undefined;
  readonly secret: string;
  readonly now?: Date;
  readonly toleranceSeconds?: number;
}

export interface VerifiedFiscalResult {
  readonly webhookId: string;
  readonly documentId: string;
  readonly operationClass: 'FISCAL_INVOICE' | 'BUSINESS_PREMISE';
  readonly status: Extract<FiscalStatus, 'CONFIRMED' | 'REJECTED' | 'MANUAL_REVIEW' | 'REVERSED'>;
  readonly messageId: string;
  readonly payloadSha256: string;
  readonly zoi: string | undefined;
  readonly eor: string | undefined;
  readonly confirmedAt: string | undefined;
  readonly updatedAt: string;
}

export interface FiscalResultUpdateSink {
  /** Must durably deduplicate by webhookId before acknowledging the HTTP request. */
  applyTerminalResult(result: VerifiedFiscalResult): Promise<void>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, pattern: RegExp, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function parseResult(rawBody: string | Uint8Array, webhookId: string): VerifiedFiscalResult {
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(rawBody).toString('utf8')); }
  catch { throw new Error('Fiscal result webhook is not valid JSON'); }
  const root = record(decoded, 'Fiscal result webhook');
  if (root.event !== 'fiscal-document.updated') throw new Error('Fiscal result webhook event is unsupported');
  const document = record(root.document, 'Fiscal result document');
  const status = document.status;
  if (typeof status !== 'string' || !TERMINAL_STATUSES.has(status as FiscalStatus)) {
    throw new Error('Fiscal result status is not terminal');
  }
  if (typeof document.operationClass !== 'string' || !['FISCAL_INVOICE', 'BUSINESS_PREMISE'].includes(document.operationClass)) {
    throw new Error('Fiscal result operation class is invalid');
  }
  const documentId = optionalString(document.id, UUID, 'Fiscal result document ID');
  const messageId = optionalString(document.messageId, UUID, 'Fiscal result message ID');
  const payloadSha256 = optionalString(document.payloadSha256, SHA256, 'Fiscal result payload digest');
  const updatedAt = optionalString(document.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, 'Fiscal result update time');
  if (documentId === undefined || messageId === undefined || payloadSha256 === undefined || updatedAt === undefined) {
    throw new Error('Fiscal result document is incomplete');
  }
  const zoi = optionalString(document.zoi, ZOI, 'Fiscal result ZOI');
  const eor = optionalString(document.eor, UUID, 'Fiscal result EOR');
  const confirmedAt = optionalString(document.confirmedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, 'Fiscal result confirmation time');
  if (status === 'CONFIRMED' && document.operationClass === 'FISCAL_INVOICE' && (zoi === undefined || eor === undefined || confirmedAt === undefined)) {
    throw new Error('Confirmed fiscal invoice result is incomplete');
  }
  return Object.freeze({
    webhookId, documentId,
    operationClass: document.operationClass as VerifiedFiscalResult['operationClass'],
    status: status as VerifiedFiscalResult['status'], messageId, payloadSha256,
    zoi, eor, confirmedAt, updatedAt
  });
}

/** Requirements: FURS-SEC-002, FURS-IDEMP-001, FURS-AUD-001. */
export function verifySignedFiscalResultWebhook(input: SignedFiscalResultWebhookInput): VerifiedFiscalResult {
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(tolerance) || tolerance < 1 || tolerance > 3600 || input.secret.length < 32) {
    throw new Error('Fiscal result webhook verification configuration is invalid');
  }
  if (typeof input.webhookId !== 'string' || !/^\d{1,20}$/.test(input.webhookId)) throw new Error('Fiscal result webhook ID is invalid');
  if (typeof input.timestampHeader !== 'string' || !/^\d{1,20}$/.test(input.timestampHeader)) throw new Error('Fiscal result webhook timestamp is invalid');
  const timestamp = Number(input.timestampHeader);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(now) || Math.abs(now - timestamp) > tolerance) {
    throw new Error('Fiscal result webhook timestamp is outside the replay window');
  }
  if (typeof input.signatureHeader !== 'string' || !/^v1=[a-f0-9]{64}$/.test(input.signatureHeader)) {
    throw new Error('Fiscal result webhook signature is invalid');
  }
  const provided = Buffer.from(input.signatureHeader.slice(3), 'hex');
  const calculated = createHmac('sha256', input.secret)
    .update(`${input.timestampHeader}.`, 'utf8').update(input.rawBody).digest();
  if (!timingSafeEqual(provided, calculated)) throw new Error('Fiscal result webhook signature verification failed');
  return parseResult(input.rawBody, input.webhookId);
}

export async function processSignedFiscalResultWebhook(
  input: SignedFiscalResultWebhookInput,
  sink: FiscalResultUpdateSink
): Promise<VerifiedFiscalResult> {
  const result = verifySignedFiscalResultWebhook(input);
  await sink.applyTerminalResult(result);
  return result;
}

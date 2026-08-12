import { createHash, randomUUID } from 'node:crypto';

import { FursDomainError } from './domain-error.js';
import type { ValidatedFursPayload } from './furs-json.js';
import type { BusinessPremiseId, FiscalInvoiceIdentity, MessageId, Zoi } from './value-types.js';

export type FiscalDocumentStatus =
  | 'DRAFT'
  | 'READY'
  | 'SENDING'
  | 'CONFIRMED'
  | 'ISSUED_WITHOUT_EOR'
  | 'RETRY_PENDING'
  | 'REJECTED'
  | 'MANUAL_REVIEW'
  | 'REVERSED';

export type FiscalDocumentKind = 'STANDARD' | 'CORRECTION' | 'CANCELLATION';

const TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['READY'] as const),
  READY: Object.freeze(['SENDING', 'MANUAL_REVIEW'] as const),
  SENDING: Object.freeze([
    'CONFIRMED',
    'ISSUED_WITHOUT_EOR',
    'RETRY_PENDING',
    'REJECTED',
    'MANUAL_REVIEW'
  ] as const),
  CONFIRMED: Object.freeze(['REVERSED'] as const),
  ISSUED_WITHOUT_EOR: Object.freeze(['SENDING', 'MANUAL_REVIEW'] as const),
  RETRY_PENDING: Object.freeze(['SENDING', 'MANUAL_REVIEW'] as const),
  REJECTED: Object.freeze([] as const),
  MANUAL_REVIEW: Object.freeze(['SENDING', 'REJECTED'] as const),
  REVERSED: Object.freeze([] as const)
}) satisfies Readonly<Record<FiscalDocumentStatus, readonly FiscalDocumentStatus[]>>;

/** Requirements: FURS-OUT-001/002, FURS-COR-001, FURS-AUD-001. */
export function assertFiscalStatusTransition(
  from: FiscalDocumentStatus,
  to: FiscalDocumentStatus
): void {
  const allowed = TRANSITIONS[from] as readonly FiscalDocumentStatus[];
  if (!allowed.includes(to)) {
    throw new FursDomainError('FURS_STATUS_TRANSITION', `Fiscal status transition ${from} -> ${to} is not allowed`);
  }
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;

export class IdempotencyKey {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): IdempotencyKey {
    if (typeof value !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
      throw new FursDomainError(
        'FURS_IDEMPOTENCY_KEY',
        'Idempotency key must contain 8-128 safe ASCII characters'
      );
    }
    return new IdempotencyKey(value);
  }

  public toString(): string {
    return this.#value;
  }
}

export interface PreparedFiscalCommandInput {
  readonly operationId?: string;
  readonly legalEntityId: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly kind: FiscalDocumentKind;
  readonly correctionOfOperationId?: string;
  readonly identity: FiscalInvoiceIdentity;
  readonly messageId: MessageId;
  readonly payload: ValidatedFursPayload;
  readonly zoi: Zoi;
  readonly issueDateTime: string;
  readonly issuedWithoutEor?: boolean;
}

function uuid(value: string, name: string): string {
  if (!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(value)) {
    throw new FursDomainError('FURS_WORKFLOW_UUID', `${name} must be a UUID`);
  }
  return value.toLowerCase();
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Immutable persisted-before-send command snapshot. */
export class PreparedFiscalCommand {
  public readonly operationId: string;
  public readonly legalEntityId: string;
  public readonly idempotencyKey: IdempotencyKey;
  public readonly kind: FiscalDocumentKind;
  public readonly correctionOfOperationId: string | undefined;
  public readonly identity: FiscalInvoiceIdentity;
  public readonly messageId: MessageId;
  public readonly payloadJson: string;
  public readonly payloadSha256: string;
  public readonly schemaSha256: string;
  public readonly zoi: Zoi;
  public readonly issueDateTime: string;
  public readonly issuedWithoutEor: boolean;

  private constructor(input: PreparedFiscalCommandInput) {
    this.operationId = uuid(input.operationId ?? randomUUID(), 'Operation ID');
    this.legalEntityId = uuid(input.legalEntityId, 'Legal-entity ID');
    this.idempotencyKey = input.idempotencyKey;
    this.kind = input.kind;
    this.correctionOfOperationId =
      input.correctionOfOperationId === undefined
        ? undefined
        : uuid(input.correctionOfOperationId, 'Corrected operation ID');
    this.identity = input.identity;
    this.messageId = input.messageId;
    this.payloadJson = input.payload.toString();
    this.payloadSha256 = sha256(this.payloadJson);
    this.schemaSha256 = input.payload.schemaSha256;
    this.zoi = input.zoi;
    this.issueDateTime = input.issueDateTime;
    this.issuedWithoutEor = input.issuedWithoutEor ?? false;
    Object.freeze(this);
  }

  public static create(input: PreparedFiscalCommandInput): PreparedFiscalCommand {
    if (input.kind === 'STANDARD' && input.correctionOfOperationId !== undefined) {
      throw new FursDomainError('FURS_CORRECTION_REFERENCE', 'Standard invoice cannot reference a corrected operation');
    }
    if (input.kind !== 'STANDARD' && input.correctionOfOperationId === undefined) {
      throw new FursDomainError('FURS_CORRECTION_REFERENCE', 'Correction/cancellation must reference the original operation');
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input.issueDateTime)) {
      throw new FursDomainError('FURS_WORKFLOW_TIME', 'Prepared command issue time must be canonical local time');
    }
    return new PreparedFiscalCommand(input);
  }
}

export interface PreparedBusinessPremiseCommandInput {
  readonly operationId?: string;
  readonly legalEntityId: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly businessPremiseId: BusinessPremiseId;
  readonly requestedStatus: 'REGISTERED' | 'CLOSED';
  readonly messageId: MessageId;
  readonly payload: ValidatedFursPayload;
  readonly sentAt: string;
}

export class PreparedBusinessPremiseCommand {
  public readonly operationId: string;
  public readonly legalEntityId: string;
  public readonly idempotencyKey: IdempotencyKey;
  public readonly businessPremiseId: BusinessPremiseId;
  public readonly requestedStatus: 'REGISTERED' | 'CLOSED';
  public readonly messageId: MessageId;
  public readonly payloadJson: string;
  public readonly payloadSha256: string;
  public readonly schemaSha256: string;
  public readonly sentAt: string;

  private constructor(input: PreparedBusinessPremiseCommandInput) {
    this.operationId = uuid(input.operationId ?? randomUUID(), 'Operation ID');
    this.legalEntityId = uuid(input.legalEntityId, 'Legal-entity ID');
    this.idempotencyKey = input.idempotencyKey;
    this.businessPremiseId = input.businessPremiseId;
    this.requestedStatus = input.requestedStatus;
    this.messageId = input.messageId;
    this.payloadJson = input.payload.toString();
    this.payloadSha256 = sha256(this.payloadJson);
    this.schemaSha256 = input.payload.schemaSha256;
    this.sentAt = input.sentAt;
    Object.freeze(this);
  }

  public static create(input: PreparedBusinessPremiseCommandInput): PreparedBusinessPremiseCommand {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input.sentAt)) {
      throw new FursDomainError('FURS_WORKFLOW_TIME', 'Premise command time must be canonical local time');
    }
    return new PreparedBusinessPremiseCommand(input);
  }
}

export type DeliveryFailureKind =
  | 'CONNECTION_TEMPORARY'
  | 'HTTP_SERVER_ERROR'
  | 'HTTP_CLIENT_ERROR'
  | 'FURS_BUSINESS_REJECTION'
  | 'CERTIFICATE_OR_TLS_CONFIGURATION'
  | 'INVALID_SIGNED_RESPONSE'
  | 'UNKNOWN_DELIVERY_OUTCOME'
  | 'ISSUING_DEVICE_FAILURE';

export type FailureDisposition =
  | 'RETRY_PENDING'
  | 'REJECTED'
  | 'MANUAL_REVIEW'
  | 'DEVICE_FALLBACK_REQUIRED';

export function classifyDeliveryFailure(kind: DeliveryFailureKind): FailureDisposition {
  switch (kind) {
    case 'CONNECTION_TEMPORARY':
    case 'HTTP_SERVER_ERROR':
      return 'RETRY_PENDING';
    case 'FURS_BUSINESS_REJECTION':
      return 'REJECTED';
    case 'CERTIFICATE_OR_TLS_CONFIGURATION':
    case 'INVALID_SIGNED_RESPONSE':
    case 'HTTP_CLIENT_ERROR':
    case 'UNKNOWN_DELIVERY_OUTCOME':
      return 'MANUAL_REVIEW';
    case 'ISSUING_DEVICE_FAILURE':
      return 'DEVICE_FALLBACK_REQUIRED';
  }
}

export interface RetryPolicyInput {
  readonly attemptNumber: number;
  readonly baseDelayMs?: number;
  readonly maximumDelayMs?: number;
  readonly maximumAttempts?: number;
}

export interface RetryDecision {
  readonly retry: boolean;
  readonly delayMs: number | undefined;
  readonly nextStatus: 'RETRY_PENDING' | 'MANUAL_REVIEW';
}

/** Bounded deterministic backoff; jitter is applied by worker scheduling, not legal evidence. */
export function decideRetry(input: RetryPolicyInput): RetryDecision {
  const base = input.baseDelayMs ?? 1_000;
  const cap = input.maximumDelayMs ?? 300_000;
  const maximumAttempts = input.maximumAttempts ?? 8;
  if (
    !Number.isSafeInteger(input.attemptNumber) ||
    input.attemptNumber < 1 ||
    !Number.isSafeInteger(base) ||
    base < 1 ||
    !Number.isSafeInteger(cap) ||
    cap < base ||
    !Number.isSafeInteger(maximumAttempts) ||
    maximumAttempts < 1
  ) {
    throw new FursDomainError('FURS_RETRY_POLICY', 'Retry policy values are invalid');
  }
  if (input.attemptNumber >= maximumAttempts) {
    return Object.freeze({ retry: false, delayMs: undefined, nextStatus: 'MANUAL_REVIEW' });
  }
  const delayMs = Math.min(cap, base * 2 ** (input.attemptNumber - 1));
  return Object.freeze({ retry: true, delayMs, nextStatus: 'RETRY_PENDING' });
}

export function assertIssuingDeviceOperational(operational: boolean): void {
  if (!operational) {
    throw new FursDomainError(
      'FURS_DEVICE_FALLBACK_REQUIRED',
      'Ordinary electronic issuance is blocked; follow the approved VKR/operator fallback procedure'
    );
  }
}

export interface AttemptEvidenceInput {
  readonly requestPayloadJson: string;
  readonly responsePayloadJson?: string;
  readonly certificateFingerprint256: string;
  readonly schemaSha256: string;
}

export interface AttemptEvidence {
  readonly requestSha256: string;
  readonly responseSha256: string | undefined;
  readonly certificateFingerprint256: string;
  readonly schemaSha256: string;
}

export function createAttemptEvidence(input: AttemptEvidenceInput): AttemptEvidence {
  if (!/^[a-f0-9]{64}$/i.test(input.schemaSha256)) {
    throw new FursDomainError('FURS_EVIDENCE_SCHEMA', 'Evidence schema digest is invalid');
  }
  if (!/^(?:[a-f0-9]{2}:){31}[a-f0-9]{2}$/i.test(input.certificateFingerprint256)) {
    throw new FursDomainError('FURS_EVIDENCE_CERTIFICATE', 'Evidence certificate fingerprint is invalid');
  }
  return Object.freeze({
    requestSha256: sha256(input.requestPayloadJson),
    responseSha256:
      input.responsePayloadJson === undefined ? undefined : sha256(input.responsePayloadJson),
    certificateFingerprint256: input.certificateFingerprint256.toUpperCase(),
    schemaSha256: input.schemaSha256.toLowerCase()
  });
}

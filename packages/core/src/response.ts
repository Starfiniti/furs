import { FursDomainError } from './domain-error.js';
import { verifyFursJws } from './jws.js';
import type { VerifyFursJwsOptions } from './jws.js';
import type { PinnedOfficialSchemaValidator } from './schema-validator.js';
import { Eor, MessageId } from './value-types.js';

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FursDomainError('FURS_RESPONSE_SHAPE', `${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function responseTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    throw new FursDomainError('FURS_RESPONSE_TIMESTAMP', 'Response timestamp must be a string');
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) {
    throw new FursDomainError('FURS_RESPONSE_TIMESTAMP', 'Response timestamp has an unsupported format');
  }
  return value;
}

export interface FursResponseHeader {
  readonly messageId: MessageId;
  readonly dateTime: string;
}

export interface FursProtocolError {
  readonly code: string;
  readonly message: string;
}

function parseHeader(value: unknown, expectedMessageId: MessageId): FursResponseHeader {
  const header = record(value, 'Response header');
  const messageId = MessageId.parse(String(header.MessageID ?? ''));
  if (messageId.toString() !== expectedMessageId.toString()) {
    throw new FursDomainError('FURS_RESPONSE_MESSAGE_ID', 'Response message ID does not match the request');
  }
  return Object.freeze({
    messageId,
    dateTime: responseTimestamp(header.DateTime)
  });
}

function parseError(value: unknown): FursProtocolError {
  const error = record(value, 'FURS error');
  if (typeof error.ErrorCode !== 'string' || !/^[sS]\d{3}$/.test(error.ErrorCode)) {
    throw new FursDomainError('FURS_RESPONSE_ERROR_CODE', 'FURS error code must use SXXX format');
  }
  if (
    typeof error.ErrorMessage !== 'string' ||
    [...error.ErrorMessage].length < 1 ||
    [...error.ErrorMessage].length > 4000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(error.ErrorMessage)
  ) {
    throw new FursDomainError('FURS_RESPONSE_ERROR_MESSAGE', 'FURS error message is invalid');
  }
  return Object.freeze({ code: error.ErrorCode.toUpperCase(), message: error.ErrorMessage });
}

interface VerifiedResponseEvidence {
  readonly signerFingerprint256: string;
  readonly schemaSha256: string;
}

export type VerifiedInvoiceResponse =
  | (VerifiedResponseEvidence & {
      readonly kind: 'confirmed';
      readonly header: FursResponseHeader;
      readonly eor: Eor;
    })
  | (VerifiedResponseEvidence & {
      readonly kind: 'rejected';
      readonly header: FursResponseHeader;
      readonly error: FursProtocolError;
    });

export interface VerifyTypedResponseOptions {
  readonly jws: VerifyFursJwsOptions;
  readonly schema: PinnedOfficialSchemaValidator;
  readonly expectedMessageId: MessageId;
}

function evidence(fingerprint: string, schemaSha256: string): VerifiedResponseEvidence {
  return Object.freeze({ signerFingerprint256: fingerprint, schemaSha256 });
}

/** Requirements: FURS-JWS-002, FURS-SCHEMA-001. */
export function verifyInvoiceResponseJws(
  token: string,
  options: VerifyTypedResponseOptions
): VerifiedInvoiceResponse {
  const verified = verifyFursJws<unknown>(token, options.jws);
  options.schema.assertValid(verified.payload);
  const root = record(verified.payload, 'FURS response payload');
  const response = record(root.InvoiceResponse, 'InvoiceResponse');
  const header = parseHeader(response.Header, options.expectedMessageId);
  const shared = evidence(verified.signerCertificate.fingerprint256, options.schema.sha256);
  const hasError = response.Error !== undefined;
  const hasEor = response.UniqueInvoiceID !== undefined;
  if (hasError === hasEor) {
    throw new FursDomainError(
      'FURS_INVOICE_RESPONSE_OUTCOME',
      'Invoice response must contain exactly one of EOR or Error'
    );
  }
  if (hasError) {
    return Object.freeze({ ...shared, kind: 'rejected', header, error: parseError(response.Error) });
  }
  if (typeof response.UniqueInvoiceID !== 'string') {
    throw new FursDomainError('FURS_INVOICE_RESPONSE_EOR', 'Confirmed invoice response must contain an EOR');
  }
  return Object.freeze({ ...shared, kind: 'confirmed', header, eor: Eor.parse(response.UniqueInvoiceID) });
}

export type VerifiedBusinessPremiseResponse =
  | (VerifiedResponseEvidence & {
      readonly kind: 'accepted';
      readonly header: FursResponseHeader;
    })
  | (VerifiedResponseEvidence & {
      readonly kind: 'rejected';
      readonly header: FursResponseHeader;
      readonly error: FursProtocolError;
    });

/** Requirements: FURS-JWS-002, FURS-SCHEMA-001, FURS-PREM-001. */
export function verifyBusinessPremiseResponseJws(
  token: string,
  options: VerifyTypedResponseOptions
): VerifiedBusinessPremiseResponse {
  const verified = verifyFursJws<unknown>(token, options.jws);
  options.schema.assertValid(verified.payload);
  const root = record(verified.payload, 'FURS response payload');
  const response = record(root.BusinessPremiseResponse, 'BusinessPremiseResponse');
  const header = parseHeader(response.Header, options.expectedMessageId);
  const shared = evidence(verified.signerCertificate.fingerprint256, options.schema.sha256);
  if (response.Error === undefined) return Object.freeze({ ...shared, kind: 'accepted', header });
  return Object.freeze({ ...shared, kind: 'rejected', header, error: parseError(response.Error) });
}

import { createHash } from 'node:crypto';

import { DecimalAmount } from './decimal-amount.js';
import { FursDomainError } from './domain-error.js';
import type { FiscalSigner } from './fiscal-signer.js';
import { LocalInvoiceDateTime } from './local-invoice-date-time.js';

export interface ZoiInput {
  readonly taxNumber: string;
  readonly issueDateTime: LocalInvoiceDateTime;
  readonly invoiceNumber: string;
  readonly businessPremiseId: string;
  readonly electronicDeviceId: string;
  readonly invoiceAmount: DecimalAmount;
}

export interface CanonicalZoiInput {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly utf8Hex: string;
}

function assertIdentifier(name: string, value: string, pattern: RegExp): void {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new FursDomainError('FURS_ZOI_IDENTIFIER', `${name} is not valid for ZOI construction`);
  }
}

/** Requirements: FURS-ZOI-001, FURS-TIME-002, FURS-MONEY-001. */
export function buildCanonicalZoiInput(input: ZoiInput): CanonicalZoiInput {
  assertIdentifier('taxNumber', input.taxNumber, /^[1-9]\d{7}$/);
  assertIdentifier('invoiceNumber', input.invoiceNumber, /^[^\u0000-\u001f\u007f]{1,20}$/u);
  assertIdentifier('businessPremiseId', input.businessPremiseId, /^[0-9A-Za-z]{1,20}$/);
  assertIdentifier('electronicDeviceId', input.electronicDeviceId, /^[0-9A-Za-z]{1,20}$/);

  const text =
    input.taxNumber +
    input.issueDateTime.toZoiDateTime() +
    input.invoiceNumber +
    input.businessPremiseId +
    input.electronicDeviceId +
    input.invoiceAmount.toString();
  const bytes = Buffer.from(text, 'utf8');

  return Object.freeze({
    text,
    bytes,
    utf8Hex: bytes.toString('hex')
  });
}

/** Requirement: FURS-ZOI-002. */
export async function calculateZoi(input: ZoiInput, signer: FiscalSigner): Promise<string> {
  const canonical = buildCanonicalZoiInput(input);
  const signature = await signer.signRsaSha256(canonical.bytes);
  return createHash('md5').update(signature).digest('hex');
}

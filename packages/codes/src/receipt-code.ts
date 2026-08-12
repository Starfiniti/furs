import { FursDomainError, LocalInvoiceDateTime, SlovenianTaxNumber, Zoi } from '@starfiniti/furs-core';

export interface ReceiptCodeInput {
  readonly zoi: Zoi;
  readonly taxNumber: SlovenianTaxNumber;
  readonly issueDateTime: LocalInvoiceDateTime;
}

export interface ReceiptCodeParts {
  readonly zoiDecimal: string;
  readonly taxNumber: string;
  readonly issueDateTime: string;
  readonly checkDigit: string;
  readonly data: string;
}

function digitSum(value: string): number {
  let sum = 0;
  for (const digit of value) sum += digit.charCodeAt(0) - 48;
  return sum;
}

/** FURS-CODE-001: exact 39 + 8 + 12 + 1 numeric construction. */
export function buildReceiptCode(input: ReceiptCodeInput): ReceiptCodeParts {
  const zoiDecimal = BigInt(`0x${input.zoi.toString()}`).toString(10).padStart(39, '0');
  if (zoiDecimal.length !== 39) {
    throw new FursDomainError('FURS_RECEIPT_ZOI_DECIMAL', 'ZOI decimal representation must fit 39 digits');
  }
  const taxNumber = input.taxNumber.toString();
  const issueDateTime = input.issueDateTime.toReceiptCodeDateTime();
  const withoutCheck = `${zoiDecimal}${taxNumber}${issueDateTime}`;
  if (!/^\d{59}$/.test(withoutCheck)) {
    throw new FursDomainError('FURS_RECEIPT_DATA', 'Receipt-code source must contain exactly 59 digits');
  }
  const checkDigit = String(digitSum(withoutCheck) % 10);
  return Object.freeze({
    zoiDecimal,
    taxNumber,
    issueDateTime,
    checkDigit,
    data: `${withoutCheck}${checkDigit}`
  });
}

export function assertValidReceiptCodeData(data: string): void {
  if (!/^\d{60}$/.test(data)) throw new FursDomainError('FURS_RECEIPT_DATA', 'Receipt code must contain 60 digits');
  const expected = digitSum(data.slice(0, -1)) % 10;
  if (Number(data.at(-1)) !== expected) throw new FursDomainError('FURS_RECEIPT_CHECKSUM', 'Receipt-code checksum is invalid');
}

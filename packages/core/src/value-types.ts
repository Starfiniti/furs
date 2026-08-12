import { randomUUID } from 'node:crypto';

import { FursDomainError } from './domain-error.js';

function assertText(name: string, value: string, pattern: RegExp, description: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new FursDomainError('FURS_VALUE_FORMAT', `${name} ${description}`);
  }
  return value;
}

export class SlovenianTaxNumber {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): SlovenianTaxNumber {
    return new SlovenianTaxNumber(
      assertText('Slovenian tax number', value, /^[1-9]\d{7}$/, 'must contain exactly eight digits and cannot start with zero')
    );
  }

  public toInteger(): number {
    return Number(this.#value);
  }

  public toString(): string {
    return this.#value;
  }
}

export class BusinessPremiseId {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): BusinessPremiseId {
    return new BusinessPremiseId(
      assertText('Business-premise ID', value, /^[0-9A-Za-z]{1,20}$/, 'must contain 1-20 ASCII letters or digits')
    );
  }

  public toString(): string {
    return this.#value;
  }
}

export class ElectronicDeviceId {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): ElectronicDeviceId {
    return new ElectronicDeviceId(
      assertText('Electronic-device ID', value, /^[0-9A-Za-z]{1,20}$/, 'must contain 1-20 ASCII letters or digits')
    );
  }

  public toString(): string {
    return this.#value;
  }
}

export class InvoiceSequence {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): InvoiceSequence {
    return new InvoiceSequence(
      assertText('Invoice sequence', value, /^[1-9]\d{0,19}$/, 'must contain 1-20 digits and cannot start with zero')
    );
  }

  public toString(): string {
    return this.#value;
  }
}

export class FiscalInvoiceIdentity {
  public readonly businessPremiseId: BusinessPremiseId;
  public readonly electronicDeviceId: ElectronicDeviceId;
  public readonly invoiceSequence: InvoiceSequence;

  public constructor(
    businessPremiseId: BusinessPremiseId,
    electronicDeviceId: ElectronicDeviceId,
    invoiceSequence: InvoiceSequence
  ) {
    this.businessPremiseId = businessPremiseId;
    this.electronicDeviceId = electronicDeviceId;
    this.invoiceSequence = invoiceSequence;
    Object.freeze(this);
  }

  public toString(): string {
    return `${this.businessPremiseId}/${this.electronicDeviceId}/${this.invoiceSequence}`;
  }
}

const UUID_PATTERN = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

export class MessageId {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static create(): MessageId {
    return new MessageId(randomUUID());
  }

  public static parse(value: string): MessageId {
    return new MessageId(assertText('Message ID', value, UUID_PATTERN, 'must be a UUID').toLowerCase());
  }

  public toString(): string {
    return this.#value;
  }
}

export class Zoi {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): Zoi {
    return new Zoi(assertText('ZOI', value, /^[a-f0-9]{32}$/, 'must contain exactly 32 lowercase hexadecimal characters'));
  }

  public toString(): string {
    return this.#value;
  }
}

export class Eor {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): Eor {
    return new Eor(assertText('EOR', value, UUID_PATTERN, 'must be a UUID').toLowerCase());
  }

  public toString(): string {
    return this.#value;
  }
}

export class FursDate {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  public static parse(value: string): FursDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new FursDomainError('FURS_DATE_FORMAT', 'FURS date must use YYYY-MM-DD');
    }
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year === 0 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) {
      throw new FursDomainError('FURS_DATE_VALUE', 'FURS date is not a valid calendar date');
    }
    return new FursDate(value);
  }

  public toString(): string {
    return this.#value;
  }
}

const VAT_RATE_PATTERN = /^(-?)(0|[1-9]\d*)\.(\d{2})$/;
const MAX_VAT_RATE_HUNDREDTHS = 9_999_900n;

export class VatRate {
  readonly #hundredths: bigint;

  private constructor(hundredths: bigint) {
    this.#hundredths = hundredths;
    Object.freeze(this);
  }

  public static parse(value: string): VatRate {
    if (typeof value !== 'string') {
      throw new FursDomainError('FURS_VAT_RATE_TYPE', 'VAT rate must be provided as a string');
    }
    const match = VAT_RATE_PATTERN.exec(value);
    if (!match) {
      throw new FursDomainError('FURS_VAT_RATE_FORMAT', 'VAT rate must use canonical dot notation with exactly two decimals');
    }
    const [, sign, integerPart, fractionalPart] = match;
    if (integerPart === undefined || fractionalPart === undefined) {
      throw new FursDomainError('FURS_VAT_RATE_FORMAT', 'VAT rate could not be parsed');
    }
    let hundredths = BigInt(integerPart) * 100n + BigInt(fractionalPart);
    if (sign === '-') {
      if (hundredths === 0n) {
        throw new FursDomainError('FURS_VAT_RATE_NEGATIVE_ZERO', 'Negative zero is not canonical');
      }
      hundredths = -hundredths;
    }
    if (hundredths < -MAX_VAT_RATE_HUNDREDTHS || hundredths > MAX_VAT_RATE_HUNDREDTHS) {
      throw new FursDomainError('FURS_VAT_RATE_RANGE', 'VAT rate must be between -99999.00 and 99999.00');
    }
    return new VatRate(hundredths);
  }

  public toJsonNumberToken(): string {
    return this.toString();
  }

  public toString(): string {
    const negative = this.#hundredths < 0n;
    const absolute = negative ? -this.#hundredths : this.#hundredths;
    return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  }
}

export type OperatorKind = 'slovenian' | 'foreign' | 'self-service';

export class OperatorIdentity {
  public readonly kind: OperatorKind;
  public readonly taxNumber: SlovenianTaxNumber | undefined;

  private constructor(kind: OperatorKind, taxNumber: SlovenianTaxNumber | undefined) {
    this.kind = kind;
    this.taxNumber = taxNumber;
    Object.freeze(this);
  }

  public static slovenian(taxNumber: SlovenianTaxNumber): OperatorIdentity {
    return new OperatorIdentity('slovenian', taxNumber);
  }

  public static foreign(): OperatorIdentity {
    return new OperatorIdentity('foreign', undefined);
  }

  public static selfService(liableTaxNumber: SlovenianTaxNumber): OperatorIdentity {
    return new OperatorIdentity('self-service', liableTaxNumber);
  }
}

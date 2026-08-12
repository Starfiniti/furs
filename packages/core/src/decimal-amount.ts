import { FursDomainError } from './domain-error.js';

const CANONICAL_AMOUNT_PATTERN = /^(-?)(0|[1-9]\d*)\.(\d{2})$/;
const MAX_ABSOLUTE_MINOR_UNITS = 10_000_000_000_000_000n;

/**
 * Exact FURS monetary value represented as integer hundredths.
 *
 * Requirement: FURS-MONEY-001.
 */
export class DecimalAmount {
  readonly #minorUnits: bigint;

  private constructor(minorUnits: bigint) {
    this.#minorUnits = minorUnits;
    Object.freeze(this);
  }

  public static parse(value: string): DecimalAmount {
    if (typeof value !== 'string') {
      throw new FursDomainError('FURS_MONEY_TYPE', 'Decimal amount must be provided as a string');
    }

    const match = CANONICAL_AMOUNT_PATTERN.exec(value);
    if (!match) {
      throw new FursDomainError(
        'FURS_MONEY_FORMAT',
        'Decimal amount must use canonical dot notation with exactly two decimal places'
      );
    }

    const [, sign, integerPart, fractionalPart] = match;
    if (integerPart === undefined || fractionalPart === undefined) {
      throw new FursDomainError('FURS_MONEY_FORMAT', 'Decimal amount could not be parsed');
    }

    let minorUnits = BigInt(integerPart) * 100n + BigInt(fractionalPart);
    if (sign === '-') {
      if (minorUnits === 0n) {
        throw new FursDomainError('FURS_MONEY_NEGATIVE_ZERO', 'Negative zero is not canonical');
      }
      minorUnits = -minorUnits;
    }

    return DecimalAmount.fromMinorUnits(minorUnits);
  }

  public static fromMinorUnits(minorUnits: bigint): DecimalAmount {
    if (typeof minorUnits !== 'bigint') {
      throw new FursDomainError('FURS_MONEY_MINOR_UNITS_TYPE', 'Minor units must be a bigint');
    }

    const absolute = minorUnits < 0n ? -minorUnits : minorUnits;
    if (absolute >= MAX_ABSOLUTE_MINOR_UNITS) {
      throw new FursDomainError(
        'FURS_MONEY_RANGE',
        'Decimal amount must be greater than -100000000000000 and less than 100000000000000'
      );
    }

    return new DecimalAmount(minorUnits);
  }

  public toMinorUnits(): bigint {
    return this.#minorUnits;
  }

  public toJsonNumberToken(): string {
    return this.toString();
  }

  public toString(): string {
    const negative = this.#minorUnits < 0n;
    const absolute = negative ? -this.#minorUnits : this.#minorUnits;
    const integerPart = absolute / 100n;
    const fractionalPart = (absolute % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${integerPart}.${fractionalPart}`;
  }
}

import { createHash } from 'node:crypto';

import AjvDraft04 from 'ajv-draft-04';
import type { ErrorObject, ValidateFunction } from 'ajv';

import { FursDomainError } from './domain-error.js';

const Draft04Validator = AjvDraft04 as unknown as new (options: {
  allErrors: boolean;
  multipleOfPrecision: number;
  strict: boolean;
  validateFormats: boolean;
}) => {
  addFormat(name: string, format: { validate(value: string): boolean }): unknown;
  compile(schema: object): ValidateFunction;
};

const FURS_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))?)?$/;

function isFursDateTime(value: string): boolean {
  const match = FURS_DATE_TIME_PATTERN.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetSign, offsetHourText, offsetMinuteText] =
    match;
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    (hourText === undefined) !== (minuteText === undefined) ||
    (hourText === undefined) !== (secondText === undefined)
  ) {
    return false;
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (year === 0 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (day < 1 || day > daysInMonth) return false;

  if (offsetSign !== undefined) {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return true;
}

export interface SchemaValidationIssue {
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly message: string;
}

export class FursSchemaValidationError extends FursDomainError {
  public readonly issues: readonly SchemaValidationIssue[];

  public constructor(issues: readonly SchemaValidationIssue[]) {
    super(
      'FURS_SCHEMA_VALIDATION',
      `Payload does not conform to the pinned official schema (${issues.length} issue${issues.length === 1 ? '' : 's'})`
    );
    this.name = 'FursSchemaValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

function redactIssue(error: ErrorObject): SchemaValidationIssue {
  return Object.freeze({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'schema validation failed'
  });
}

function withoutFursAnnotationIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFursAnnotationIds);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'id')
      .map(([key, child]) => [key, withoutFursAnnotationIds(child)])
  );
}

/** Requirement: FURS-SCHEMA-001. */
export class PinnedOfficialSchemaValidator {
  readonly #sha256: string;
  readonly #validate: ValidateFunction;

  private constructor(sha256: string, validate: ValidateFunction) {
    this.#sha256 = sha256;
    this.#validate = validate;
    Object.freeze(this);
  }

  public static fromUtf8Bytes(
    schemaBytes: Uint8Array,
    expectedSha256: string
  ): PinnedOfficialSchemaValidator {
    if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) {
      throw new FursDomainError('FURS_SCHEMA_DIGEST', 'Expected schema SHA-256 is invalid');
    }
    const actualSha256 = createHash('sha256').update(schemaBytes).digest('hex');
    if (actualSha256 !== expectedSha256.toLowerCase()) {
      throw new FursDomainError('FURS_SCHEMA_DIGEST_MISMATCH', 'Official schema SHA-256 does not match');
    }

    let schema: unknown;
    try {
      schema = JSON.parse(Buffer.from(schemaBytes).toString('utf8'));
    } catch {
      throw new FursDomainError('FURS_SCHEMA_JSON', 'Official schema is not valid JSON');
    }
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
      throw new FursDomainError('FURS_SCHEMA_OBJECT', 'Official schema must be a JSON object');
    }

    try {
      const ajv = new Draft04Validator({
        allErrors: true,
        multipleOfPrecision: 8,
        strict: false,
        validateFormats: true
      });
      // FURS applies this schema format label to three documented wire forms:
      // date-only premise validity, local whole-second invoice values, and
      // response/header timestamps that may include Z and fractions. Domain
      // types remain stricter for each outbound field.
      ajv.addFormat('date-time', { validate: isFursDateTime });
      // The official schema repeats short `id` labels such as "InvoiceNumber".
      // Ajv correctly treats Draft-04 `id` as a resolution scope and rejects the
      // resulting ambiguous references. FURS uses these values only as labels,
      // so they are removed after digest verification and before compilation.
      return new PinnedOfficialSchemaValidator(
        actualSha256,
        ajv.compile(withoutFursAnnotationIds(schema) as object)
      );
    } catch {
      throw new FursDomainError('FURS_SCHEMA_COMPILE', 'Official schema could not be compiled');
    }
  }

  public get sha256(): string {
    return this.#sha256;
  }

  public assertValid(value: unknown): void {
    if (this.#validate(value)) return;
    const issues = (this.#validate.errors ?? []).map(redactIssue);
    throw new FursSchemaValidationError(issues);
  }

  public parseAndAssertValid(json: string): unknown {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new FursDomainError('FURS_PAYLOAD_JSON', 'Payload is not valid JSON');
    }
    this.assertValid(value);
    return value;
  }
}

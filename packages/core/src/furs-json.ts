import { FursDomainError } from './domain-error.js';
import type { PinnedOfficialSchemaValidator } from './schema-validator.js';

const JSON_NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export class FursJsonNumber {
  readonly #token: string;

  private constructor(token: string) {
    this.#token = token;
    Object.freeze(this);
  }

  public static exact(token: string): FursJsonNumber {
    if (typeof token !== 'string' || !JSON_NUMBER_PATTERN.test(token) || !Number.isFinite(Number(token))) {
      throw new FursDomainError('FURS_JSON_NUMBER', 'Exact JSON number token is invalid');
    }
    return new FursJsonNumber(token);
  }

  public toString(): string {
    return this.#token;
  }
}

type FursJsonValue =
  | null
  | boolean
  | string
  | number
  | FursJsonNumber
  | readonly FursJsonValue[]
  | { readonly [key: string]: FursJsonValue };

function serializeValue(value: FursJsonValue): string {
  if (value instanceof FursJsonNumber) return value.toString();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new FursDomainError('FURS_JSON_INTEGER', 'Ordinary JSON numbers must be safe integers');
    }
    return value.toString();
  }
  if (Array.isArray(value)) return `[${value.map(serializeValue).join(',')}]`;
  if (typeof value !== 'object') {
    throw new FursDomainError('FURS_JSON_VALUE', 'Unsupported FURS JSON value');
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new FursDomainError('FURS_JSON_OBJECT', 'FURS JSON objects must be plain records');
  }
  return `{${Object.entries(value)
    .map(([key, child]) => `${JSON.stringify(key)}:${serializeValue(child)}`)
    .join(',')}}`;
}

export function serializeFursJson(value: FursJsonValue): string {
  return serializeValue(value);
}

export class ValidatedFursPayload {
  readonly #json: string;
  readonly #schemaSha256: string;

  private constructor(json: string, schemaSha256: string) {
    this.#json = json;
    this.#schemaSha256 = schemaSha256;
    Object.freeze(this);
  }

  public static fromJson(json: string, validator: PinnedOfficialSchemaValidator): ValidatedFursPayload {
    validator.parseAndAssertValid(json);
    return new ValidatedFursPayload(json, validator.sha256);
  }

  public get schemaSha256(): string {
    return this.#schemaSha256;
  }

  public toString(): string {
    return this.#json;
  }
}

export type { FursJsonValue };

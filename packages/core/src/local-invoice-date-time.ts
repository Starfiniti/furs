import { FursDomainError } from './domain-error.js';

const TIME_ZONE = 'Europe/Ljubljana';
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const formatter = new Intl.DateTimeFormat('en-CA-u-ca-iso8601', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

export type DstDisambiguation = 'reject' | 'earlier' | 'later';

export interface LocalInvoiceDateTimeOptions {
  readonly disambiguation?: DstDisambiguation;
}

interface DateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function utcEpochFromParts(parts: DateTimeParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

function assertCalendarDate(parts: DateTimeParts): void {
  const date = new Date(utcEpochFromParts(parts));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day ||
    date.getUTCHours() !== parts.hour ||
    date.getUTCMinutes() !== parts.minute ||
    date.getUTCSeconds() !== parts.second
  ) {
    throw new FursDomainError('FURS_TIME_CALENDAR', 'Invoice time is not a valid calendar date and time');
  }
}

function partsAtInstant(epochMilliseconds: number): DateTimeParts {
  const values = new Map(
    formatter
      .formatToParts(new Date(epochMilliseconds))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );

  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  const hour = values.get('hour');
  const minute = values.get('minute');
  const second = values.get('second');

  if ([year, month, day, hour, minute, second].some((value) => value === undefined)) {
    throw new FursDomainError('FURS_TIME_INTL', 'Unable to resolve Europe/Ljubljana time-zone data');
  }

  return {
    year: year as number,
    month: month as number,
    day: day as number,
    hour: hour as number,
    minute: minute as number,
    second: second as number
  };
}

function sameParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

function possibleInstants(parts: DateTimeParts): readonly number[] {
  const localEpoch = utcEpochFromParts(parts);
  const offsets = new Set<number>();

  for (let deltaHours = -36; deltaHours <= 36; deltaHours += 6) {
    const probe = localEpoch + deltaHours * 60 * 60 * 1000;
    const localProbeEpoch = utcEpochFromParts(partsAtInstant(probe));
    offsets.add(Math.round((localProbeEpoch - probe) / 60_000));
  }

  const matches = new Set<number>();
  for (const offsetMinutes of offsets) {
    const candidate = localEpoch - offsetMinutes * 60_000;
    if (sameParts(partsAtInstant(candidate), parts)) {
      matches.add(candidate);
    }
  }

  return [...matches].sort((left, right) => left - right);
}

/**
 * Immutable local legal invoice time in Europe/Ljubljana.
 *
 * Requirements: FURS-TIME-001 and FURS-TIME-002.
 */
export class LocalInvoiceDateTime {
  readonly #canonicalValue: string;
  readonly #parts: DateTimeParts;
  readonly #instantEpochMilliseconds: number;
  readonly #offsetMinutes: number;

  private constructor(
    canonicalValue: string,
    parts: DateTimeParts,
    instantEpochMilliseconds: number
  ) {
    this.#canonicalValue = canonicalValue;
    this.#parts = Object.freeze({ ...parts });
    this.#instantEpochMilliseconds = instantEpochMilliseconds;
    this.#offsetMinutes = Math.round(
      (utcEpochFromParts(parts) - instantEpochMilliseconds) / 60_000
    );
    Object.freeze(this);
  }

  public static parse(
    value: string,
    options: LocalInvoiceDateTimeOptions = {}
  ): LocalInvoiceDateTime {
    if (typeof value !== 'string') {
      throw new FursDomainError('FURS_TIME_TYPE', 'Invoice time must be provided as a string');
    }

    const match = LOCAL_DATE_TIME_PATTERN.exec(value);
    if (!match) {
      throw new FursDomainError(
        'FURS_TIME_FORMAT',
        'Invoice time must use YYYY-MM-DDTHH:mm:ss without an offset or milliseconds'
      );
    }

    const numericParts = match.slice(1).map(Number);
    const [year, month, day, hour, minute, second] = numericParts;
    if ([year, month, day, hour, minute, second].some((part) => part === undefined)) {
      throw new FursDomainError('FURS_TIME_FORMAT', 'Invoice time could not be parsed');
    }

    const parts: DateTimeParts = {
      year: year as number,
      month: month as number,
      day: day as number,
      hour: hour as number,
      minute: minute as number,
      second: second as number
    };
    assertCalendarDate(parts);

    const instants = possibleInstants(parts);
    if (instants.length === 0) {
      throw new FursDomainError(
        'FURS_TIME_DST_GAP',
        'Invoice time does not exist in Europe/Ljubljana because of a DST transition'
      );
    }

    const disambiguation = options.disambiguation ?? 'reject';
    if (instants.length > 1 && disambiguation === 'reject') {
      throw new FursDomainError(
        'FURS_TIME_DST_OVERLAP',
        'Invoice time is ambiguous in Europe/Ljubljana; choose earlier or later explicitly'
      );
    }

    const selected = disambiguation === 'later' ? instants.at(-1) : instants[0];
    if (selected === undefined) {
      throw new FursDomainError('FURS_TIME_RESOLUTION', 'Invoice time could not be resolved');
    }

    return new LocalInvoiceDateTime(value, parts, selected);
  }

  public get timeZone(): 'Europe/Ljubljana' {
    return TIME_ZONE;
  }

  public get offsetMinutes(): number {
    return this.#offsetMinutes;
  }

  public toEpochMilliseconds(): number {
    return this.#instantEpochMilliseconds;
  }

  public toPayloadDateTime(): string {
    return this.#canonicalValue;
  }

  public toZoiDateTime(): string {
    const { year, month, day, hour, minute, second } = this.#parts;
    return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).padStart(4, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  }

  public toReceiptCodeDateTime(): string {
    const { year, month, day, hour, minute, second } = this.#parts;
    return `${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}${String(second).padStart(2, '0')}`;
  }

  public toString(): string {
    return this.#canonicalValue;
  }
}

import { DomainError } from './errors';

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar date with no time and no timezone ("2026-12-15").
 * Internally it is a day count since 1970-01-01 so arithmetic never meets DST.
 * "Today" is never computed here from `new Date()`: it comes from the Clock port.
 */
export class LocalDate {
  private constructor(private readonly epochDay: number) {}

  static parse(input: string): LocalDate {
    const match = ISO_DATE.exec(input);
    if (!match) throw new DomainError('INVALID_DATE', `Invalid date: "${input}"`);
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const ms = Date.UTC(y, m - 1, d);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      throw new DomainError('INVALID_DATE', `Invalid date: "${input}"`);
    }
    return new LocalDate(Math.round(ms / DAY_MS));
  }

  static isValid(input: string): boolean {
    try {
      LocalDate.parse(input);
      return true;
    } catch {
      return false;
    }
  }

  /** The calendar date of `instant` as seen in `timeZone` (e.g. "Africa/Tunis"). */
  static fromInstant(instant: Date, timeZone: string): LocalDate {
    const iso = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    return LocalDate.parse(iso);
  }

  /** For persistence adapters: a JS Date at UTC midnight (Postgres `date`). */
  static fromUtcMidnight(date: Date): LocalDate {
    return LocalDate.parse(date.toISOString().slice(0, 10));
  }

  static max(a: LocalDate, b: LocalDate): LocalDate {
    return a.compare(b) >= 0 ? a : b;
  }

  static min(a: LocalDate, b: LocalDate): LocalDate {
    return a.compare(b) <= 0 ? a : b;
  }

  addDays(days: number): LocalDate {
    if (!Number.isInteger(days)) throw new DomainError('INVALID_DATE', 'addDays expects an integer');
    return new LocalDate(this.epochDay + days);
  }

  /** Same day N months later, clamped to the month's last day (31 jan + 1 month = 28/29 feb). */
  addMonths(months: number, preferredDay = this.day): LocalDate {
    const total = this.year * 12 + (this.month - 1) + months;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(preferredDay, lastDay);
    return LocalDate.parse(`${year}-${pad(month)}-${pad(day)}`);
  }

  /** Number of days from `other` to this date (positive when this is later). */
  diffDays(other: LocalDate): number {
    return this.epochDay - other.epochDay;
  }

  compare(other: LocalDate): -1 | 0 | 1 {
    return this.epochDay < other.epochDay ? -1 : this.epochDay > other.epochDay ? 1 : 0;
  }

  equals(other: LocalDate): boolean {
    return this.epochDay === other.epochDay;
  }

  isBefore(other: LocalDate): boolean {
    return this.epochDay < other.epochDay;
  }

  isAfter(other: LocalDate): boolean {
    return this.epochDay > other.epochDay;
  }

  get year(): number {
    return this.toUtcDate().getUTCFullYear();
  }

  get month(): number {
    return this.toUtcDate().getUTCMonth() + 1;
  }

  get day(): number {
    return this.toUtcDate().getUTCDate();
  }

  /** 1 = Monday … 7 = Sunday */
  get isoWeekday(): number {
    const d = this.toUtcDate().getUTCDay();
    return d === 0 ? 7 : d;
  }

  /** Monday of this date's week. */
  startOfWeek(): LocalDate {
    return this.addDays(1 - this.isoWeekday);
  }

  toUtcDate(): Date {
    return new Date(this.epochDay * DAY_MS);
  }

  toString(): string {
    return this.toUtcDate().toISOString().slice(0, 10);
  }

  toJSON(): string {
    return this.toString();
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

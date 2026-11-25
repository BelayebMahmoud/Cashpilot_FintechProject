import { LocalDate, Money } from '@cashpilot/domain';

/*
 * The only place where database types meet domain types.
 * Amounts: Postgres BigInt ⇄ domain safe-integer millimes. Dates: @db.Date (UTC midnight) ⇄ LocalDate.
 */

export function toBigInt(value: Money | number): bigint {
  const n = typeof value === 'number' ? value : value.millimes;
  if (!Number.isSafeInteger(n)) throw new RangeError(`Unsafe amount: ${n}`);
  return BigInt(n);
}

/** Rejects values outside Number's safe range instead of silently losing precision. */
export function fromBigInt(value: bigint | number): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || BigInt(n) !== BigInt(value)) {
    throw new RangeError(`Amount ${value.toString()} exceeds the safe integer range`);
  }
  return n;
}

export function toMoney(value: bigint | number): Money {
  return Money.ofMillimes(fromBigInt(value));
}

export function toDbDate(date: LocalDate): Date {
  return date.toUtcDate();
}

export function fromDbDate(date: Date): LocalDate {
  return LocalDate.fromUtcMidnight(date);
}

export function fromDbDateOrNull(date: Date | null): LocalDate | null {
  return date ? fromDbDate(date) : null;
}

/** JSON-safe copy for Json columns (Money → number, LocalDate → string). */
export function toJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

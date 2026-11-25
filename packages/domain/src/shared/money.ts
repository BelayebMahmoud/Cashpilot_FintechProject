import { DomainError } from './errors';

const MILLIMES_PER_DINAR = 1000n;
const AMOUNT_PATTERN = /^-?\d+(\.\d{1,3})?$/;
const SPACES = /[\s  ]/g;

/**
 * An amount of Tunisian dinars stored as an integer number of millimes
 * (1 DT = 1 000 millimes). Floats are never used for maths: the only place that
 * rounds is `mulRatio`, which works in BigInt with half-up rounding.
 */
export class Money {
  private constructor(readonly millimes: number) {}

  static ofMillimes(millimes: number): Money {
    if (!Number.isSafeInteger(millimes)) {
      throw new DomainError('INVALID_AMOUNT', `Not a safe integer amount: ${millimes}`);
    }
    return new Money(millimes === 0 ? 0 : millimes); // normalise -0
  }

  /** Whole dinars only (tests, seed). Use `parse` for user input. */
  static dinars(whole: number): Money {
    if (!Number.isInteger(whole)) {
      throw new DomainError('INVALID_AMOUNT', 'dinars() takes whole numbers');
    }
    return Money.ofMillimes(whole * 1000);
  }

  static zero(): Money {
    return Money.ofMillimes(0);
  }

  /**
   * Parses user input such as "1 234,5", "1234.500" or "-20".
   * Spaces (incl. no-break spaces) are removed and "," is read as ".";
   * at most 3 decimals are allowed. Anything else → INVALID_AMOUNT.
   */
  static parse(input: string): Money {
    const normalised = input.replace(SPACES, '').replace(',', '.');
    if (!AMOUNT_PATTERN.test(normalised)) {
      throw new DomainError('INVALID_AMOUNT', `Invalid amount: "${input}"`);
    }
    const negative = normalised.startsWith('-');
    const [intPart = '0', fracPart = ''] = normalised.replace('-', '').split('.');
    const millimes = BigInt(intPart) * MILLIMES_PER_DINAR + BigInt(fracPart.padEnd(3, '0'));
    return Money.fromBigInt(negative ? -millimes : millimes);
  }

  static sum(values: readonly Money[]): Money {
    return values.reduce((acc, m) => acc.add(m), Money.zero());
  }

  static min(a: Money, b: Money): Money {
    return a.compare(b) <= 0 ? a : b;
  }

  static max(a: Money, b: Money): Money {
    return a.compare(b) >= 0 ? a : b;
  }

  private static fromBigInt(value: bigint): Money {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new DomainError('INVALID_AMOUNT', 'Amount out of range');
    }
    return Money.ofMillimes(Number(value));
  }

  add(other: Money): Money {
    return Money.ofMillimes(this.millimes + other.millimes);
  }

  subtract(other: Money): Money {
    return Money.ofMillimes(this.millimes - other.millimes);
  }

  negate(): Money {
    return Money.ofMillimes(-this.millimes);
  }

  abs(): Money {
    return this.isNegative() ? this.negate() : this;
  }

  isZero(): boolean {
    return this.millimes === 0;
  }

  isNegative(): boolean {
    return this.millimes < 0;
  }

  isPositive(): boolean {
    return this.millimes > 0;
  }

  /** -1, 0 or 1 */
  compare(other: Money): -1 | 0 | 1 {
    return this.millimes < other.millimes ? -1 : this.millimes > other.millimes ? 1 : 0;
  }

  equals(other: Money): boolean {
    return this.millimes === other.millimes;
  }

  min(other: Money): Money {
    return Money.min(this, other);
  }

  /**
   * this × numerator / denominator, rounded half away from zero ("half-up"),
   * computed in BigInt so no precision is lost on the intermediate product.
   */
  mulRatio(numerator: number, denominator: number): Money {
    if (
      !Number.isSafeInteger(numerator) ||
      !Number.isSafeInteger(denominator) ||
      denominator <= 0
    ) {
      throw new DomainError('INVALID_AMOUNT', 'mulRatio expects integers and a positive denominator');
    }
    const product = BigInt(this.millimes) * BigInt(numerator);
    const negative = product < 0n;
    const abs = negative ? -product : product;
    const den = BigInt(denominator);
    const rounded = (abs * 2n + den) / (den * 2n);
    return Money.fromBigInt(negative ? -rounded : rounded);
  }

  /** DTOs carry plain millimes. */
  toJSON(): number {
    return this.millimes;
  }

  /** Debug representation, e.g. "-1234.500". Formatting for humans is the UI's job. */
  toString(): string {
    const sign = this.millimes < 0 ? '-' : '';
    const abs = Math.abs(this.millimes);
    return `${sign}${Math.trunc(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`;
  }
}

import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { Money } from './money';

describe('Money.parse', () => {
  it.each([
    ['1 234,5', 1_234_500],
    ['1234.500', 1_234_500],
    ['-20', -20_000],
    ['1,005', 1_005],
    ['0', 0],
    ['0,001', 1],
    ['1 234,567', 1_234_567],
    ['1 000', 1_000_000],
    ['  42 ', 42_000],
  ])('parses %j as %i millimes', (input, expected) => {
    expect(Money.parse(input).millimes).toBe(expected);
  });

  it.each(['abc', '1.0001', '', '-', '1.2.3', '1,2,3', '12e3', '+5', '.5'])('rejects %j with INVALID_AMOUNT', (input) => {
    expect(() => Money.parse(input)).toThrowError(DomainError);
    try {
      Money.parse(input);
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('does not suffer from float errors: "1,005" is exactly 1005 millimes (1.005 * 1000 is not)', () => {
    expect(1.005 * 1000).not.toBe(1005);
    expect(Money.parse('1,005').millimes).toBe(1005);
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(() => Money.parse('99999999999999999')).toThrow(DomainError);
  });
});

describe('Money arithmetic', () => {
  const a = Money.ofMillimes(1500);
  const b = Money.ofMillimes(500);

  it('adds, subtracts and negates', () => {
    expect(a.add(b).millimes).toBe(2000);
    expect(b.subtract(a).millimes).toBe(-1000);
    expect(a.negate().millimes).toBe(-1500);
    expect(a.negate().abs().millimes).toBe(1500);
    expect(Money.sum([a, b, b]).millimes).toBe(2500);
  });

  it('compares and tests sign', () => {
    expect(a.compare(b)).toBe(1);
    expect(b.compare(a)).toBe(-1);
    expect(a.compare(Money.ofMillimes(1500))).toBe(0);
    expect(a.equals(Money.ofMillimes(1500))).toBe(true);
    expect(Money.zero().isZero()).toBe(true);
    expect(a.negate().isNegative()).toBe(true);
    expect(a.isPositive()).toBe(true);
    expect(Money.min(a, b)).toBe(b);
    expect(a.min(b)).toBe(b);
    expect(Money.max(a, b)).toBe(a);
  });

  it('normalises negative zero', () => {
    expect(Object.is(Money.zero().negate().millimes, 0)).toBe(true);
  });

  it('rejects non-integer millimes', () => {
    expect(() => Money.ofMillimes(1.5)).toThrow(DomainError);
    expect(() => Money.dinars(1.5)).toThrow(DomainError);
    expect(Money.dinars(5000).millimes).toBe(5_000_000);
  });

  it('serialises to millimes and prints a debug string', () => {
    expect(JSON.stringify({ m: Money.ofMillimes(1234567) })).toBe('{"m":1234567}');
    expect(Money.ofMillimes(-1234500).toString()).toBe('-1234.500');
    expect(Money.ofMillimes(5).toString()).toBe('0.005');
  });
});

describe('Money.mulRatio (half-up, BigInt)', () => {
  it.each([
    // [millimes, num, den, expected]
    [1000, 1900, 10_000, 190], // 19 % of 1 DT
    [1, 1, 2, 1], // 0.5 → 1 (half up)
    [3, 1, 2, 2], // 1.5 → 2
    [5, 1900, 10_000, 1], // 0.95 → 1
    [2, 1900, 10_000, 0], // 0.38 → 0
    [1_234_567, 150, 100, 1_851_851], // 1 851 850.5 → 1 851 851
    [-1, 1, 2, -1], // −0.5 → −1 (half away from zero)
    [-3, 1, 2, -2], // −1.5 → −2
    [-5, 1900, 10_000, -1],
    [9_007_199_254_740, 1000, 1000, 9_007_199_254_740], // large product stays exact
  ])('%i × %i / %i = %i', (m, num, den, expected) => {
    expect(Money.ofMillimes(m).mulRatio(num, den).millimes).toBe(expected);
  });

  it('rejects a non-positive or fractional denominator', () => {
    expect(() => Money.ofMillimes(1).mulRatio(1, 0)).toThrow(DomainError);
    expect(() => Money.ofMillimes(1).mulRatio(1.5, 2)).toThrow(DomainError);
  });
});

import { describe, expect, it } from 'vitest';
import { compactMoney, formatDate, formatMoney, formatPercentBp, formatRelativeDue, parseMoneyInput } from './format';

/** Normalises narrow/no-break spaces to plain spaces for readable assertions. */
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('formats fr-TN with 3 decimals and DT suffix', () => {
    expect(plain(formatMoney(1_234_500))).toBe('1 234,500 DT');
    expect(plain(formatMoney(0))).toBe('0,000 DT');
    expect(plain(formatMoney(5))).toBe('0,005 DT');
    expect(plain(formatMoney(1_000_000_000))).toBe('1 000 000,000 DT');
  });

  it('negative and signed forms use a true minus sign', () => {
    expect(plain(formatMoney(-1_000_000))).toBe('−1 000,000 DT');
    expect(plain(formatMoney(2_000_000, { signed: true }))).toBe('+2 000,000 DT');
    expect(plain(formatMoney(-2_000, { signed: true }))).toBe('−2,000 DT');
    expect(plain(formatMoney(1_005, { currency: false }))).toBe('1,005');
  });

  it('compact form for chart axes', () => {
    expect(plain(compactMoney(5_000_000))).toBe('5 k DT');
    expect(plain(compactMoney(-1_200_000))).toBe('−1,2 k DT');
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['1 234,5', 1_234_500],
    ['1234.500', 1_234_500],
    ['-20', -20_000],
    ['1,005', 1_005],
    ['1 000', 1_000_000],
  ])('%j → %i', (input, expected) => expect(parseMoneyInput(input)).toBe(expected));

  it.each(['abc', '1.0001', '', '1,2,3'])('%j → null', (input) => expect(parseMoneyInput(input)).toBeNull());
});

describe('dates', () => {
  it('formats dates in French', () => {
    expect(formatDate('2026-12-11')).toBe('11 déc. 2026');
    expect(formatDate('2026-12-11', 'numeric')).toBe('11/12/2026');
  });

  it('relative due dates', () => {
    expect(formatRelativeDue('2026-12-06', '2026-12-01')).toBe('dans 5 j');
    expect(formatRelativeDue('2026-12-01', '2026-12-01')).toBe("aujourd'hui");
    expect(formatRelativeDue('2026-12-02', '2026-12-01')).toBe('demain');
    expect(formatRelativeDue('2026-11-19', '2026-12-01')).toBe('en retard de 12 j');
  });

  it('percent from basis points', () => {
    expect(plain(formatPercentBp(6667))).toBe('66,7 %');
    expect(formatPercentBp(null)).toBe('—');
  });
});

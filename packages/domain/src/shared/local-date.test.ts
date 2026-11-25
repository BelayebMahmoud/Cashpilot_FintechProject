import { describe, expect, it } from 'vitest';
import { DomainError, NotFound, Forbidden, invariant, isDomainError } from './errors';
import { LocalDate } from './local-date';

const d = LocalDate.parse;

describe('LocalDate', () => {
  it('parses and prints ISO dates', () => {
    expect(d('2026-12-15').toString()).toBe('2026-12-15');
    expect(JSON.stringify({ d: d('2026-01-02') })).toBe('{"d":"2026-01-02"}');
    expect(d('2026-12-15').year).toBe(2026);
    expect(d('2026-12-15').month).toBe(12);
    expect(d('2026-12-15').day).toBe(15);
  });

  it.each(['2026-02-30', '2026-13-01', '15/12/2026', '', '2026-1-1'])('rejects %j', (s) => {
    expect(() => d(s)).toThrow(DomainError);
    expect(LocalDate.isValid(s)).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(d('2026-01-31').addDays(1).toString()).toBe('2026-02-01');
    expect(d('2026-12-31').addDays(1).toString()).toBe('2027-01-01');
    expect(d('2027-01-01').addDays(-1).toString()).toBe('2026-12-31');
    expect(d('2028-02-28').addDays(1).toString()).toBe('2028-02-29'); // leap year
    expect(d('2026-12-01').addDays(30).toString()).toBe('2026-12-31');
    expect(() => d('2026-12-01').addDays(1.5)).toThrow(DomainError);
  });

  it('adds months, clamping to the end of month', () => {
    expect(d('2026-01-31').addMonths(1).toString()).toBe('2026-02-28');
    expect(d('2026-11-15').addMonths(2).toString()).toBe('2027-01-15');
    expect(d('2026-01-31').addMonths(2, 31).toString()).toBe('2026-03-31');
  });

  it('diffs, compares, min and max', () => {
    expect(d('2027-01-01').diffDays(d('2026-12-01'))).toBe(31);
    expect(d('2026-12-01').diffDays(d('2026-12-16'))).toBe(-15);
    expect(d('2026-12-01').compare(d('2026-12-02'))).toBe(-1);
    expect(d('2026-12-02').compare(d('2026-12-01'))).toBe(1);
    expect(d('2026-12-02').equals(d('2026-12-02'))).toBe(true);
    expect(d('2026-12-01').isBefore(d('2026-12-02'))).toBe(true);
    expect(d('2026-12-03').isAfter(d('2026-12-02'))).toBe(true);
    expect(LocalDate.max(d('2026-12-01'), d('2026-11-01')).toString()).toBe('2026-12-01');
    expect(LocalDate.min(d('2026-12-01'), d('2026-11-01')).toString()).toBe('2026-11-01');
  });

  it('knows weekdays and the start of week (Monday)', () => {
    expect(d('2026-12-07').isoWeekday).toBe(1); // Monday
    expect(d('2026-12-13').isoWeekday).toBe(7); // Sunday
    expect(d('2026-12-13').startOfWeek().toString()).toBe('2026-12-07');
  });

  it('computes "today" in Africa/Tunis from a fixed instant at 23:30 UTC', () => {
    // 23:30 UTC on Dec 1st is already 00:30 on Dec 2nd in Tunis (UTC+1)
    const instant = new Date('2026-12-01T23:30:00Z');
    expect(LocalDate.fromInstant(instant, 'Africa/Tunis').toString()).toBe('2026-12-02');
    expect(LocalDate.fromInstant(instant, 'UTC').toString()).toBe('2026-12-01');
  });

  it('round-trips through UTC midnight (Postgres date)', () => {
    const date = d('2026-03-29');
    expect(LocalDate.fromUtcMidnight(date.toUtcDate()).equals(date)).toBe(true);
  });
});

describe('errors', () => {
  it('carries a code and details', () => {
    const e = new DomainError('INVOICE_OVERPAID', 'x', { remainingMillimes: 5 });
    expect(isDomainError(e)).toBe(true);
    expect(e.details).toEqual({ remainingMillimes: 5 });
    expect(new NotFound().code).toBe('NOT_FOUND');
    expect(new Forbidden().code).toBe('FORBIDDEN');
    expect(isDomainError(new Error('x'))).toBe(false);
    expect(() => invariant(false, 'VALIDATION')).toThrow(DomainError);
    expect(() => invariant(true, 'VALIDATION')).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/errors';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { PlannedFlow } from './planned-flow';

const d = LocalDate.parse;
const today = d('2026-12-01');

function flow(input: Partial<Parameters<typeof PlannedFlow.create>[3]> = {}) {
  return PlannedFlow.create(
    'pf1',
    'c1',
    'u1',
    { direction: 'OUT', amount: Money.dinars(4000), expectedDate: d('2026-12-28'), label: 'Salaires', recurrence: 'MONTHLY', ...input },
    today,
  );
}

describe('PlannedFlow', () => {
  it('MONTHLY recurrence across the horizon', () => {
    const f = flow();
    expect(f.occurrencesBetween(today, today.addDays(90)).map(String)).toEqual(['2026-12-28', '2027-01-28', '2027-02-28']);
  });

  it('MONTHLY on the 31st clamps to month end and keeps the 31st afterwards', () => {
    const f = flow({ expectedDate: d('2027-01-31') });
    expect(f.occurrencesBetween(today, d('2027-04-30')).map(String)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('stops at endDate and skips occurrences before `from`', () => {
    const f = flow({ expectedDate: d('2026-10-05'), endDate: d('2027-01-05') });
    expect(f.occurrencesBetween(today, today.addDays(90)).map(String)).toEqual(['2026-12-05', '2027-01-05']);
  });

  it('NONE occurs once inside the window', () => {
    const f = flow({ recurrence: 'NONE', expectedDate: d('2026-12-10') });
    expect(f.occurrencesBetween(today, today.addDays(30)).map(String)).toEqual(['2026-12-10']);
    expect(f.occurrencesBetween(today, today.addDays(5))).toEqual([]);
  });

  it('a cancelled flow has no occurrences', () => {
    const f = flow();
    f.cancel();
    expect(f.occurrencesBetween(today, today.addDays(90))).toEqual([]);
    expect(() => f.cancel()).toThrow(DomainError);
  });

  it('validates amount, label, past one-off date and end date', () => {
    expect(() => flow({ amount: Money.zero() })).toThrow(DomainError);
    expect(() => flow({ label: ' ' })).toThrow(DomainError);
    expect(() => flow({ recurrence: 'NONE', expectedDate: d('2026-11-30') })).toThrow(DomainError);
    expect(() => flow({ endDate: d('2026-12-01') })).toThrow(DomainError);
  });
});

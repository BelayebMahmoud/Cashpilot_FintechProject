import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/errors';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { fromFlowDto, toComparisonDto, toFlowDto, toProjectionDto } from './dto';
import { buildBaselineFlows, explainPoint, project, runwayDays } from './engine';
import { applyAdjustments, compareProjections } from './simulation';
import { DEFAULT_ASSUMPTIONS, type ForecastData, type Projection } from './types';

const d = LocalDate.parse;
const J0 = d('2026-12-01');
const DT = (n: number) => Money.dinars(n);

/** The brief's example: 5 000 DT, +3 000 due J+10, −6 000 approved expense due J+15. */
const golden: ForecastData = {
  realBalance: DT(5000),
  receivables: [{ invoiceId: 'inv1', label: 'FAC-2026-0001', remaining: DT(3000), dueDate: d('2026-12-11') }],
  payables: [{ expenseId: 'exp1', label: 'Licences', amount: DT(6000), dueDate: d('2026-12-16'), status: 'APPROVED' }],
  plannedFlows: [],
  milestones: [],
};

function balanceOn(p: Projection, date: string): number {
  const point = p.points.find((x) => x.date.toString() === date);
  if (!point) throw new Error(`no point ${date}`);
  return point.balance.millimes / 1000;
}

function expectRange(p: Projection, from: string, to: string, dinars: number) {
  for (let day = d(from); !day.isAfter(d(to)); day = day.addDays(1)) {
    expect(balanceOn(p, day.toString()), day.toString()).toBe(dinars);
  }
}

describe('golden forecast (brief example)', () => {
  const flows = buildBaselineFlows(golden, DEFAULT_ASSUMPTIONS, J0);
  const base = project(golden.realBalance, flows, J0, 30);

  it('baseline: 5 000 → 8 000 on 12-11 → 2 000 on 12-16, never negative', () => {
    expectRange(base, '2026-12-01', '2026-12-10', 5000);
    expectRange(base, '2026-12-11', '2026-12-15', 8000);
    expectRange(base, '2026-12-16', '2026-12-31', 2000);
    expect(base.firstNegativeDate).toBeNull();
    expect(base.min.balance.millimes).toBe(2_000_000);
    expect(base.shortfalls).toEqual([]);
    expect(runwayDays(base)).toBeNull();
  });

  it('simulation: receivable delayed 20 days → shortfall 12-16 → 12-30 at −1 000', () => {
    const simFlows = applyAdjustments(flows, [{ type: 'DELAY_RECEIVABLE', invoiceId: 'inv1', days: 20 }]);
    const sim = project(golden.realBalance, simFlows, J0, 30);
    expectRange(sim, '2026-12-01', '2026-12-15', 5000);
    expectRange(sim, '2026-12-16', '2026-12-30', -1000);
    expect(balanceOn(sim, '2026-12-31')).toBe(2000);
    expect(sim.firstNegativeDate?.toString()).toBe('2026-12-16');
    expect(sim.shortfalls).toHaveLength(1);
    const [s] = sim.shortfalls;
    expect(s!.from.toString()).toBe('2026-12-16');
    expect(s!.to.toString()).toBe('2026-12-30');
    expect(s!.days).toBe(15);
    expect(s!.minBalance.millimes).toBe(-1_000_000);
    expect(sim.endBalance.equals(base.endBalance)).toBe(true);
    expect(runwayDays(sim)).toBe(15);

    const c = compareProjections(base, sim);
    expect(c.min.delta.millimes).toBe(-3_000_000);
    expect(c.firstNegativeDate.sim?.toString()).toBe('2026-12-16');
    expect(c.endBalance.delta.isZero()).toBe(true);
    expect(c.shortfallDays).toEqual({ base: 0, sim: 15 });
    expect(c.runwayDays).toEqual({ base: null, sim: 15 });
  });

  it('applyAdjustments never mutates the baseline flows', () => {
    const before = flows.map(toFlowDto);
    applyAdjustments(flows, [{ type: 'DELAY_RECEIVABLE', invoiceId: 'inv1', days: 20 }]);
    expect(flows.map(toFlowDto)).toEqual(before);
  });

  it('explains a point: real + expected receipts − expected disbursements', () => {
    const e = explainPoint(base, flows, d('2026-12-16'));
    expect(e.realBalance.millimes).toBe(5_000_000);
    expect(e.expectedIn.millimes).toBe(3_000_000);
    expect(e.expectedOut.millimes).toBe(6_000_000);
    expect(e.balance.millimes).toBe(2_000_000);
    expect(e.flows.map((f) => f.key)).toEqual(['invoice:inv1', 'expense:exp1']);
  });
});

describe('project', () => {
  it('returns 31 points for 30 days (inclusive horizon), 61 and 91 for 60 and 90', () => {
    expect(project(DT(0), [], J0, 30).points).toHaveLength(31);
    expect(project(DT(0), [], J0, 60).points).toHaveLength(61);
    expect(project(DT(0), [], J0, 90).points).toHaveLength(91);
  });

  it('ignores flows after the horizon and records totals', () => {
    const flows = buildBaselineFlows(
      { ...golden, receivables: [{ invoiceId: 'late', label: 'x', remaining: DT(1), dueDate: d('2027-03-01') }] },
      DEFAULT_ASSUMPTIONS,
      J0,
    );
    const p = project(DT(5000), flows, J0, 30);
    expect(p.endBalance.millimes).toBe(-1_000_000);
    expect(p.totals.in.millimes).toBe(0);
    expect(p.totals.out.millimes).toBe(6_000_000);
  });

  it('counts flows dated before `from` on the first day', () => {
    const p = project(DT(0), [{ key: 'a', date: d('2026-11-01'), amount: DT(10), kind: 'PLANNED', label: 'a' }], J0, 30);
    expect(p.points[0]!.balance.millimes).toBe(10_000);
  });
});

describe('buildBaselineFlows', () => {
  it('forecast uses remaining only after partial payment', () => {
    // 3 000 invoice, 1 000 already received: real balance already includes it (6 000) and only 2 000 remains
    const data: ForecastData = {
      ...golden,
      realBalance: DT(6000),
      receivables: [{ invoiceId: 'inv1', label: 'x', remaining: DT(2000), dueDate: d('2026-12-11') }],
    };
    const p = project(data.realBalance, buildBaselineFlows(data, DEFAULT_ASSUMPTIONS, J0), J0, 30);
    expect(balanceOn(p, '2026-12-11')).toBe(8000); // 6 000 + 2 000, not 6 000 + 3 000
    expect(p.endBalance.millimes).toBe(2_000_000);
  });

  it('overdue policy ROLL_TO_TODAY moves past-due flows to today, flagged overdue', () => {
    const data: ForecastData = {
      ...golden,
      receivables: [{ invoiceId: 'old', label: 'x', remaining: DT(100), dueDate: d('2026-11-20') }],
    };
    const flows = buildBaselineFlows(data, DEFAULT_ASSUMPTIONS, J0);
    const f = flows.find((x) => x.key === 'invoice:old')!;
    expect(f.date.toString()).toBe('2026-12-01');
    expect(f.overdue).toBe(true);
    expect(f.originalDate?.toString()).toBe('2026-11-20');
  });

  it('overdue policy EXCLUDE drops past-due flows', () => {
    const data: ForecastData = {
      ...golden,
      receivables: [{ invoiceId: 'old', label: 'x', remaining: DT(100), dueDate: d('2026-11-20') }],
    };
    const flows = buildBaselineFlows(data, { ...DEFAULT_ASSUMPTIONS, overduePolicy: 'EXCLUDE' }, J0);
    expect(flows.some((x) => x.key === 'invoice:old')).toBe(false);
  });

  it('the pending-expenses toggle includes or excludes SUBMITTED expenses', () => {
    const data: ForecastData = {
      ...golden,
      payables: [{ expenseId: 'p', label: 'x', amount: DT(10), dueDate: d('2026-12-05'), status: 'SUBMITTED' }],
    };
    const withPending = buildBaselineFlows(data, DEFAULT_ASSUMPTIONS, J0);
    expect(withPending.find((f) => f.key === 'expense:p')?.pending).toBe(true);
    const without = buildBaselineFlows(data, { ...DEFAULT_ASSUMPTIONS, includePendingExpenses: false }, J0);
    expect(without.some((f) => f.key === 'expense:p')).toBe(false);
  });

  it('includes planned occurrences and milestones, skips zero remaining', () => {
    const data: ForecastData = {
      realBalance: DT(0),
      receivables: [{ invoiceId: 'paid', label: 'x', remaining: DT(0), dueDate: d('2026-12-05') }],
      payables: [],
      plannedFlows: [{ id: 'sal', label: 'Salaires', direction: 'OUT', amount: DT(1000), occurrences: [d('2026-12-28'), d('2027-01-28')] }],
      milestones: [{ id: 'm1', label: 'Acompte', amount: DT(500), expectedDate: d('2026-12-20') }],
    };
    const flows = buildBaselineFlows(data, DEFAULT_ASSUMPTIONS, J0);
    expect(flows.map((f) => f.key)).toEqual(['milestone:m1', 'planned:sal:2026-12-28', 'planned:sal:2027-01-28']);
    const p = project(DT(0), flows, J0, 60);
    expect(p.endBalance.millimes).toBe(-1_500_000);
  });
});

describe('applyAdjustments', () => {
  const flows = buildBaselineFlows(golden, DEFAULT_ASSUMPTIONS, J0);

  it('unknown target → ADJUSTMENT_TARGET_NOT_FOUND', () => {
    for (const adj of [
      { type: 'DELAY_RECEIVABLE' as const, invoiceId: 'nope', days: 3 },
      { type: 'SHIFT_PAYABLE' as const, expenseId: 'nope', days: 3 },
      { type: 'EXCLUDE_FLOW' as const, flowKey: 'nope' },
    ]) {
      try {
        applyAdjustments(flows, [adj]);
        expect.unreachable();
      } catch (e) {
        expect((e as DomainError).code).toBe('ADJUSTMENT_TARGET_NOT_FOUND');
      }
    }
  });

  it('shifts payables, adds inflows/outflows and excludes flows', () => {
    const result = applyAdjustments(flows, [
      { type: 'SHIFT_PAYABLE', expenseId: 'exp1', days: 5 },
      { type: 'ADD_INFLOW', label: 'Subvention', amountMillimes: 1_000_000, date: '2026-12-20' },
      { type: 'ADD_OUTFLOW', label: '', amountMillimes: 500_000, date: '2026-12-22' },
      { type: 'EXCLUDE_FLOW', flowKey: 'invoice:inv1' },
    ]);
    expect(result.map((f) => [f.key, f.date.toString(), f.amount.millimes])).toEqual([
      ['sim:1', '2026-12-20', 1_000_000],
      ['expense:exp1', '2026-12-21', -6_000_000],
      ['sim:2', '2026-12-22', -500_000],
    ]);
    expect(result.find((f) => f.key === 'sim:2')?.label).toBe('Dépense simulée');
  });

  it('rejects non-positive simulated amounts', () => {
    expect(() => applyAdjustments(flows, [{ type: 'ADD_INFLOW', label: 'x', amountMillimes: 0, date: '2026-12-20' }])).toThrow(DomainError);
  });
});

describe('DTOs', () => {
  it('round-trip flows and serialise projections', () => {
    const flows = buildBaselineFlows(golden, DEFAULT_ASSUMPTIONS, J0);
    expect(flows.map(toFlowDto).map(fromFlowDto).map(toFlowDto)).toEqual(flows.map(toFlowDto));
    const p = project(golden.realBalance, flows, J0, 30);
    const dto = toProjectionDto(p);
    expect(dto.points).toHaveLength(31);
    expect(dto.min).toEqual({ date: '2026-12-16', balanceMillimes: 2_000_000 });
    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
    const c = toComparisonDto(compareProjections(p, p));
    expect(c.endBalance.deltaMillimes).toBe(0);
  });
});

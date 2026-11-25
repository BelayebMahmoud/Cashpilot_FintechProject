import { type LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import {
  DEFAULT_ASSUMPTIONS,
  type Assumptions,
  type Flow,
  type ForecastData,
  type Projection,
  type ProjectionPoint,
  type Shortfall,
} from './types';

/**
 * Builds the baseline flows from real data.
 * - receivables: +remaining (never the full total: received payments are already in the real balance)
 * - payables: −amount of approved unpaid expenses, plus submitted ones when `includePendingExpenses`
 * - planned flows (already expanded into occurrences) and project milestones
 * - past-due flows are rolled to today (flagged overdue) or excluded, per `overduePolicy`
 */
export function buildBaselineFlows(data: ForecastData, assumptions: Assumptions, today: LocalDate): Flow[] {
  const flows: Flow[] = [];

  for (const r of data.receivables) {
    if (!r.remaining.isPositive()) continue;
    flows.push({ key: `invoice:${r.invoiceId}`, date: r.dueDate, amount: r.remaining, kind: 'RECEIVABLE', label: r.label });
  }
  for (const p of data.payables) {
    if (p.status === 'SUBMITTED' && !assumptions.includePendingExpenses) continue;
    flows.push({
      key: `expense:${p.expenseId}`,
      date: p.dueDate,
      amount: p.amount.negate(),
      kind: 'PAYABLE',
      label: p.label,
      pending: p.status === 'SUBMITTED',
    });
  }
  for (const pf of data.plannedFlows) {
    for (const date of pf.occurrences) {
      flows.push({
        key: `planned:${pf.id}:${date.toString()}`,
        date,
        amount: pf.direction === 'IN' ? pf.amount : pf.amount.negate(),
        kind: 'PLANNED',
        label: pf.label,
      });
    }
  }
  for (const m of data.milestones) {
    flows.push({ key: `milestone:${m.id}`, date: m.expectedDate, amount: m.amount, kind: 'MILESTONE', label: m.label });
  }

  return applyOverduePolicy(flows, assumptions, today).sort(byDateThenKey);
}

function applyOverduePolicy(flows: Flow[], a: Assumptions, today: LocalDate): Flow[] {
  return flows.flatMap((f) => {
    if (!f.date.isBefore(today)) return [f];
    if (a.overduePolicy === 'EXCLUDE') return [];
    return [{ ...f, date: today, overdue: true, originalDate: f.date }];
  });
}

export function byDateThenKey(a: Flow, b: Flow): number {
  return a.date.compare(b.date) || a.key.localeCompare(b.key);
}

/**
 * Projects the balance day by day from `from` to `from + horizon` inclusive
 * (31 points for 30 days):  balance(d) = real + Σ inflows(≤ d) − Σ outflows(≤ d).
 * Flows dated before `from` count on the first day; flows after the horizon are ignored.
 */
export function project(
  realBalance: Money,
  flows: readonly Flow[],
  from: LocalDate,
  horizon: number,
  assumptions: Assumptions = DEFAULT_ASSUMPTIONS,
): Projection {
  const points: ProjectionPoint[] = [];
  let balance = realBalance;
  let totalIn = Money.zero();
  let totalOut = Money.zero();

  for (let i = 0; i <= horizon; i++) {
    const day = from.addDays(i);
    const todays = flows.filter((f) => (i === 0 ? !f.date.isAfter(day) : f.date.equals(day)));
    const inflow = Money.sum(todays.filter((f) => f.amount.isPositive()).map((f) => f.amount));
    const outflow = Money.sum(todays.filter((f) => f.amount.isNegative()).map((f) => f.amount.negate()));
    balance = balance.add(inflow).subtract(outflow);
    totalIn = totalIn.add(inflow);
    totalOut = totalOut.add(outflow);
    points.push({ date: day, balance, inflow, outflow, flowKeys: todays.map((f) => f.key) });
  }

  const first = points[0]!;
  const min = points.reduce((m, p) => (p.balance.compare(m.balance) < 0 ? { date: p.date, balance: p.balance } : m), {
    date: first.date,
    balance: first.balance,
  });

  return {
    from,
    horizon,
    realBalance,
    points,
    endBalance: points[points.length - 1]!.balance,
    min,
    firstNegativeDate: points.find((p) => p.balance.isNegative())?.date ?? null,
    shortfalls: findShortfalls(points),
    totals: { in: totalIn, out: totalOut },
    assumptions: { ...assumptions },
  };
}

/** Consecutive days with a negative balance. */
export function findShortfalls(points: readonly ProjectionPoint[]): Shortfall[] {
  const result: Shortfall[] = [];
  let current = null as Shortfall | null;
  for (const p of points) {
    if (p.balance.isNegative()) {
      const prev: Shortfall | null = current;
      current = prev
        ? { from: prev.from, to: p.date, days: prev.days + 1, minBalance: Money.min(prev.minBalance, p.balance) }
        : { from: p.date, to: p.date, days: 1, minBalance: p.balance };
    } else if (current) {
      result.push(current);
      current = null;
    }
  }
  if (current) result.push(current);
  return result;
}

/** Days of cash before the first negative day; null when the balance stays ≥ 0 on the horizon. */
export function runwayDays(projection: Projection): number | null {
  return projection.firstNegativeDate ? projection.firstNegativeDate.diffDays(projection.from) : null;
}

export interface PointExplanation {
  date: LocalDate;
  realBalance: Money;
  realAsOf: LocalDate;
  expectedIn: Money;
  expectedOut: Money;
  balance: Money;
  flows: Flow[];
  assumptions: Assumptions;
}

/**
 * Explains one point: projected = real (at `from`) + receipts expected up to d − disbursements up to d.
 * Every number on the chart can be opened into this breakdown.
 */
export function explainPoint(projection: Projection, flows: readonly Flow[], date: LocalDate): PointExplanation {
  const upTo = flows.filter((f) => !f.date.isAfter(date) && !date.isAfter(projection.from.addDays(projection.horizon)));
  const expectedIn = Money.sum(upTo.filter((f) => f.amount.isPositive()).map((f) => f.amount));
  const expectedOut = Money.sum(upTo.filter((f) => f.amount.isNegative()).map((f) => f.amount.negate()));
  return {
    date,
    realBalance: projection.realBalance,
    realAsOf: projection.from,
    expectedIn,
    expectedOut,
    balance: projection.realBalance.add(expectedIn).subtract(expectedOut),
    flows: [...upTo].sort(byDateThenKey),
    assumptions: projection.assumptions,
  };
}

import { DomainError } from '../shared/errors';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { byDateThenKey, runwayDays } from './engine';
import { type Flow, type Projection } from './types';

/**
 * What-if adjustments. Plain JSON (millimes, ISO dates) so they can be stored in a
 * Scenario and edited by the client reducer. They only ever apply to a copy of the flows.
 */
export type Adjustment =
  | { type: 'DELAY_RECEIVABLE'; invoiceId: string; days: number }
  | { type: 'SHIFT_PAYABLE'; expenseId: string; days: number }
  | { type: 'ADD_INFLOW'; label: string; amountMillimes: number; date: string }
  | { type: 'ADD_OUTFLOW'; label: string; amountMillimes: number; date: string }
  | { type: 'EXCLUDE_FLOW'; flowKey: string };

export type AdjustmentType = Adjustment['type'];

function shift(flows: Flow[], key: string, days: number): Flow[] {
  if (!flows.some((f) => f.key === key)) {
    throw new DomainError('ADJUSTMENT_TARGET_NOT_FOUND', `No flow ${key}`, { key });
  }
  return flows.map((f) => (f.key === key ? { ...f, date: f.date.addDays(days), originalDate: f.originalDate ?? f.date } : f));
}

/** Returns a NEW array of flows with every adjustment applied in order; the input is never mutated. */
export function applyAdjustments(flows: readonly Flow[], adjustments: readonly Adjustment[]): Flow[] {
  let result: Flow[] = flows.map((f) => ({ ...f }));
  adjustments.forEach((adj, index) => {
    switch (adj.type) {
      case 'DELAY_RECEIVABLE':
        result = shift(result, `invoice:${adj.invoiceId}`, adj.days);
        break;
      case 'SHIFT_PAYABLE':
        result = shift(result, `expense:${adj.expenseId}`, adj.days);
        break;
      case 'ADD_INFLOW':
      case 'ADD_OUTFLOW': {
        const amount = Money.ofMillimes(adj.amountMillimes);
        if (!amount.isPositive()) throw new DomainError('INVALID_AMOUNT');
        result = [
          ...result,
          {
            key: `sim:${index}`,
            date: LocalDate.parse(adj.date),
            amount: adj.type === 'ADD_INFLOW' ? amount : amount.negate(),
            kind: 'ADJUSTMENT',
            label: adj.label.trim() || (adj.type === 'ADD_INFLOW' ? 'Rentrée simulée' : 'Dépense simulée'),
          },
        ];
        break;
      }
      case 'EXCLUDE_FLOW':
        if (!result.some((f) => f.key === adj.flowKey)) {
          throw new DomainError('ADJUSTMENT_TARGET_NOT_FOUND', `No flow ${adj.flowKey}`, { key: adj.flowKey });
        }
        result = result.filter((f) => f.key !== adj.flowKey);
        break;
    }
  });
  return result.sort(byDateThenKey);
}

export interface Comparison {
  min: { base: Projection['min']; sim: Projection['min']; delta: Money };
  firstNegativeDate: { base: LocalDate | null; sim: LocalDate | null };
  runwayDays: { base: number | null; sim: number | null };
  endBalance: { base: Money; sim: Money; delta: Money };
  shortfallDays: { base: number; sim: number };
}

/** Deltas between a baseline projection and a simulated one (same horizon). */
export function compareProjections(base: Projection, sim: Projection): Comparison {
  const days = (p: Projection) => p.shortfalls.reduce((s, x) => s + x.days, 0);
  return {
    min: { base: base.min, sim: sim.min, delta: sim.min.balance.subtract(base.min.balance) },
    firstNegativeDate: { base: base.firstNegativeDate, sim: sim.firstNegativeDate },
    runwayDays: { base: runwayDays(base), sim: runwayDays(sim) },
    endBalance: { base: base.endBalance, sim: sim.endBalance, delta: sim.endBalance.subtract(base.endBalance) },
    shortfallDays: { base: days(base), sim: days(sim) },
  };
}

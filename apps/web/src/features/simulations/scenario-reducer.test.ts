import { describe, expect, it } from 'vitest';
import { type FlowDto } from '@cashpilot/domain';
import { isComplete, scenarioReducer, simulate, type AdjustmentItem } from './scenario-reducer';

const delay: AdjustmentItem = { id: 'a', adjustment: { type: 'DELAY_RECEIVABLE', invoiceId: 'inv1', days: 20 } };

describe('scenarioReducer', () => {
  it('adds, updates, removes and resets immutably', () => {
    const s0: AdjustmentItem[] = [];
    const s1 = scenarioReducer(s0, { type: 'add', item: delay });
    expect(s1).toEqual([delay]);
    expect(s0).toEqual([]);
    const s2 = scenarioReducer(s1, { type: 'update', id: 'a', adjustment: { type: 'DELAY_RECEIVABLE', invoiceId: 'inv1', days: 30 } });
    expect(s2[0]!.adjustment).toMatchObject({ days: 30 });
    expect(s1[0]!.adjustment).toMatchObject({ days: 20 });
    expect(scenarioReducer(s2, { type: 'remove', id: 'a' })).toEqual([]);
    expect(scenarioReducer(s2, { type: 'reset', items: [] })).toEqual([]);
  });

  it('knows when an adjustment is complete', () => {
    expect(isComplete({ type: 'ADD_OUTFLOW', label: '', amountMillimes: 0, date: '2026-12-01' })).toBe(false);
    expect(isComplete({ type: 'ADD_OUTFLOW', label: '', amountMillimes: 1, date: '2026-12-01' })).toBe(true);
    expect(isComplete({ type: 'EXCLUDE_FLOW', flowKey: '' })).toBe(false);
  });
});

describe('client-side simulation (golden example)', () => {
  const baseFlows: FlowDto[] = [
    { key: 'invoice:inv1', date: '2026-12-11', amountMillimes: 3_000_000, kind: 'RECEIVABLE', label: 'FAC-1' },
    { key: 'expense:exp1', date: '2026-12-16', amountMillimes: -6_000_000, kind: 'PAYABLE', label: 'Licences' },
  ];
  const input = {
    realBalanceMillimes: 5_000_000,
    today: '2026-12-01',
    horizon: 30,
    assumptions: { overduePolicy: 'ROLL_TO_TODAY' as const, includePendingExpenses: true },
    baseFlows,
  };

  it('delaying the receivable by 20 days opens a shortfall 12-16 → 12-30 at −1 000 DT', () => {
    const r = simulate({ ...input, adjustments: [delay.adjustment] });
    expect(r.error).toBeNull();
    expect(r.base.firstNegativeDate).toBeNull();
    expect(r.sim.shortfalls).toEqual([{ from: '2026-12-16', to: '2026-12-30', minBalanceMillimes: -1_000_000, days: 15 }]);
    expect(r.comparison.endBalance.deltaMillimes).toBe(0);
  });

  it('reports an unknown target without crashing', () => {
    const r = simulate({ ...input, adjustments: [{ type: 'EXCLUDE_FLOW', flowKey: 'nope' }] });
    expect(r.error).toBe('ADJUSTMENT_TARGET_NOT_FOUND');
    expect(r.sim.endBalanceMillimes).toBe(r.base.endBalanceMillimes);
  });
});

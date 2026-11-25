import { describe, expect, it } from 'vitest';
import { unwrap } from '../src/shared/result';
import { DT, issueInvoice, makeWorld, submitExpense, TODAY } from './fixture';
import { type World } from './fixture';

/** The brief's defense scenario on real use cases. */
async function defenseWorld(): Promise<{ w: World; invoiceId: string; expenseId: string }> {
  const w = await makeWorld();
  const invoiceId = await issueInvoice(w, 3000, 10);
  const expenseId = await submitExpense(w, w.employee, 6000, 15);
  unwrap(await w.useCases.approveExpense.execute(w.owner, { id: expenseId }));
  return { w, invoiceId, expenseId };
}

const balanceOn = (points: { date: string; balanceMillimes: number }[], date: string) =>
  points.find((p) => p.date === date)!.balanceMillimes / 1000;

/** Deep snapshot of everything "real" (invoices, expenses, ledger). */
function realSnapshot(w: World) {
  return JSON.stringify({
    invoices: [...w.uow.state.invoices.values()].map((i) => i.snapshot()),
    expenses: [...w.uow.state.expenses.values()].map((e) => e.snapshot()),
    ledger: w.uow.state.movements.map((m) => m.snapshot()),
    planned: [...w.uow.state.plannedFlows.values()].map((f) => f.snapshot()),
  });
}

describe('Prévisions', () => {
  it('golden baseline through GetForecast', async () => {
    const { w } = await defenseWorld();
    const f = unwrap(await w.useCases.getForecast.execute(w.finance, { horizon: 30 }));
    const pts = f.projection.points;
    expect(pts).toHaveLength(31);
    expect(balanceOn(pts, '2026-12-10')).toBe(5000);
    expect(balanceOn(pts, '2026-12-11')).toBe(8000);
    expect(balanceOn(pts, '2026-12-16')).toBe(2000);
    expect(f.projection.firstNegativeDate).toBeNull();
    expect(f.assumptions).toEqual({ overduePolicy: 'ROLL_TO_TODAY', includePendingExpenses: true });
    expect(f.weeks.length).toBeGreaterThan(0);
  });

  it('forecast uses remaining only after partial payment', async () => {
    const { w, invoiceId } = await defenseWorld();
    unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId, amountMillimes: DT(1000), date: '2026-12-01', method: 'TRANSFER' }));
    const f = unwrap(await w.useCases.getForecast.execute(w.finance, { horizon: 30 }));
    expect(f.projection.realBalanceMillimes).toBe(DT(6000));
    expect(balanceOn(f.projection.points, '2026-12-11')).toBe(8000);
    expect(f.projection.endBalanceMillimes).toBe(DT(2000));
  });

  it('planned flows: MONTHLY recurrence feeds the forecast; finance only can write', async () => {
    const { w } = await defenseWorld();
    expect(
      await w.useCases.createPlannedFlow.execute(w.owner, { label: 'Loyer', direction: 'OUT', amountMillimes: DT(1000), expectedDate: '2026-12-05', recurrence: 'MONTHLY' }),
    ).toMatchObject({ code: 'FORBIDDEN' });
    const pf = unwrap(
      await w.useCases.createPlannedFlow.execute(w.finance, { label: 'Loyer', direction: 'OUT', amountMillimes: DT(1000), expectedDate: '2026-12-05', recurrence: 'MONTHLY' }),
    );
    const f = unwrap(await w.useCases.getForecast.execute(w.owner, { horizon: 90 }));
    const horizonEnd = f.projection.points.at(-1)!.date; // 2027-03-01 (J+90 inclusive)
    expect(
      f.flows.filter((x) => x.key.startsWith(`planned:${pf.id}`) && x.date <= horizonEnd).map((x) => x.date),
    ).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);
    // 5 000 + 3 000 − 6 000 − 3 × 1 000
    expect(f.projection.endBalanceMillimes).toBe(DT(-1000));
    unwrap(await w.useCases.cancelPlannedFlow.execute(w.finance, { id: pf.id }));
    const after = unwrap(await w.useCases.getForecast.execute(w.owner, { horizon: 90 }));
    expect(after.flows.some((x) => x.kind === 'PLANNED')).toBe(false);
    expect(unwrap(await w.useCases.listPlannedFlows.execute(w.owner))[0]).toMatchObject({ cancelled: true });
  });

  it('EMPLOYEE cannot read the forecast', async () => {
    const { w } = await defenseWorld();
    expect(await w.useCases.getForecast.execute(w.employee, { horizon: 30 })).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Simulation', () => {
  it('golden simulation: shortfall 12-16 → 12-30 at −1 000 DT', async () => {
    const { w, invoiceId } = await defenseWorld();
    const s = unwrap(
      await w.useCases.simulateScenario.execute(w.owner, { horizon: 30, adjustments: [{ type: 'DELAY_RECEIVABLE', invoiceId, days: 20 }] }),
    );
    expect(balanceOn(s.sim.points, '2026-12-16')).toBe(-1000);
    expect(balanceOn(s.sim.points, '2026-12-30')).toBe(-1000);
    expect(balanceOn(s.sim.points, '2026-12-31')).toBe(2000);
    expect(s.sim.shortfalls).toEqual([{ from: '2026-12-16', to: '2026-12-30', minBalanceMillimes: -DT(1000), days: 15 }]);
    expect(s.comparison.firstNegativeDate).toEqual({ base: null, sim: '2026-12-16' });
    expect(s.comparison.endBalance.deltaMillimes).toBe(0);
    expect(s.base.firstNegativeDate).toBeNull();
  });

  it('simulate+save leaves invoices/ledger snapshots deep-equal', async () => {
    const { w, invoiceId, expenseId } = await defenseWorld();
    const before = realSnapshot(w);
    const adjustments = [
      { type: 'DELAY_RECEIVABLE' as const, invoiceId, days: 20 },
      { type: 'SHIFT_PAYABLE' as const, expenseId, days: 3 },
      { type: 'ADD_OUTFLOW' as const, label: 'Recrutement', amountMillimes: DT(500), date: '2026-12-20' },
      { type: 'EXCLUDE_FLOW' as const, flowKey: `invoice:${invoiceId}` },
    ];
    unwrap(await w.useCases.simulateScenario.execute(w.owner, { horizon: 30, adjustments }));
    const saved = unwrap(await w.useCases.saveScenario.execute(w.finance, { name: 'Retard client', horizon: 30, adjustments }));
    unwrap(await w.useCases.getScenario.execute(w.owner, { id: saved.id }));
    unwrap(await w.useCases.duplicateScenario.execute(w.owner, { id: saved.id }));
    expect(realSnapshot(w)).toEqual(before);
    expect(unwrap(await w.useCases.listScenarios.execute(w.owner))).toHaveLength(2);
  });

  it('unknown target → ADJUSTMENT_TARGET_NOT_FOUND (simulate and save)', async () => {
    const { w } = await defenseWorld();
    const adjustments = [{ type: 'DELAY_RECEIVABLE' as const, invoiceId: 'nope', days: 3 }];
    expect(await w.useCases.simulateScenario.execute(w.owner, { horizon: 30, adjustments })).toMatchObject({ code: 'ADJUSTMENT_TARGET_NOT_FOUND' });
    expect(await w.useCases.saveScenario.execute(w.owner, { name: 'x y', horizon: 30, adjustments })).toMatchObject({
      code: 'ADJUSTMENT_TARGET_NOT_FOUND',
    });
    expect(w.uow.state.scenarios.size).toBe(0);
  });

  it('a saved scenario whose target disappeared reports stale adjustments', async () => {
    const { w, invoiceId } = await defenseWorld();
    const saved = unwrap(
      await w.useCases.saveScenario.execute(w.owner, { name: 'Retard', horizon: 30, adjustments: [{ type: 'DELAY_RECEIVABLE', invoiceId, days: 20 }] }),
    );
    unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId, amountMillimes: DT(3000), date: '2026-12-01', method: 'CASH' }));
    const r = unwrap(await w.useCases.getScenario.execute(w.owner, { id: saved.id }));
    expect(r.staleAdjustments).toEqual([0]);
  });

  it('scenarios are tenant-scoped and refused to employees; delete works', async () => {
    const { w } = await defenseWorld();
    const s = unwrap(await w.useCases.saveScenario.execute(w.owner, { name: 'Base', horizon: 60, adjustments: [] }));
    expect(await w.useCases.getScenario.execute(w.outsider, { id: s.id })).toMatchObject({ code: 'NOT_FOUND' });
    expect(await w.useCases.listScenarios.execute(w.employee)).toMatchObject({ code: 'FORBIDDEN' });
    unwrap(await w.useCases.deleteScenario.execute(w.owner, { id: s.id }));
    expect(w.uow.state.scenarios.size).toBe(0);
  });
});

describe('Alertes et dashboard', () => {
  it('derives the four alerts with role filtering and dismissals', async () => {
    const { w, expenseId } = await defenseWorld();
    void expenseId;
    const soonId = await issueInvoice(w, 100, 7);
    await submitExpense(w, w.employee, 9000, 20); // pending → negative forecast on 12-21
    w.clockFixed.set(TODAY.addDays(11)); // 12-12: FAC-0001 (due 12-11) overdue by 1 day

    const ownerAlerts = unwrap(await w.useCases.getAlerts.execute(w.owner));
    expect(ownerAlerts.map((a) => a.kind).sort()).toEqual(['EXPENSE_TO_APPROVE', 'INVOICE_OVERDUE', 'INVOICE_OVERDUE', 'NEGATIVE_FORECAST']);
    const financeAlerts = unwrap(await w.useCases.getAlerts.execute(w.finance));
    expect(financeAlerts.some((a) => a.kind === 'EXPENSE_TO_APPROVE')).toBe(false);
    expect(unwrap(await w.useCases.getAlerts.execute(w.employee))).toEqual([]);

    const overdue = ownerAlerts.find((a) => a.kind === 'INVOICE_OVERDUE' && a.entityId === soonId)!;
    expect(overdue.days).toBe(4);
    unwrap(await w.useCases.dismissAlert.execute(w.owner, { key: overdue.key }));
    expect(unwrap(await w.useCases.getAlerts.execute(w.owner)).some((a) => a.key === overdue.key)).toBe(false);
    // dismissals are per user
    expect(unwrap(await w.useCases.getAlerts.execute(w.finance)).some((a) => a.key === overdue.key)).toBe(true);
  });

  it('dashboard KPIs from a known dataset', async () => {
    const { w, invoiceId } = await defenseWorld();
    unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId, amountMillimes: DT(1000), date: '2026-12-01', method: 'TRANSFER' }));
    await submitExpense(w, w.employee, 100, 5);
    const d = unwrap(await w.useCases.getDashboard.execute(w.owner));
    expect(d.kpis).toMatchObject({
      realBalanceMillimes: DT(6000),
      forecast30Millimes: DT(6000 + 2000 - 6000 - 100),
      receivableMillimes: DT(2000),
      overdueReceivableMillimes: 0,
      payableApprovedMillimes: DT(6000),
      payablePendingMillimes: DT(100),
      pendingExpenses: 1,
    });
    expect(d.runway).toEqual({ days: null, firstNegativeDate: null });
    expect(d.pendingApprovals).toHaveLength(1);
    expect(d.projection90.points).toHaveLength(91);
    expect(unwrap(await w.useCases.getDashboard.execute(w.finance)).pendingApprovals).toEqual([]);
    expect(await w.useCases.getDashboard.execute(w.employee)).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Projets (secteur agence digitale)', () => {
  it('milestones feed the forecast until invoiced; profitability = invoiced HT − expenses', async () => {
    const w = await makeWorld();
    const { projectId } = unwrap(
      await w.useCases.createProject.execute(w.finance, { clientId: w.clientId, name: 'Refonte site', budgetMillimes: DT(10000), startDate: '2026-12-01' }),
    );
    unwrap(await w.useCases.addMilestone.execute(w.finance, { projectId, label: 'Acompte', amountMillimes: DT(3000), expectedDate: '2026-12-10' }));
    let f = unwrap(await w.useCases.getForecast.execute(w.owner, { horizon: 30 }));
    expect(f.flows.filter((x) => x.kind === 'MILESTONE').map((x) => x.amountMillimes)).toEqual([DT(3000)]);

    const project = unwrap(await w.useCases.getProject.execute(w.owner, { id: projectId }));
    const milestoneId = project.milestones[0]!.id;
    const { invoiceId } = unwrap(
      await w.useCases.createInvoiceDraft.execute(w.finance, {
        clientId: w.clientId,
        projectId,
        milestoneId,
        issueDate: '2026-12-01',
        dueDate: '2026-12-10',
        lines: [{ description: 'Acompte', qtyHundredths: 100, unitMillimes: DT(3000), vatRateBp: 0 }],
      }),
    );
    unwrap(await w.useCases.validateInvoice.execute(w.finance, { id: invoiceId }));
    f = unwrap(await w.useCases.getForecast.execute(w.owner, { horizon: 30 }));
    expect(f.flows.filter((x) => x.kind === 'MILESTONE')).toEqual([]);
    expect(f.flows.filter((x) => x.kind === 'RECEIVABLE')).toHaveLength(1);

    const exp = unwrap(
      await w.useCases.createExpense.execute(w.employee, {
        label: 'Freelance',
        category: 'SUBCONTRACTING',
        amountMillimes: DT(1000),
        expenseDate: '2026-12-01',
        projectId,
        receipt: { bytes: new Uint8Array([1]), fileName: 'f.png', mimeType: 'image/png' },
        submit: true,
      }),
    );
    unwrap(await w.useCases.approveExpense.execute(w.owner, { id: exp.id }));
    const detail = unwrap(await w.useCases.getProject.execute(w.owner, { id: projectId }));
    expect(detail).toMatchObject({ invoicedHTMillimes: DT(3000), expensesMillimes: DT(1000), marginMillimes: DT(2000), marginRateBp: 6667 });
    expect(unwrap(await w.useCases.listProjects.execute(w.owner))).toHaveLength(1);
    expect(await w.useCases.createProject.execute(w.owner, { clientId: w.clientId, name: 'X', budgetMillimes: 0, startDate: '2026-12-01' })).toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('audit', () => {
  it('every mutation writes an audit entry readable by owner/finance only', async () => {
    const { w } = await defenseWorld();
    const page = unwrap(await w.useCases.listAuditEntries.execute(w.owner, {}));
    expect(page.total).toBeGreaterThan(5);
    expect(page.items[0]!.at >= page.items.at(-1)!.at).toBe(true);
    expect(unwrap(await w.useCases.listAuditEntries.execute(w.owner, { action: 'expense' })).items.every((e) => e.action.startsWith('expense'))).toBe(true);
    expect(await w.useCases.listAuditEntries.execute(w.employee, {})).toMatchObject({ code: 'FORBIDDEN' });
  });
});

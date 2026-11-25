import { describe, expect, it } from 'vitest';
import { buildBaselineFlows, project } from '../forecast/engine';
import { DEFAULT_ASSUMPTIONS } from '../forecast/types';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { computeAlerts, type AlertInputs } from './alerts';

const d = LocalDate.parse;
const today = d('2026-12-01');

const inv = (id: string, due: string, remaining = 1000) => ({ id, label: id, remaining: Money.dinars(remaining), dueDate: d(due) });

const empty: AlertInputs = { openInvoices: [], submittedExpenses: [], projection90: null };

describe('alerts', () => {
  it('overdue by 1 day → danger; due today and in 7 days → due soon; in 8 days → nothing', () => {
    const alerts = computeAlerts(
      { ...empty, openInvoices: [inv('late', '2026-11-30'), inv('today', '2026-12-01'), inv('in7', '2026-12-08'), inv('in8', '2026-12-09')] },
      today,
      'FINANCE_MANAGER',
    );
    expect(alerts.map((a) => [a.key, a.severity, a.days])).toEqual([
      ['INVOICE_OVERDUE:late', 'danger', 1],
      ['INVOICE_DUE_SOON:today', 'warning', 0],
      ['INVOICE_DUE_SOON:in7', 'warning', 7],
    ]);
  });

  it('ignores invoices with nothing left to pay', () => {
    expect(computeAlerts({ ...empty, openInvoices: [inv('paid', '2026-11-01', 0)] }, today, 'OWNER')).toEqual([]);
  });

  it('role filtering: due-soon is finance only, expenses to approve are owner only, employee gets nothing', () => {
    const inputs: AlertInputs = {
      ...empty,
      openInvoices: [inv('late', '2026-11-30'), inv('soon', '2026-12-03')],
      submittedExpenses: [{ id: 'e1', label: 'Licences', amount: Money.dinars(10), submittedAt: today, expenseDate: today }],
    };
    expect(computeAlerts(inputs, today, 'OWNER').map((a) => a.kind)).toEqual(['INVOICE_OVERDUE', 'EXPENSE_TO_APPROVE']);
    expect(computeAlerts(inputs, today, 'FINANCE_MANAGER').map((a) => a.kind)).toEqual(['INVOICE_OVERDUE', 'INVOICE_DUE_SOON']);
    expect(computeAlerts(inputs, today, 'EMPLOYEE')).toEqual([]);
  });

  it('negative forecast within 90 days → danger with date and min balance', () => {
    const data = {
      realBalance: Money.dinars(100),
      receivables: [],
      payables: [{ expenseId: 'x', label: 'Loyer', amount: Money.dinars(300), dueDate: d('2026-12-20'), status: 'APPROVED' as const }],
      plannedFlows: [],
      milestones: [],
    };
    const p = project(data.realBalance, buildBaselineFlows(data, DEFAULT_ASSUMPTIONS, today), today, 90);
    const [alert] = computeAlerts({ ...empty, projection90: p, negativeCause: 'Loyer' }, today, 'OWNER');
    expect(alert).toMatchObject({ kind: 'NEGATIVE_FORECAST', severity: 'danger', label: 'Loyer', days: 19 });
    expect(alert!.amount.millimes).toBe(-200_000);
    expect(alert!.date.toString()).toBe('2026-12-20');
  });
});

import { type Role } from '../access/policy';
import { type Projection } from '../forecast/types';
import { type LocalDate } from '../shared/local-date';
import { type Money } from '../shared/money';

export type AlertKind = 'INVOICE_OVERDUE' | 'INVOICE_DUE_SOON' | 'EXPENSE_TO_APPROVE' | 'NEGATIVE_FORECAST';
export type AlertSeverity = 'danger' | 'warning';

export interface Alert {
  /** Stable key used to dismiss the alert, e.g. `INVOICE_OVERDUE:<invoiceId>`. */
  key: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Id of the related entity (invoice, expense) — null for the forecast alert. */
  entityId: string | null;
  label: string;
  amount: Money;
  date: LocalDate;
  /** Days overdue / days until due, when relevant. */
  days?: number;
}

export interface AlertInputs {
  openInvoices: { id: string; label: string; remaining: Money; dueDate: LocalDate }[];
  submittedExpenses: { id: string; label: string; amount: Money; submittedAt: LocalDate | null; expenseDate: LocalDate }[];
  projection90: Projection | null;
  /** Label of the flow that makes the balance go negative (biggest outflow that day). */
  negativeCause?: string | null;
}

const WHO: Record<AlertKind, readonly Role[]> = {
  INVOICE_OVERDUE: ['OWNER', 'FINANCE_MANAGER'],
  INVOICE_DUE_SOON: ['FINANCE_MANAGER'],
  EXPENSE_TO_APPROVE: ['OWNER'],
  NEGATIVE_FORECAST: ['OWNER', 'FINANCE_MANAGER'],
};

export const DUE_SOON_DAYS = 7;

/**
 * The four derived alert rules (nothing is stored except dismissals):
 * - overdue invoice: remaining > 0 and dueDate < today (danger)
 * - due soon: remaining > 0 and today ≤ dueDate ≤ today + 7 (warning)
 * - expense to approve: SUBMITTED (warning)
 * - negative forecast: first negative date within 90 days (danger)
 */
export function computeAlerts(inputs: AlertInputs, today: LocalDate, role: Role): Alert[] {
  const alerts: Alert[] = [];
  for (const inv of inputs.openInvoices) {
    if (!inv.remaining.isPositive()) continue;
    if (inv.dueDate.isBefore(today)) {
      alerts.push({
        key: `INVOICE_OVERDUE:${inv.id}`,
        kind: 'INVOICE_OVERDUE',
        severity: 'danger',
        entityId: inv.id,
        label: inv.label,
        amount: inv.remaining,
        date: inv.dueDate,
        days: today.diffDays(inv.dueDate),
      });
    } else if (!inv.dueDate.isAfter(today.addDays(DUE_SOON_DAYS))) {
      alerts.push({
        key: `INVOICE_DUE_SOON:${inv.id}`,
        kind: 'INVOICE_DUE_SOON',
        severity: 'warning',
        entityId: inv.id,
        label: inv.label,
        amount: inv.remaining,
        date: inv.dueDate,
        days: inv.dueDate.diffDays(today),
      });
    }
  }
  for (const e of inputs.submittedExpenses) {
    alerts.push({
      key: `EXPENSE_TO_APPROVE:${e.id}`,
      kind: 'EXPENSE_TO_APPROVE',
      severity: 'warning',
      entityId: e.id,
      label: e.label,
      amount: e.amount,
      date: e.submittedAt ?? e.expenseDate,
    });
  }
  const p = inputs.projection90;
  if (p?.firstNegativeDate) {
    alerts.push({
      key: `NEGATIVE_FORECAST:${p.firstNegativeDate.toString()}`,
      kind: 'NEGATIVE_FORECAST',
      severity: 'danger',
      entityId: null,
      label: inputs.negativeCause ?? 'Solde prévisionnel négatif',
      amount: p.min.balance,
      date: p.firstNegativeDate,
      days: p.firstNegativeDate.diffDays(today),
    });
  }
  const severityRank = { danger: 0, warning: 1 } as const;
  return alerts
    .filter((a) => WHO[a.kind].includes(role))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.date.compare(b.date));
}

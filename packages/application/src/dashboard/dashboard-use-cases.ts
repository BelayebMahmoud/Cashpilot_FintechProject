import {
  assertCan,
  can,
  computeAlerts,
  DEFAULT_ASSUMPTIONS,
  Money,
  runwayDays,
  toProjectionDto,
  type AlertKind,
  type AlertSeverity,
  type Flow,
  type Projection,
  type ProjectionDto,
} from '@cashpilot/domain';
import { type Repositories } from '../ports';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, ok, type Result } from '../shared/result';
import { loadBaseline, projectBaseline } from '../forecast/forecast-use-cases';
import { toInvoiceSummary, type InvoiceSummaryDto } from '../invoices/invoice-dto';
import { toExpenseDto, type ExpenseDto } from '../expenses/expense-dto';

export interface AlertDto {
  key: string;
  kind: AlertKind;
  severity: AlertSeverity;
  entityId: string | null;
  label: string;
  amountMillimes: number;
  date: string;
  days: number | null;
}

/** The flow that pushes the balance below zero: biggest outflow on the first negative day. */
function negativeCause(p: Projection, flows: Flow[]): string | null {
  if (!p.firstNegativeDate) return null;
  const day = p.points.find((pt) => pt.date.equals(p.firstNegativeDate!));
  const candidates = flows.filter((f) => day?.flowKeys.includes(f.key) && f.amount.isNegative());
  candidates.sort((a, b) => a.amount.compare(b.amount));
  return candidates[0]?.label ?? null;
}

async function computeAlertsFor(deps: Deps, r: Repositories, actor: Actor, projection90: Projection, flows: Flow[]): Promise<AlertDto[]> {
  const today = deps.clock.today();
  const [invoices, clients, submitted, dismissed] = await Promise.all([
    r.invoices.list(actor.companyId, { statuses: ['ISSUED'] }),
    r.parties.list(actor.companyId, { kind: 'CLIENT', includeArchived: true }),
    r.expenses.list(actor.companyId, { statuses: ['SUBMITTED'] }),
    r.alertDismissals.keys(actor.companyId, actor.userId),
  ]);
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const alerts = computeAlerts(
    {
      openInvoices: invoices.map((i) => ({
        id: i.id,
        label: `${i.number} · ${names.get(i.clientId) ?? '—'}`,
        remaining: i.remaining(),
        dueDate: i.dueDate,
      })),
      submittedExpenses: submitted.map((e) => {
        const s = e.snapshot();
        return { id: e.id, label: e.label, amount: e.amount, submittedAt: s.submittedAt, expenseDate: s.expenseDate };
      }),
      projection90,
      negativeCause: negativeCause(projection90, flows),
    },
    today,
    actor.role,
  );
  return alerts
    .filter((a) => !dismissed.has(a.key))
    .map((a) => ({
      key: a.key,
      kind: a.kind,
      severity: a.severity,
      entityId: a.entityId,
      label: a.label,
      amountMillimes: a.amount.millimes,
      date: a.date.toString(),
      days: a.days ?? null,
    }));
}

/** The four derived alert rules, filtered by role, minus the ones this user dismissed. */
export class GetAlerts {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor): Promise<Result<AlertDto[]>> {
    return attempt(async () => {
      if (!can(actor, 'alerts.read')) return ok([]);
      const baseline = await loadBaseline(this.deps, actor.companyId, DEFAULT_ASSUMPTIONS);
      const p90 = projectBaseline(baseline, 90);
      return ok(await this.deps.uow.read((r) => computeAlertsFor(this.deps, r, actor, p90, baseline.flows)));
    });
  }
}

export class DismissAlert {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { key: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'alerts.read');
        await tx.alertDismissals.dismiss(actor.companyId, actor.userId, input.key.slice(0, 200));
        return ok(undefined);
      }),
    );
  }
}

export interface DashboardDto {
  today: string;
  kpis: {
    realBalanceMillimes: number;
    forecast30Millimes: number;
    lowest90: { date: string; balanceMillimes: number };
    receivableMillimes: number;
    overdueReceivableMillimes: number;
    payableApprovedMillimes: number;
    payablePendingMillimes: number;
    pendingExpenses: number;
  };
  runway: { days: number | null; firstNegativeDate: string | null };
  projection90: ProjectionDto;
  overdueInvoices: InvoiceSummaryDto[];
  pendingApprovals: ExpenseDto[];
  alerts: AlertDto[];
}

export class GetDashboard {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor): Promise<Result<DashboardDto>> {
    const today = this.deps.clock.today();
    return attempt(async () => {
      assertCan(actor, 'dashboard.read');
      const baseline = await loadBaseline(this.deps, actor.companyId, DEFAULT_ASSUMPTIONS);
      const p90 = projectBaseline(baseline, 90);
      return this.deps.uow.read(async (r) => {
        const [invoices, clients, openExpenses, alerts] = await Promise.all([
          r.invoices.list(actor.companyId, { statuses: ['ISSUED'] }),
          r.parties.list(actor.companyId, { kind: 'CLIENT', includeArchived: true }),
          r.expenses.list(actor.companyId, { statuses: ['SUBMITTED', 'APPROVED'] }),
          computeAlertsFor(this.deps, r, actor, p90, baseline.flows),
        ]);
        const names = new Map(clients.map((c) => [c.id, c.name]));
        const submitted = openExpenses.filter((e) => e.status === 'SUBMITTED');
        const approved = openExpenses.filter((e) => e.status === 'APPROVED');
        const userNames = await r.users.namesByIds(submitted.map((e) => e.submittedById));
        const overdue = invoices.filter((i) => i.isOverdue(today));
        const point30 = p90.points[30]!;
        return ok({
          today: today.toString(),
          kpis: {
            realBalanceMillimes: baseline.realBalance.millimes,
            forecast30Millimes: point30.balance.millimes,
            lowest90: { date: p90.min.date.toString(), balanceMillimes: p90.min.balance.millimes },
            receivableMillimes: Money.sum(invoices.map((i) => i.remaining())).millimes,
            overdueReceivableMillimes: Money.sum(overdue.map((i) => i.remaining())).millimes,
            payableApprovedMillimes: Money.sum(approved.map((e) => e.amount)).millimes,
            payablePendingMillimes: Money.sum(submitted.map((e) => e.amount)).millimes,
            pendingExpenses: submitted.length,
          },
          runway: { days: runwayDays(p90), firstNegativeDate: p90.firstNegativeDate?.toString() ?? null },
          projection90: toProjectionDto(p90),
          overdueInvoices: overdue
            .map((i) => toInvoiceSummary(i, names.get(i.clientId) ?? '—', today))
            .sort((a, b) => b.daysOverdue - a.daysOverdue)
            .slice(0, 5),
          pendingApprovals: can(actor, 'expense.approve')
            ? submitted.slice(0, 5).map((e) => toExpenseDto(e, userNames))
            : [],
          alerts,
        });
      });
    });
  }
}

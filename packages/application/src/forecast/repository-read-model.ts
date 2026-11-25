import { type ForecastData, type LocalDate } from '@cashpilot/domain';
import { type ForecastReadModel, type UnitOfWork } from '../ports';

/**
 * ForecastReadModel built on the repository ports. Used by the in-memory mode and tests;
 * the Prisma adapter (infra) answers the same questions with a few aggregated queries.
 */
export class RepositoryForecastReadModel implements ForecastReadModel {
  constructor(private readonly uow: UnitOfWork) {}

  load(companyId: string, today: LocalDate, until: LocalDate): Promise<ForecastData> {
    return this.uow.read(async (r) => {
      const [realBalance, invoices, clients, expenses, planned, projects] = await Promise.all([
        r.ledger.balanceAt(companyId, today),
        r.invoices.list(companyId, { statuses: ['ISSUED'] }),
        r.parties.list(companyId, { kind: 'CLIENT', includeArchived: true }),
        r.expenses.list(companyId, { statuses: ['APPROVED', 'SUBMITTED'] }),
        r.plannedFlows.list(companyId),
        r.projects.list(companyId),
      ]);
      const names = new Map(clients.map((c) => [c.id, c.name]));
      return {
        realBalance,
        receivables: invoices
          .filter((i) => i.remaining().isPositive())
          .map((i) => ({
            invoiceId: i.id,
            label: `${i.number} · ${names.get(i.clientId) ?? '—'}`,
            remaining: i.remaining(),
            dueDate: i.dueDate,
          })),
        payables: expenses.map((e) => ({
          expenseId: e.id,
          label: e.label,
          amount: e.amount,
          dueDate: e.effectiveDueDate(),
          status: e.status as 'APPROVED' | 'SUBMITTED',
        })),
        plannedFlows: planned.map((f) => ({
          id: f.id,
          label: f.label,
          direction: f.direction,
          amount: f.amount,
          occurrences: f.occurrencesBetween(today, until),
        })),
        milestones: projects.flatMap((p) =>
          p.pendingMilestones().map((m) => ({ id: m.id, label: `${p.name} — ${m.label}`, amount: m.amount, expectedDate: m.expectedDate })),
        ),
      } satisfies ForecastData;
    });
  }
}

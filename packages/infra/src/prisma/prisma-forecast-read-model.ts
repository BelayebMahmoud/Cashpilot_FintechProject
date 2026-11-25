import { type ForecastReadModel } from '@cashpilot/application';
import { type ForecastData, type LocalDate } from '@cashpilot/domain';
import { type PrismaClient } from '@cashpilot/db';
import { fromDbDate, toDbDate, toMoney } from './mappers';
import { PrismaLedgerRepository } from './repositories/ledger-audit';
import { plannedFlowToDomain } from './repositories/operations-repositories';

/**
 * Forecast inputs in a handful of aggregated queries:
 * real balance, open receivables (total − net payments, computed in SQL), open payables,
 * active planned flows (expanded by the domain) and pending project milestones.
 */
export class PrismaForecastReadModel implements ForecastReadModel {
  constructor(private readonly prisma: PrismaClient) {}

  async load(companyId: string, today: LocalDate, until: LocalDate): Promise<ForecastData> {
    const [realBalance, receivables, payables, planned, milestones] = await Promise.all([
      new PrismaLedgerRepository(this.prisma).balanceAt(companyId, today),
      this.prisma.$queryRaw<{ id: string; number: string | null; client: string; dueDate: Date; remaining: bigint }[]>`
        SELECT i."id", i."number", p."name" AS client, i."dueDate",
               (i."totalMillimes" - COALESCE(SUM(CASE WHEN pay."reversesId" IS NULL THEN pay."amountMillimes" ELSE -pay."amountMillimes" END), 0))::bigint AS remaining
        FROM "Invoice" i
        JOIN "Party" p ON p."id" = i."clientId"
        LEFT JOIN "Payment" pay ON pay."invoiceId" = i."id"
        WHERE i."companyId" = ${companyId} AND i."status" = 'ISSUED'
        GROUP BY i."id", p."name"
        HAVING i."totalMillimes" - COALESCE(SUM(CASE WHEN pay."reversesId" IS NULL THEN pay."amountMillimes" ELSE -pay."amountMillimes" END), 0) > 0`,
      this.prisma.expense.findMany({
        where: { companyId, status: { in: ['APPROVED', 'SUBMITTED'] } },
        select: { id: true, label: true, amountMillimes: true, dueDate: true, expenseDate: true, status: true },
      }),
      this.prisma.plannedFlow.findMany({ where: { companyId, cancelled: false } }),
      this.prisma.milestone.findMany({
        where: { invoiceId: null, project: { companyId, status: 'ACTIVE' }, expectedDate: { lte: toDbDate(until) } },
        include: { project: { select: { name: true } } },
      }),
    ]);

    return {
      realBalance,
      receivables: receivables.map((r) => ({
        invoiceId: r.id,
        label: `${r.number} · ${r.client}`,
        remaining: toMoney(r.remaining),
        dueDate: fromDbDate(r.dueDate),
      })),
      payables: payables.map((e) => ({
        expenseId: e.id,
        label: e.label,
        amount: toMoney(e.amountMillimes),
        dueDate: fromDbDate(e.dueDate ?? e.expenseDate),
        status: e.status as 'APPROVED' | 'SUBMITTED',
      })),
      plannedFlows: planned.map((row) => {
        const f = plannedFlowToDomain(row);
        return { id: f.id, label: f.label, direction: f.direction, amount: f.amount, occurrences: f.occurrencesBetween(today, until) };
      }),
      milestones: milestones.map((m) => ({
        id: m.id,
        label: `${m.project.name} — ${m.label}`,
        amount: toMoney(m.amountMillimes),
        expectedDate: fromDbDate(m.expectedDate),
      })),
    };
  }
}

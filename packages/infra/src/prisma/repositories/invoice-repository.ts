import { type InvoiceFilter, type InvoiceRepository } from '@cashpilot/application';
import { Invoice, Payment } from '@cashpilot/domain';
import { type Prisma, type PrismaTx } from '@cashpilot/db';
import { fromBigInt, fromDbDate, toBigInt, toDbDate, toMoney } from '../mappers';

const include = {
  lines: { orderBy: { position: 'asc' } },
  payments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.InvoiceInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof include }>;

function toDomain(r: InvoiceRow): Invoice {
  return Invoice.restore(r.id, {
    companyId: r.companyId,
    clientId: r.clientId,
    projectId: r.projectId,
    number: r.number,
    status: r.status,
    issueDate: fromDbDate(r.issueDate),
    dueDate: fromDbDate(r.dueDate),
    stampDuty: toMoney(r.stampDutyMillimes),
    notes: r.notes,
    cancelReason: r.cancelReason,
    lines: r.lines.map((l) => ({
      id: l.id,
      description: l.description,
      qtyHundredths: l.qtyHundredths,
      unitMillimes: fromBigInt(l.unitMillimes),
      vatRateBp: l.vatRateBp,
    })),
    payments: r.payments.map((p) =>
      Payment.restore(p.id, {
        invoiceId: p.invoiceId,
        amount: toMoney(p.amountMillimes),
        date: fromDbDate(p.date),
        method: p.method,
        reversesId: p.reversesId,
        reason: p.reason,
        createdById: p.createdById,
      }),
    ),
  });
}

export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(
    private readonly db: PrismaTx,
    private readonly inTransaction: boolean,
  ) {}

  async byId(companyId: string, id: string) {
    if (this.inTransaction) {
      // Row lock: concurrent payments on the same invoice are serialised (no double spend of "remaining").
      await this.db.$queryRaw`SELECT 1 FROM "Invoice" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    }
    const r = await this.db.invoice.findFirst({ where: { id, companyId }, include });
    return r ? toDomain(r) : null;
  }

  async list(companyId: string, f: InvoiceFilter = {}) {
    const rows = await this.db.invoice.findMany({
      where: {
        companyId,
        ...(f.statuses ? { status: { in: f.statuses } } : {}),
        ...(f.clientId ? { clientId: f.clientId } : {}),
        ...(f.projectId ? { projectId: f.projectId } : {}),
      },
      include,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toDomain);
  }

  async save(invoice: Invoice) {
    const s = invoice.snapshot();
    const data = {
      companyId: s.companyId,
      clientId: s.clientId,
      projectId: s.projectId,
      number: s.number,
      status: s.status,
      issueDate: toDbDate(s.issueDate),
      dueDate: toDbDate(s.dueDate),
      totalMillimes: toBigInt(invoice.total()),
      stampDutyMillimes: toBigInt(s.stampDuty),
      notes: s.notes,
      cancelReason: s.cancelReason,
    };
    await this.db.invoice.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
    if (s.status === 'DRAFT') {
      // Lines can only change while DRAFT; replace them wholesale.
      await this.db.invoiceLine.deleteMany({ where: { invoiceId: s.id } });
      await this.db.invoiceLine.createMany({
        data: s.lines.map((l, position) => ({
          id: l.id,
          invoiceId: s.id,
          position,
          description: l.description,
          qtyHundredths: l.qtyHundredths,
          unitMillimes: toBigInt(l.unitMillimes),
          vatRateBp: l.vatRateBp,
        })),
      });
    }
    // Payments are append-only: insert the new ones, never update existing rows.
    if (s.payments.length > 0) {
      await this.db.payment.createMany({
        data: s.payments.map((p) => ({
          id: p.id,
          companyId: s.companyId,
          invoiceId: s.id,
          amountMillimes: toBigInt(p.amount),
          date: toDbDate(p.date),
          method: p.method,
          reversesId: p.reversesId,
          reason: p.reason,
          createdById: p.createdById,
        })),
        skipDuplicates: true,
      });
    }
  }

  async delete(companyId: string, id: string) {
    await this.db.invoiceLine.deleteMany({ where: { invoiceId: id, invoice: { companyId, status: 'DRAFT' } } });
    await this.db.invoice.deleteMany({ where: { id, companyId, status: 'DRAFT' } });
  }

  /** Atomic increment (row-locked by ON CONFLICT): two parallel validations get 1 and 2. */
  async nextNumber(companyId: string, year: number) {
    const rows = await this.db.$queryRaw<{ value: number }[]>`
      INSERT INTO "InvoiceCounter" ("companyId", "year", "value") VALUES (${companyId}, ${year}, 1)
      ON CONFLICT ("companyId", "year") DO UPDATE SET "value" = "InvoiceCounter"."value" + 1
      RETURNING "value"`;
    return Number(rows[0]!.value);
  }
}

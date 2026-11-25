import {
  type AuditEntryView,
  type AuditFilter,
  type AuditInput,
  type AuditLog,
  type IdGenerator,
  type LedgerFilter,
  type LedgerRepository,
  type LedgerRow,
} from '@cashpilot/application';
import { CashMovement, DomainError, type LocalDate, type Money } from '@cashpilot/domain';
import { Prisma, type PrismaTx } from '@cashpilot/db';
import { fromDbDate, toBigInt, toDbDate, toJson, toMoney } from '../mappers';

interface MovementSql {
  id: string;
  companyId: string;
  direction: 'IN' | 'OUT';
  amountMillimes: bigint;
  date: Date;
  label: string;
  sourceType: CashMovement['sourceType'];
  sourceId: string;
  documentId: string | null;
  reason: string | null;
  createdById: string;
}

function movementToDomain(r: MovementSql): CashMovement {
  return CashMovement.restore(r.id, {
    companyId: r.companyId,
    direction: r.direction,
    amount: toMoney(r.amountMillimes),
    date: fromDbDate(r.date),
    label: r.label,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    documentId: r.documentId,
    reason: r.reason,
    createdById: r.createdById,
  });
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Append-only ledger: no update, no delete. Running balances come from a SQL window function. */
export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly db: PrismaTx) {}

  async append(m: CashMovement): Promise<void> {
    const s = m.snapshot();
    try {
      await this.db.cashMovement.create({
        data: {
          id: s.id,
          companyId: s.companyId,
          direction: s.direction,
          amountMillimes: toBigInt(s.amount),
          date: toDbDate(s.date),
          label: s.label,
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          documentId: s.documentId,
          reason: s.reason,
          createdById: s.createdById,
        },
      });
    } catch (e) {
      // @@unique([sourceType, sourceId]): the same operation can never hit the balance twice
      if (isUniqueViolation(e)) throw new DomainError('DUPLICATE_OPERATION', `${s.sourceType}:${s.sourceId} already recorded`);
      throw e;
    }
  }

  async balanceAt(companyId: string, asOf?: LocalDate): Promise<Money> {
    const rows = await this.db.$queryRaw<{ balance: bigint | null }[]>`
      SELECT SUM(CASE WHEN "direction" = 'IN' THEN "amountMillimes" ELSE -"amountMillimes" END)::bigint AS balance
      FROM "CashMovement"
      WHERE "companyId" = ${companyId} ${asOf ? Prisma.sql`AND "date" <= ${toDbDate(asOf)}::date` : Prisma.empty}`;
    return toMoney(rows[0]?.balance ?? 0n);
  }

  async list(companyId: string, f: LedgerFilter, page: { offset: number; limit: number }) {
    const conditions: Prisma.Sql[] = [];
    if (f.from) conditions.push(Prisma.sql`t."date" >= ${toDbDate(f.from)}::date`);
    if (f.to) conditions.push(Prisma.sql`t."date" <= ${toDbDate(f.to)}::date`);
    if (f.sourceType) conditions.push(Prisma.sql`t."sourceType"::text = ${f.sourceType}`);
    if (f.direction) conditions.push(Prisma.sql`t."direction"::text = ${f.direction}`);
    const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    // The running balance is computed over ALL the company's movements, then filters apply:
    // a filtered or paginated view still shows the real balance after each row.
    const ranked = Prisma.sql`
      SELECT m.*, SUM(CASE WHEN m."direction" = 'IN' THEN m."amountMillimes" ELSE -m."amountMillimes" END)
               OVER (ORDER BY m."date", m."seq")::bigint AS "balanceAfter"
      FROM "CashMovement" m WHERE m."companyId" = ${companyId}`;

    const [rows, count] = await Promise.all([
      this.db.$queryRaw<(MovementSql & { balanceAfter: bigint; seq: number })[]>`
        SELECT * FROM (${ranked}) t ${where}
        ORDER BY t."date" DESC, t."seq" DESC
        LIMIT ${page.limit} OFFSET ${page.offset}`,
      this.db.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*)::bigint AS total FROM (${ranked}) t ${where}`,
    ]);
    const result: LedgerRow[] = rows.map((r) => ({ movement: movementToDomain(r), balanceAfter: toMoney(r.balanceAfter) }));
    return { rows: result, total: Number(count[0]?.total ?? 0) };
  }

  async between(companyId: string, from: LocalDate, to: LocalDate) {
    const rows = await this.db.cashMovement.findMany({
      where: { companyId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      orderBy: [{ date: 'asc' }, { seq: 'asc' }],
    });
    return rows.map((r) => movementToDomain(r as unknown as MovementSql));
  }
}

/** Audit entries are written with the same transaction client as the change they describe. */
export class PrismaAuditLog implements AuditLog {
  constructor(
    private readonly db: PrismaTx,
    private readonly ids: IdGenerator,
  ) {}

  async record(entry: AuditInput): Promise<void> {
    await this.db.auditEntry.create({
      data: {
        id: this.ids.next(),
        companyId: entry.companyId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before === undefined ? Prisma.DbNull : (toJson(entry.before) as Prisma.InputJsonValue),
        after: entry.after === undefined ? Prisma.DbNull : (toJson(entry.after) as Prisma.InputJsonValue),
      },
    });
  }

  async list(companyId: string, f: AuditFilter, page: { offset: number; limit: number }) {
    const where: Prisma.AuditEntryWhereInput = {
      companyId,
      ...(f.actorId ? { actorId: f.actorId } : {}),
      ...(f.action ? { action: { startsWith: f.action } } : {}),
      ...(f.entityType ? { entityType: f.entityType } : {}),
      ...(f.from || f.to
        ? {
            at: {
              ...(f.from ? { gte: toDbDate(f.from) } : {}),
              ...(f.to ? { lt: toDbDate(f.to.addDays(1)) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.auditEntry.findMany({ where, orderBy: { at: 'desc' }, skip: page.offset, take: page.limit }),
      this.db.auditEntry.count({ where }),
    ]);
    const users = await this.db.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    const items: AuditEntryView[] = rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorName: names.get(r.actorId) ?? '—',
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      at: r.at.toISOString(),
    }));
    return { items, total };
  }
}

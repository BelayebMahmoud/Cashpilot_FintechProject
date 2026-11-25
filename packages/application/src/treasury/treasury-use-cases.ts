import {
  assertCan,
  CashMovement,
  LocalDate,
  Money,
  NotFound,
  type Direction,
  type MovementSource,
} from '@cashpilot/domain';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, ok, PAGE_SIZE, type Page, type Result } from '../shared/result';

export interface LedgerRowDto {
  id: string;
  date: string;
  label: string;
  direction: Direction;
  amountMillimes: number;
  balanceAfterMillimes: number;
  sourceType: MovementSource;
  documentType: 'invoice' | 'expense' | null;
  documentId: string | null;
  isReversal: boolean;
  reason: string | null;
}

export interface TreasuryInput {
  from?: string;
  to?: string;
  sourceType?: MovementSource;
  direction?: Direction;
  page?: number;
}

export interface TreasuryDto extends Page<LedgerRowDto> {
  balanceTodayMillimes: number;
  openingDate: string;
  today: string;
}

function documentType(source: MovementSource): 'invoice' | 'expense' | null {
  if (source === 'PAYMENT' || source === 'PAYMENT_REVERSAL') return 'invoice';
  if (source === 'EXPENSE_PAYMENT' || source === 'EXPENSE_PAYMENT_REVERSAL') return 'expense';
  return null;
}

/** Real balance today + ledger rows (newest first) with the running balance after each row. */
export class GetTreasury {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: TreasuryInput = {}): Promise<Result<TreasuryDto>> {
    const today = this.deps.clock.today();
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'treasury.read');
        const page = Math.max(1, input.page ?? 1);
        const [company, balance, list] = await Promise.all([
          r.companies.byId(actor.companyId),
          r.ledger.balanceAt(actor.companyId, today),
          r.ledger.list(
            actor.companyId,
            {
              ...(input.from ? { from: LocalDate.parse(input.from) } : {}),
              ...(input.to ? { to: LocalDate.parse(input.to) } : {}),
              ...(input.sourceType ? { sourceType: input.sourceType } : {}),
              ...(input.direction ? { direction: input.direction } : {}),
            },
            { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
          ),
        ]);
        if (!company) throw new NotFound();
        return ok({
          balanceTodayMillimes: balance.millimes,
          openingDate: company.openingDate.toString(),
          today: today.toString(),
          items: list.rows.map(({ movement: m, balanceAfter }) => ({
            id: m.id,
            date: m.date.toString(),
            label: m.label,
            direction: m.direction,
            amountMillimes: m.amount.millimes,
            balanceAfterMillimes: balanceAfter.millimes,
            sourceType: m.sourceType,
            documentType: documentType(m.sourceType),
            documentId: m.documentId,
            isReversal: m.isReversal,
            reason: m.reason,
          })),
          total: list.total,
          page,
          pageSize: PAGE_SIZE,
        });
      }),
    );
  }
}

/** Manual correction (finance only, reason required). Never an edit of an existing movement. */
export class RecordAdjustment {
  constructor(private readonly deps: Deps) {}

  async execute(
    actor: Actor,
    input: { direction: Direction; amountMillimes: number; date: string; reason: string },
  ): Promise<Result<{ movementId: string }>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'ledger.adjust');
        const company = await tx.companies.byId(actor.companyId);
        if (!company) throw new NotFound();
        const movement = CashMovement.adjustment(
          this.deps.ids.next(),
          {
            companyId: actor.companyId,
            direction: input.direction,
            amount: Money.ofMillimes(input.amountMillimes),
            date: LocalDate.parse(input.date),
            reason: input.reason,
            createdById: actor.userId,
          },
          company.openingDate,
          this.deps.clock.today(),
        );
        await tx.ledger.append(movement);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'ledger.adjusted',
          entityType: 'CashMovement',
          entityId: movement.id,
          after: { direction: input.direction, amountMillimes: input.amountMillimes, date: input.date, reason: input.reason },
        });
        return ok({ movementId: movement.id });
      }),
    );
  }
}

/** Real end-of-day balance for each of the last `days` days (for the treasury mini chart). */
export class GetBalanceHistory {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { days: number }): Promise<Result<{ date: string; balanceMillimes: number }[]>> {
    const today = this.deps.clock.today();
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'treasury.read');
        const days = Math.min(Math.max(1, input.days), 366);
        const from = today.addDays(-(days - 1));
        const [start, movements] = await Promise.all([
          r.ledger.balanceAt(actor.companyId, from.addDays(-1)),
          r.ledger.between(actor.companyId, from, today),
        ]);
        let balance = start;
        const points: { date: string; balanceMillimes: number }[] = [];
        for (let day = from; !day.isAfter(today); day = day.addDays(1)) {
          for (const m of movements) if (m.date.equals(day)) balance = balance.add(m.signedAmount());
          points.push({ date: day.toString(), balanceMillimes: balance.millimes });
        }
        return ok(points);
      }),
    );
  }
}

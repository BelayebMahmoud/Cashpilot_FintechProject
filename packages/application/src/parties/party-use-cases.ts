import { assertCan, Money, NotFound, Party, type PartyDetails, type PartyKind } from '@cashpilot/domain';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, matchesQuery, ok, paginate, type Page, type Result } from '../shared/result';
import { toInvoiceSummary, type InvoiceSummaryDto } from '../invoices/invoice-dto';
import { toExpenseDto, type ExpenseDto } from '../expenses/expense-dto';

export interface PartyDto {
  id: string;
  kind: PartyKind;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  archived: boolean;
}

export function toPartyDto(p: Party): PartyDto {
  const s = p.snapshot();
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    email: s.email,
    phone: s.phone,
    address: s.address,
    taxId: s.taxId,
    notes: s.notes,
    archived: s.archived,
  };
}

export class CreateParty {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: PartyDetails & { kind: PartyKind }): Promise<Result<PartyDto>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'party.write');
        const party = Party.create(this.deps.ids.next(), actor.companyId, input.kind, input);
        await tx.parties.save(party);
        const dto = toPartyDto(party);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'party.created',
          entityType: 'Party',
          entityId: party.id,
          after: dto,
        });
        return ok(dto);
      }),
    );
  }
}

export class UpdateParty {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: PartyDetails & { id: string }): Promise<Result<PartyDto>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'party.write');
        const party = await tx.parties.byId(actor.companyId, input.id);
        if (!party) throw new NotFound();
        const before = toPartyDto(party);
        party.update(input);
        await tx.parties.save(party);
        const after = toPartyDto(party);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'party.updated',
          entityType: 'Party',
          entityId: party.id,
          before,
          after,
        });
        return ok(after);
      }),
    );
  }
}

/** Parties are archived (or restored), never deleted: history keeps its counterpart. */
export class ArchiveParty {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string; archived: boolean }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'party.write');
        const party = await tx.parties.byId(actor.companyId, input.id);
        if (!party) throw new NotFound();
        if (input.archived) party.archive();
        else party.unarchive();
        await tx.parties.save(party);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: input.archived ? 'party.archived' : 'party.restored',
          entityType: 'Party',
          entityId: party.id,
        });
        return ok(undefined);
      }),
    );
  }
}

export interface ListPartiesInput {
  kind: PartyKind;
  q?: string;
  page?: number;
  includeArchived?: boolean;
}

export class ListParties {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ListPartiesInput): Promise<Result<Page<PartyDto>>> {
    return attempt(async () => {
      assertCan(actor, 'party.read');
      const parties = await this.deps.uow.read((r) =>
        r.parties.list(actor.companyId, { kind: input.kind, includeArchived: input.includeArchived ?? false }),
      );
      const filtered = parties
        .map(toPartyDto)
        .filter((p) => matchesQuery(input.q, p.name, p.email, p.taxId, p.phone))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      return ok(paginate(filtered, input.page));
    });
  }
}

export interface PaymentRowDto {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  amountMillimes: number;
  method: string;
  isReversal: boolean;
  reversesId: string | null;
  reversed: boolean;
  reason: string | null;
}

export interface PartyDetailDto {
  party: PartyDto;
  invoices: InvoiceSummaryDto[];
  payments: PaymentRowDto[];
  expenses: ExpenseDto[];
  totals: {
    invoicedMillimes: number;
    receivedMillimes: number;
    outstandingMillimes: number;
    overdueMillimes: number;
    expensesPaidMillimes: number;
    expensesCommittedMillimes: number;
  };
}

/**
 * Client detail: invoices with remaining amounts, payment history and totals.
 * Supplier detail: expenses and total paid.
 */
export class GetPartyDetail {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<PartyDetailDto>> {
    const today = this.deps.clock.today();
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'party.read');
        const party = await r.parties.byId(actor.companyId, input.id);
        if (!party) throw new NotFound();

        const invoices =
          party.kind === 'CLIENT' ? await r.invoices.list(actor.companyId, { clientId: party.id }) : [];
        const expenses =
          party.kind === 'SUPPLIER' ? await r.expenses.list(actor.companyId, { supplierId: party.id }) : [];
        const names = await r.users.namesByIds([...new Set(expenses.map((e) => e.submittedById))]);

        const issued = invoices.filter((i) => i.status === 'ISSUED');
        const payments: PaymentRowDto[] = invoices
          .flatMap((inv) =>
            inv.payments.map((p) => ({
              id: p.id,
              invoiceId: inv.id,
              invoiceNumber: inv.number ?? '—',
              date: p.date.toString(),
              amountMillimes: p.amount.millimes,
              method: p.method,
              isReversal: p.isReversal,
              reversesId: p.reversesId,
              reversed: inv.isReversed(p.id),
              reason: p.reason,
            })),
          )
          .sort((a, b) => b.date.localeCompare(a.date));

        const sum = (xs: Money[]) => Money.sum(xs).millimes;
        return ok({
          party: toPartyDto(party),
          invoices: invoices
            .map((i) => toInvoiceSummary(i, party.name, today))
            .sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
          payments,
          expenses: expenses.map((e) => toExpenseDto(e, names, party.name)),
          totals: {
            invoicedMillimes: sum(issued.map((i) => i.total())),
            receivedMillimes: sum(invoices.map((i) => i.netPaid())),
            outstandingMillimes: sum(issued.map((i) => i.remaining())),
            overdueMillimes: sum(issued.filter((i) => i.isOverdue(today)).map((i) => i.remaining())),
            expensesPaidMillimes: sum(expenses.filter((e) => e.status === 'PAID').map((e) => e.amount)),
            expensesCommittedMillimes: sum(
              expenses.filter((e) => e.status === 'APPROVED' || e.status === 'PAID').map((e) => e.amount),
            ),
          },
        });
      }),
    );
  }
}

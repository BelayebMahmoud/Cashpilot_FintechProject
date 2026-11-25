import {
  assertCan,
  assertValidReceipt,
  can,
  CashMovement,
  DomainError,
  Expense,
  LocalDate,
  Money,
  NotFound,
  type ExpenseCategory,
  type ExpenseDetails,
  type ExpenseStatus,
  type Receipt,
} from '@cashpilot/domain';
import { type Repositories } from '../ports';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, matchesQuery, ok, paginate, type Page, type Result } from '../shared/result';
import { expenseAuditView, toExpenseDto, type ExpenseDto } from './expense-dto';

export interface ExpenseInput {
  label: string;
  category: ExpenseCategory;
  amountMillimes: number;
  expenseDate: string;
  dueDate?: string | null;
  supplierId?: string | null;
  projectId?: string | null;
  note?: string | null;
}

export interface ReceiptUpload {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

function toDetails(input: ExpenseInput): ExpenseDetails {
  return {
    label: input.label,
    category: input.category,
    amount: Money.ofMillimes(input.amountMillimes),
    expenseDate: LocalDate.parse(input.expenseDate),
    dueDate: input.dueDate ? LocalDate.parse(input.dueDate) : null,
    supplierId: input.supplierId ?? null,
    projectId: input.projectId ?? null,
    note: input.note ?? null,
  };
}

async function checkSupplier(tx: Repositories, companyId: string, supplierId: string | null | undefined) {
  if (!supplierId) return;
  const s = await tx.parties.byId(companyId, supplierId);
  if (!s || s.kind !== 'SUPPLIER') throw new DomainError('PARTY_INVALID', 'Unknown supplier', { field: 'supplierId' });
}

/** Validates (MIME + size) then stores the file privately. Returns the receipt to attach. */
async function storeReceipt(deps: Deps, file: ReceiptUpload): Promise<Receipt> {
  assertValidReceipt({ mimeType: file.mimeType, sizeBytes: file.bytes.byteLength });
  const key = await deps.storage.put(file.bytes, file.mimeType);
  return { key, fileName: file.fileName.slice(0, 200), mimeType: file.mimeType, sizeBytes: file.bytes.byteLength };
}

async function loadExpense(tx: Repositories, actor: Actor, id: string): Promise<Expense> {
  const expense = await tx.expenses.byId(actor.companyId, id);
  if (!expense) throw new NotFound();
  return expense;
}

function audit(tx: Repositories, actor: Actor, action: string, e: Expense, before?: unknown) {
  return tx.audit.record({
    companyId: actor.companyId,
    actorId: actor.userId,
    action,
    entityType: 'Expense',
    entityId: e.id,
    before,
    after: expenseAuditView(e),
  });
}

/**
 * Creates an expense draft, optionally with its receipt and directly submitted
 * (the collaborator's one-screen mobile flow).
 */
export class CreateExpense {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ExpenseInput & { receipt?: ReceiptUpload | null; submit?: boolean }): Promise<Result<ExpenseDto>> {
    return attempt(async () => {
      assertCan(actor, 'expense.submit');
      const receipt = input.receipt ? await storeReceipt(this.deps, input.receipt) : null;
      return this.deps.uow.run(async (tx) => {
        await checkSupplier(tx, actor.companyId, input.supplierId);
        const expense = Expense.draft(this.deps.ids.next(), actor.companyId, actor.userId, toDetails(input));
        if (receipt) expense.attachReceipt(receipt);
        if (input.submit) expense.submit(this.deps.clock.today());
        await tx.expenses.save(expense);
        await audit(tx, actor, input.submit ? 'expense.submitted' : 'expense.draftCreated', expense);
        return ok(toExpenseDto(expense, new Map([[actor.userId, '']])));
      });
    });
  }
}

export class UpdateExpenseDraft {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ExpenseInput & { id: string; receipt?: ReceiptUpload | null }): Promise<Result<void>> {
    return attempt(async () => {
      const receipt = input.receipt ? await storeReceipt(this.deps, input.receipt) : null;
      return this.deps.uow.run(async (tx) => {
        const expense = await loadExpense(tx, actor, input.id);
        assertCan(actor, 'expense.submit', expense);
        await checkSupplier(tx, actor.companyId, input.supplierId);
        const before = expenseAuditView(expense);
        expense.updateDraft(toDetails(input));
        if (receipt) expense.attachReceipt(receipt);
        await tx.expenses.save(expense);
        await audit(tx, actor, 'expense.draftUpdated', expense, before);
        return ok(undefined);
      });
    });
  }
}

export class AttachReceipt {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string; receipt: ReceiptUpload }): Promise<Result<void>> {
    return attempt(async () => {
      const receipt = await storeReceipt(this.deps, input.receipt);
      return this.deps.uow.run(async (tx) => {
        const expense = await loadExpense(tx, actor, input.id);
        assertCan(actor, 'expense.submit', expense);
        expense.attachReceipt(receipt);
        await tx.expenses.save(expense);
        await audit(tx, actor, 'expense.receiptAttached', expense);
        return ok(undefined);
      });
    });
  }
}

export class SubmitExpense {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        const expense = await loadExpense(tx, actor, input.id);
        assertCan(actor, 'expense.submit', expense);
        expense.submit(this.deps.clock.today());
        await tx.expenses.save(expense);
        await audit(tx, actor, 'expense.submitted', expense, { status: 'DRAFT' });
        return ok(undefined);
      }),
    );
  }
}

export class WithdrawExpense {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        const expense = await loadExpense(tx, actor, input.id);
        assertCan(actor, 'expense.submit', expense);
        expense.withdraw();
        await tx.expenses.save(expense);
        await audit(tx, actor, 'expense.withdrawn', expense, { status: 'SUBMITTED' });
        return ok(undefined);
      }),
    );
  }
}

/** Owner approval. Approving one's own expense is allowed and audited with `selfApproved: true`. */
export class ApproveExpense {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        const expense = await loadExpense(tx, actor, input.id);
        assertCan(actor, 'expense.approve', expense);
        expense.approve(actor.userId, this.deps.clock.today());
        await tx.expenses.save(expense);
        await audit(tx, actor, 'expense.approved', expense, { status: 'SUBMITTED' });
        return ok(undefined);
      }),
    );
  }
}

export class RejectExpense {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string; reason: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        const expense = await loadExpense(tx, actor, input.id);
        assertCan(actor, 'expense.approve', expense);
        expense.reject(actor.userId, input.reason, this.deps.clock.today());
        await tx.expenses.save(expense);
        await audit(tx, actor, 'expense.rejected', expense, { status: 'SUBMITTED' });
        return ok(undefined);
      }),
    );
  }
}

/** APPROVED → PAID with an OUT ledger movement (sourceId = new payment ref). */
export class MarkExpensePaid {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string; date: string }): Promise<Result<void>> {
    const { clock, ids } = this.deps;
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'expense.pay');
        const expense = await loadExpense(tx, actor, input.id);
        const company = await tx.companies.byId(actor.companyId);
        if (!company) throw new NotFound();
        const paymentRef = ids.next();
        const date = LocalDate.parse(input.date);
        expense.markPaid(paymentRef, date, clock.today());
        await tx.expenses.save(expense);
        await tx.ledger.append(CashMovement.fromExpensePayment(ids.next(), expense, paymentRef, date, actor.userId, company.openingDate));
        await audit(tx, actor, 'expense.paid', expense, { status: 'APPROVED' });
        return ok(undefined);
      }),
    );
  }
}

/** PAID → APPROVED with an IN counter-movement; the original movement is kept. */
export class ReverseExpensePayment {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string; reason: string }): Promise<Result<void>> {
    const { clock, ids } = this.deps;
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'expense.pay');
        const expense = await loadExpense(tx, actor, input.id);
        const company = await tx.companies.byId(actor.companyId);
        if (!company) throw new NotFound();
        const ref = expense.reversePayment();
        await tx.expenses.save(expense);
        await tx.ledger.append(
          CashMovement.fromExpensePaymentReversal(ids.next(), expense, ref, clock.today(), input.reason, actor.userId, company.openingDate),
        );
        await audit(tx, actor, 'expense.paymentReversed', expense, { status: 'PAID', paymentRef: ref, reason: input.reason });
        return ok(undefined);
      }),
    );
  }
}

export const EXPENSE_TABS = ['all', 'draft', 'submitted', 'toPay', 'paid', 'rejected'] as const;
export type ExpenseTab = (typeof EXPENSE_TABS)[number];

const TAB_STATUS: Record<Exclude<ExpenseTab, 'all'>, ExpenseStatus> = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  toPay: 'APPROVED',
  paid: 'PAID',
  rejected: 'REJECTED',
};

export interface ListExpensesInput {
  /** 'mine' = submitted by the actor. An EMPLOYEE always gets 'mine'. */
  scope?: 'mine' | 'all';
  tab?: ExpenseTab;
  q?: string;
  page?: number;
}

export interface ExpenseListDto extends Page<ExpenseDto> {
  counts: Record<ExpenseTab, number>;
}

export class ListExpenses {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ListExpensesInput = {}): Promise<Result<ExpenseListDto>> {
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'expense.read');
        const onlyMine = input.scope === 'mine' || !can(actor, 'expense.readAll');
        const expenses = await r.expenses.list(actor.companyId, onlyMine ? { submittedById: actor.userId } : {});
        // others' drafts are private to their author
        const visible = expenses.filter((e) => e.status !== 'DRAFT' || e.isOwnedBy(actor.userId));
        const [names, suppliers] = await Promise.all([
          r.users.namesByIds([...new Set(visible.flatMap((e) => [e.submittedById, e.snapshot().decidedById ?? '']))]),
          r.parties.list(actor.companyId, { kind: 'SUPPLIER', includeArchived: true }),
        ]);
        const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
        const rows = visible
          .map((e) => toExpenseDto(e, names, e.supplierId ? (supplierNames.get(e.supplierId) ?? null) : null))
          .filter((e) => matchesQuery(input.q, e.label, e.submittedByName, e.supplierName));
        const counts = Object.fromEntries(
          EXPENSE_TABS.map((t) => [t, t === 'all' ? rows.length : rows.filter((e) => e.status === TAB_STATUS[t]).length]),
        ) as Record<ExpenseTab, number>;
        const tab = input.tab ?? 'all';
        const filtered = rows
          .filter((e) => tab === 'all' || e.status === TAB_STATUS[tab])
          .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || a.id.localeCompare(b.id));
        return ok({ ...paginate(filtered, input.page), counts });
      }),
    );
  }
}

export class GetExpense {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<ExpenseDto>> {
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        const expense = await loadExpense(r, actor, input.id);
        assertCan(actor, 'expense.read', expense);
        const s = expense.snapshot();
        const [names, supplier] = await Promise.all([
          r.users.namesByIds([s.submittedById, s.decidedById ?? '']),
          s.supplierId ? r.parties.byId(actor.companyId, s.supplierId) : Promise.resolve(null),
        ]);
        return ok(toExpenseDto(expense, names, supplier?.name ?? null));
      }),
    );
  }
}

/** Receipts are never public: the route handler goes through this permission check. */
export class GetReceipt {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { expenseId: string }): Promise<Result<{ bytes: Uint8Array; mimeType: string; fileName: string }>> {
    return attempt(async () => {
      const receipt = await this.deps.uow.read(async (r) => {
        const expense = await loadExpense(r, actor, input.expenseId);
        assertCan(actor, 'expense.read', expense);
        return expense.receipt;
      });
      if (!receipt) throw new NotFound();
      const file = await this.deps.storage.get(receipt.key);
      if (!file) throw new NotFound();
      return ok({ bytes: file.bytes, mimeType: receipt.mimeType, fileName: receipt.fileName });
    });
  }
}

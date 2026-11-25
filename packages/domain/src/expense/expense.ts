import { DomainError } from '../shared/errors';
import {
  cleanText,
  type CompanyId,
  type ExpenseId,
  type PartyId,
  type ProjectId,
  type UserId,
} from '../shared/id';
import { type LocalDate } from '../shared/local-date';
import { type Money } from '../shared/money';

export const EXPENSE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  'RENT',
  'SALARIES',
  'SUPPLIES',
  'SOFTWARE',
  'MARKETING',
  'TRAVEL',
  'SUBCONTRACTING',
  'TAXES',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: 'Loyer',
  SALARIES: 'Salaires',
  SUPPLIES: 'Fournitures',
  SOFTWARE: 'Logiciels & abonnements',
  MARKETING: 'Marketing',
  TRAVEL: 'Déplacements',
  SUBCONTRACTING: 'Sous-traitance',
  TAXES: 'Impôts & taxes',
  OTHER: 'Autre',
};

export const RECEIPT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export interface Receipt {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Server-side receipt check (MIME + size). The client check is only a convenience. */
export function assertValidReceipt(file: { mimeType: string; sizeBytes: number }): void {
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.mimeType)) {
    throw new DomainError('RECEIPT_INVALID_TYPE');
  }
  if (file.sizeBytes <= 0 || file.sizeBytes > RECEIPT_MAX_BYTES) {
    throw new DomainError('RECEIPT_TOO_LARGE');
  }
}

export interface ExpenseDetails {
  label: string;
  category: ExpenseCategory;
  amount: Money;
  expenseDate: LocalDate;
  dueDate?: LocalDate | null;
  supplierId?: PartyId | null;
  projectId?: ProjectId | null;
  note?: string | null;
}

export interface ExpenseProps {
  companyId: CompanyId;
  submittedById: UserId;
  label: string;
  category: ExpenseCategory;
  amount: Money;
  expenseDate: LocalDate;
  dueDate: LocalDate | null;
  supplierId: PartyId | null;
  projectId: ProjectId | null;
  note: string | null;
  receipt: Receipt | null;
  status: ExpenseStatus;
  submittedAt: LocalDate | null;
  decidedById: UserId | null;
  decidedAt: LocalDate | null;
  rejectReason: string | null;
  selfApproved: boolean;
  /** Id of the current payment operation (ledger sourceId); null when unpaid. */
  paymentRef: string | null;
  paidAt: LocalDate | null;
}

function checkDetails(d: ExpenseDetails) {
  const label = d.label.trim();
  if (label.length < 2) throw new DomainError('VALIDATION', 'Label required', { field: 'label' });
  if (!d.amount.isPositive()) throw new DomainError('INVALID_AMOUNT');
  if (d.dueDate && d.dueDate.isBefore(d.expenseDate)) {
    throw new DomainError('INVALID_DATE', 'Due date before expense date', { field: 'dueDate' });
  }
  return {
    label,
    category: d.category,
    amount: d.amount,
    expenseDate: d.expenseDate,
    dueDate: d.dueDate ?? null,
    supplierId: d.supplierId ?? null,
    projectId: d.projectId ?? null,
    note: cleanText(d.note),
  };
}

/**
 * Expense state machine:
 *   DRAFT → SUBMITTED → APPROVED | REJECTED,  APPROVED → PAID,  PAID → APPROVED (payment reversal)
 *   SUBMITTED → DRAFT (withdraw before any decision). REJECTED is terminal.
 */
export class Expense {
  private constructor(
    readonly id: ExpenseId,
    private props: ExpenseProps,
  ) {}

  static draft(id: ExpenseId, companyId: CompanyId, submittedById: UserId, details: ExpenseDetails): Expense {
    return new Expense(id, {
      companyId,
      submittedById,
      ...checkDetails(details),
      receipt: null,
      status: 'DRAFT',
      submittedAt: null,
      decidedById: null,
      decidedAt: null,
      rejectReason: null,
      selfApproved: false,
      paymentRef: null,
      paidAt: null,
    });
  }

  static restore(id: ExpenseId, props: ExpenseProps): Expense {
    return new Expense(id, { ...props });
  }

  updateDraft(details: ExpenseDetails): void {
    this.assertStatus('DRAFT');
    this.props = { ...this.props, ...checkDetails(details) };
  }

  attachReceipt(receipt: Receipt): void {
    this.assertStatus('DRAFT');
    assertValidReceipt(receipt);
    this.props = { ...this.props, receipt: { ...receipt } };
  }

  submit(today: LocalDate): void {
    this.assertStatus('DRAFT');
    if (!this.props.receipt) throw new DomainError('EXPENSE_RECEIPT_REQUIRED');
    this.props = { ...this.props, status: 'SUBMITTED', submittedAt: today };
  }

  withdraw(): void {
    this.assertStatus('SUBMITTED');
    this.props = { ...this.props, status: 'DRAFT', submittedAt: null };
  }

  /** Approval by the owner. Approving one's own expense is allowed but flagged. */
  approve(approverId: UserId, today: LocalDate): void {
    this.assertStatus('SUBMITTED');
    this.props = {
      ...this.props,
      status: 'APPROVED',
      decidedById: approverId,
      decidedAt: today,
      selfApproved: approverId === this.props.submittedById,
    };
  }

  reject(approverId: UserId, reason: string, today: LocalDate): void {
    this.assertStatus('SUBMITTED');
    const why = cleanText(reason);
    if (!why) throw new DomainError('REASON_REQUIRED');
    this.props = {
      ...this.props,
      status: 'REJECTED',
      decidedById: approverId,
      decidedAt: today,
      rejectReason: why,
    };
  }

  /** APPROVED → PAID. A rejected (or any non-approved) expense can never be paid. */
  markPaid(paymentRef: string, date: LocalDate, today: LocalDate): void {
    if (this.props.status !== 'APPROVED') throw new DomainError('EXPENSE_NOT_APPROVED');
    if (date.isAfter(today)) throw new DomainError('PAYMENT_IN_FUTURE');
    this.props = { ...this.props, status: 'PAID', paymentRef, paidAt: date };
  }

  /** PAID → APPROVED. Returns the reversed payment ref (the ledger writes the counter-movement). */
  reversePayment(): string {
    if (this.props.status !== 'PAID' || !this.props.paymentRef) {
      throw new DomainError('EXPENSE_INVALID_TRANSITION');
    }
    const ref = this.props.paymentRef;
    this.props = { ...this.props, status: 'APPROVED', paymentRef: null, paidAt: null };
    return ref;
  }

  /** Date used by the forecast: due date when set, otherwise the expense date. */
  effectiveDueDate(): LocalDate {
    return this.props.dueDate ?? this.props.expenseDate;
  }

  isOwnedBy(userId: UserId): boolean {
    return this.props.submittedById === userId;
  }

  private assertStatus(expected: ExpenseStatus): void {
    if (this.props.status !== expected) {
      throw new DomainError('EXPENSE_INVALID_TRANSITION', `Expected ${expected}, got ${this.props.status}`);
    }
  }

  get companyId(): CompanyId {
    return this.props.companyId;
  }
  get submittedById(): UserId {
    return this.props.submittedById;
  }
  get status(): ExpenseStatus {
    return this.props.status;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get label(): string {
    return this.props.label;
  }
  get receipt(): Receipt | null {
    return this.props.receipt;
  }
  get selfApproved(): boolean {
    return this.props.selfApproved;
  }
  get paymentRef(): string | null {
    return this.props.paymentRef;
  }
  get supplierId(): PartyId | null {
    return this.props.supplierId;
  }
  get projectId(): ProjectId | null {
    return this.props.projectId;
  }

  /** Used by policies: the submitter owns the expense. */
  get ownerUserId(): UserId {
    return this.props.submittedById;
  }

  snapshot(): Readonly<ExpenseProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}

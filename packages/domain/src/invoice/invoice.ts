import { type PartyKind } from '../party/party';
import { DomainError, invariant } from '../shared/errors';
import {
  cleanText,
  type CompanyId,
  type InvoiceId,
  type PartyId,
  type PaymentId,
  type ProjectId,
  type UserId,
} from '../shared/id';
import { type LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { type InvoiceNumber } from './invoice-number';
import { Payment, type PaymentMethod } from './payment';
import { assertValidLine, computeTotals, type InvoiceTotals, type LineInput } from './totals';

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Derived from payments, never stored. */
export type Settlement = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface InvoiceLine extends LineInput {
  id: string;
}

export interface InvoiceProps {
  companyId: CompanyId;
  clientId: PartyId;
  projectId: ProjectId | null;
  number: string | null;
  status: InvoiceStatus;
  issueDate: LocalDate;
  dueDate: LocalDate;
  lines: InvoiceLine[];
  stampDuty: Money;
  notes: string | null;
  cancelReason: string | null;
  payments: Payment[];
}

export interface DraftInput {
  companyId: CompanyId;
  clientId: PartyId;
  clientKind: PartyKind;
  projectId?: ProjectId | null;
  issueDate: LocalDate;
  dueDate: LocalDate;
  lines: InvoiceLine[];
  stampDuty: Money;
  notes?: string | null;
}

export interface RecordPaymentInput {
  paymentId: PaymentId;
  amount: Money;
  date: LocalDate;
  method: PaymentMethod;
  today: LocalDate;
  createdById: UserId;
}

export interface ReversePaymentInput {
  reversalId: PaymentId;
  paymentId: PaymentId;
  reason: string;
  date: LocalDate;
  createdById: UserId;
}

function checkDraft(input: Omit<DraftInput, 'companyId' | 'stampDuty'>): void {
  if (input.clientKind !== 'CLIENT') throw new DomainError('INVOICE_CLIENT_INVALID');
  if (input.lines.length === 0) throw new DomainError('INVOICE_EMPTY');
  input.lines.forEach(assertValidLine);
  if (input.dueDate.isBefore(input.issueDate)) throw new DomainError('INVOICE_DUE_BEFORE_ISSUE');
}

/**
 * Invoice aggregate (lines + payments).
 * Stored status: DRAFT → ISSUED → CANCELLED. Settlement (unpaid / partial / paid)
 * and "overdue" are derived from payments and today's date, never stored.
 */
export class Invoice {
  private constructor(
    readonly id: InvoiceId,
    private props: InvoiceProps,
  ) {}

  static draft(id: InvoiceId, input: DraftInput): Invoice {
    checkDraft(input);
    return new Invoice(id, {
      companyId: input.companyId,
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      number: null,
      status: 'DRAFT',
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      lines: input.lines.map((l) => ({ ...l, description: l.description.trim() })),
      stampDuty: input.stampDuty,
      notes: cleanText(input.notes),
      cancelReason: null,
      payments: [],
    });
  }

  static restore(id: InvoiceId, props: InvoiceProps): Invoice {
    return new Invoice(id, { ...props, lines: [...props.lines], payments: [...props.payments] });
  }

  // ---- lifecycle -------------------------------------------------------------------------

  updateDraft(input: Omit<DraftInput, 'companyId' | 'stampDuty'>): void {
    this.assertDraft();
    checkDraft(input);
    this.props = {
      ...this.props,
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      lines: input.lines.map((l) => ({ ...l, description: l.description.trim() })),
      notes: cleanText(input.notes),
    };
  }

  /** Only drafts can be deleted; issued invoices are kept forever. */
  assertDeletable(): void {
    this.assertDraft();
  }

  /** DRAFT → ISSUED. Locks the lines and assigns the gapless number. */
  validate(number: InvoiceNumber): void {
    this.assertDraft();
    invariant(this.props.lines.length > 0, 'INVOICE_EMPTY');
    this.props = { ...this.props, status: 'ISSUED', number: number.value };
  }

  /** ISSUED → CANCELLED, only when nothing is (net) paid. */
  cancel(reason: string): void {
    if (this.props.status !== 'ISSUED') throw new DomainError('INVOICE_NOT_ISSUED');
    const why = cleanText(reason);
    if (!why) throw new DomainError('REASON_REQUIRED');
    if (!this.netPaid().isZero()) {
      throw new DomainError('INVOICE_HAS_PAYMENTS', 'Reverse the payments first');
    }
    this.props = { ...this.props, status: 'CANCELLED', cancelReason: why };
  }

  // ---- payments ----------------------------------------------------------------------------

  /** Records a full or partial payment: 0 < amount ≤ remaining, issueDate ≤ date ≤ today. */
  recordPayment(input: RecordPaymentInput): Payment {
    if (this.props.status !== 'ISSUED') throw new DomainError('INVOICE_NOT_ISSUED');
    if (!input.amount.isPositive()) throw new DomainError('INVALID_AMOUNT');
    if (input.date.isAfter(input.today)) throw new DomainError('PAYMENT_IN_FUTURE');
    if (input.date.isBefore(this.props.issueDate)) throw new DomainError('PAYMENT_BEFORE_ISSUE');
    const remaining = this.remaining();
    if (input.amount.compare(remaining) > 0) {
      throw new DomainError('INVOICE_OVERPAID', 'Amount exceeds remaining', {
        remainingMillimes: remaining.millimes,
      });
    }
    const payment = Payment.create(input.paymentId, {
      invoiceId: this.id,
      amount: input.amount,
      date: input.date,
      method: input.method,
      reversesId: null,
      reason: null,
      createdById: input.createdById,
    });
    this.props = { ...this.props, payments: [...this.props.payments, payment] };
    return payment;
  }

  /** Adds a counter-entry for `paymentId`. The original payment is never modified. */
  reversePayment(input: ReversePaymentInput): Payment {
    const original = this.props.payments.find((p) => p.id === input.paymentId);
    if (!original) throw new DomainError('NOT_FOUND', 'Payment not found');
    if (original.isReversal) throw new DomainError('PAYMENT_IS_REVERSAL');
    if (this.isReversed(original.id)) throw new DomainError('PAYMENT_ALREADY_REVERSED');
    const reason = cleanText(input.reason);
    if (!reason) throw new DomainError('REASON_REQUIRED');
    if (input.date.isBefore(original.date)) throw new DomainError('INVALID_DATE');
    const reversal = Payment.create(input.reversalId, {
      invoiceId: this.id,
      amount: original.amount,
      date: input.date,
      method: original.method,
      reversesId: original.id,
      reason,
      createdById: input.createdById,
    });
    this.props = { ...this.props, payments: [...this.props.payments, reversal] };
    return reversal;
  }

  isReversed(paymentId: PaymentId): boolean {
    return this.props.payments.some((p) => p.reversesId === paymentId);
  }

  hasPayment(paymentId: PaymentId): boolean {
    return this.props.payments.some((p) => p.id === paymentId);
  }

  // ---- derived values ----------------------------------------------------------------------

  totals(): InvoiceTotals {
    return computeTotals(this.props.lines, this.props.stampDuty.millimes);
  }

  total(): Money {
    return Money.ofMillimes(this.totals().totalMillimes);
  }

  /** Σ payments − Σ reversals */
  netPaid(): Money {
    return Money.sum(this.props.payments.map((p) => p.signedAmount()));
  }

  /** total − net paid. Cancelled and draft invoices have nothing left to collect. */
  remaining(): Money {
    if (this.props.status !== 'ISSUED') return Money.zero();
    return this.total().subtract(this.netPaid());
  }

  settlement(): Settlement {
    const paid = this.netPaid();
    if (paid.isZero()) return 'UNPAID';
    return this.total().subtract(paid).isZero() ? 'PAID' : 'PARTIALLY_PAID';
  }

  isOverdue(today: LocalDate): boolean {
    return this.props.status === 'ISSUED' && this.remaining().isPositive() && this.props.dueDate.isBefore(today);
  }

  daysOverdue(today: LocalDate): number {
    return this.isOverdue(today) ? today.diffDays(this.props.dueDate) : 0;
  }

  private assertDraft(): void {
    if (this.props.status !== 'DRAFT') throw new DomainError('INVOICE_NOT_DRAFT');
  }

  // ---- accessors ---------------------------------------------------------------------------

  get companyId(): CompanyId {
    return this.props.companyId;
  }
  get clientId(): PartyId {
    return this.props.clientId;
  }
  get projectId(): ProjectId | null {
    return this.props.projectId;
  }
  get status(): InvoiceStatus {
    return this.props.status;
  }
  get number(): string | null {
    return this.props.number;
  }
  get issueDate(): LocalDate {
    return this.props.issueDate;
  }
  get dueDate(): LocalDate {
    return this.props.dueDate;
  }
  get lines(): readonly InvoiceLine[] {
    return this.props.lines;
  }
  get payments(): readonly Payment[] {
    return this.props.payments;
  }
  get cancelReason(): string | null {
    return this.props.cancelReason;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get stampDuty(): Money {
    return this.props.stampDuty;
  }

  snapshot(): Readonly<InvoiceProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}

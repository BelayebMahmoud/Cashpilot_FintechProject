import { type Company } from '../company/company';
import { type Expense } from '../expense/expense';
import { type Payment } from '../invoice/payment';
import { DomainError } from '../shared/errors';
import { cleanText, type CompanyId, type MovementId, type UserId } from '../shared/id';
import { type LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';

export const DIRECTIONS = ['IN', 'OUT'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const MOVEMENT_SOURCES = [
  'OPENING',
  'PAYMENT',
  'PAYMENT_REVERSAL',
  'EXPENSE_PAYMENT',
  'EXPENSE_PAYMENT_REVERSAL',
  'ADJUSTMENT',
] as const;
export type MovementSource = (typeof MOVEMENT_SOURCES)[number];

export interface CashMovementProps {
  companyId: CompanyId;
  direction: Direction;
  /** Always > 0; the sign comes from `direction`. */
  amount: Money;
  date: LocalDate;
  label: string;
  sourceType: MovementSource;
  /** Id of the *operation* (payment, reversal, expense payment ref…), never of the parent document. */
  sourceId: string;
  /** The parent document (invoice or expense) for navigation; null for opening/adjustments. */
  documentId: string | null;
  reason: string | null;
  createdById: UserId;
}

/**
 * A realised cash movement in the append-only ledger.
 * (sourceType, sourceId) is unique: an operation affects the real balance exactly once.
 */
export class CashMovement {
  private constructor(
    readonly id: MovementId,
    private readonly props: CashMovementProps,
  ) {}

  private static make(id: MovementId, props: CashMovementProps, openingDate: LocalDate | null): CashMovement {
    if (!props.amount.isPositive()) throw new DomainError('INVALID_AMOUNT');
    if (openingDate && props.date.isBefore(openingDate)) throw new DomainError('MOVEMENT_BEFORE_OPENING');
    return new CashMovement(id, { ...props });
  }

  static restore(id: MovementId, props: CashMovementProps): CashMovement {
    return new CashMovement(id, { ...props });
  }

  /** Opening balance: one movement, sourceId = companyId. Returns null for a zero balance. */
  static fromOpening(id: MovementId, company: Company, createdById: UserId): CashMovement | null {
    if (company.openingBalance.isZero()) return null;
    return CashMovement.make(
      id,
      {
        companyId: company.id,
        direction: company.openingBalance.isNegative() ? 'OUT' : 'IN',
        amount: company.openingBalance.abs(),
        date: company.openingDate,
        label: 'Solde initial',
        sourceType: 'OPENING',
        sourceId: company.id,
        documentId: null,
        reason: null,
        createdById,
      },
      null,
    );
  }

  /** Incoming payment (IN) or its reversal (OUT). */
  static fromPayment(id: MovementId, companyId: CompanyId, payment: Payment, label: string, openingDate: LocalDate): CashMovement {
    return CashMovement.make(
      id,
      {
        companyId,
        direction: payment.isReversal ? 'OUT' : 'IN',
        amount: payment.amount,
        date: payment.date,
        label,
        sourceType: payment.isReversal ? 'PAYMENT_REVERSAL' : 'PAYMENT',
        sourceId: payment.id,
        documentId: payment.invoiceId,
        reason: payment.reason,
        createdById: payment.createdById,
      },
      openingDate,
    );
  }

  static fromExpensePayment(
    id: MovementId,
    expense: Expense,
    paymentRef: string,
    date: LocalDate,
    createdById: UserId,
    openingDate: LocalDate,
  ): CashMovement {
    return CashMovement.make(
      id,
      {
        companyId: expense.companyId,
        direction: 'OUT',
        amount: expense.amount,
        date,
        label: `Dépense — ${expense.label}`,
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: paymentRef,
        documentId: expense.id,
        reason: null,
        createdById,
      },
      openingDate,
    );
  }

  /** Counter-entry of an expense payment; sourceId = the reversed payment ref, so it can happen once. */
  static fromExpensePaymentReversal(
    id: MovementId,
    expense: Expense,
    reversedRef: string,
    date: LocalDate,
    reason: string,
    createdById: UserId,
    openingDate: LocalDate,
  ): CashMovement {
    const why = cleanText(reason);
    if (!why) throw new DomainError('REASON_REQUIRED');
    return CashMovement.make(
      id,
      {
        companyId: expense.companyId,
        direction: 'IN',
        amount: expense.amount,
        date,
        label: `Annulation paiement — ${expense.label}`,
        sourceType: 'EXPENSE_PAYMENT_REVERSAL',
        sourceId: reversedRef,
        documentId: expense.id,
        reason: why,
        createdById,
      },
      openingDate,
    );
  }

  /** Manual correction, always with a reason. sourceId = the movement id itself. */
  static adjustment(
    id: MovementId,
    input: { companyId: CompanyId; direction: Direction; amount: Money; date: LocalDate; reason: string; createdById: UserId },
    openingDate: LocalDate,
    today: LocalDate,
  ): CashMovement {
    const why = cleanText(input.reason);
    if (!why) throw new DomainError('REASON_REQUIRED');
    if (input.date.isAfter(today)) throw new DomainError('PAYMENT_IN_FUTURE');
    return CashMovement.make(
      id,
      {
        companyId: input.companyId,
        direction: input.direction,
        amount: input.amount,
        date: input.date,
        label: `Mouvement manuel — ${why}`,
        sourceType: 'ADJUSTMENT',
        sourceId: id,
        documentId: null,
        reason: why,
        createdById: input.createdById,
      },
      openingDate,
    );
  }

  /** + for IN, − for OUT */
  signedAmount(): Money {
    return this.props.direction === 'IN' ? this.props.amount : this.props.amount.negate();
  }

  get companyId(): CompanyId {
    return this.props.companyId;
  }
  get direction(): Direction {
    return this.props.direction;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get date(): LocalDate {
    return this.props.date;
  }
  get sourceType(): MovementSource {
    return this.props.sourceType;
  }
  get sourceId(): string {
    return this.props.sourceId;
  }
  get label(): string {
    return this.props.label;
  }
  get documentId(): string | null {
    return this.props.documentId;
  }
  get reason(): string | null {
    return this.props.reason;
  }
  get isReversal(): boolean {
    return this.props.sourceType === 'PAYMENT_REVERSAL' || this.props.sourceType === 'EXPENSE_PAYMENT_REVERSAL';
  }

  snapshot(): Readonly<CashMovementProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}

/** realBalance(asOf) = Σ signed movements with date ≤ asOf */
export function balanceOf(movements: readonly CashMovement[], asOf?: LocalDate): Money {
  return movements
    .filter((m) => !asOf || !m.date.isAfter(asOf))
    .reduce((acc, m) => acc.add(m.signedAmount()), Money.zero());
}

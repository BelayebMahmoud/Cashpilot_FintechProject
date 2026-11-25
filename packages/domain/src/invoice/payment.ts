import { cleanText, type InvoiceId, type PaymentId, type UserId } from '../shared/id';
import { type LocalDate } from '../shared/local-date';
import { type Money } from '../shared/money';

export const PAYMENT_METHODS = ['TRANSFER', 'CHEQUE', 'CASH', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  TRANSFER: 'Virement',
  CHEQUE: 'Chèque',
  CASH: 'Espèces',
  CARD: 'Carte',
  OTHER: 'Autre',
};

export interface PaymentProps {
  invoiceId: InvoiceId;
  /** Always positive. A reversal is a separate payment with `reversesId` set. */
  amount: Money;
  date: LocalDate;
  method: PaymentMethod;
  /** Set on a counter-entry: the id of the payment it cancels. */
  reversesId: PaymentId | null;
  reason: string | null;
  createdById: UserId;
}

/**
 * An incoming payment (encaissement) or its reversal (contre-passation).
 * Payments are immutable: corrections are new payments.
 */
export class Payment {
  private constructor(
    readonly id: PaymentId,
    private readonly props: PaymentProps,
  ) {}

  static create(id: PaymentId, props: PaymentProps): Payment {
    return new Payment(id, { ...props, reason: cleanText(props.reason) });
  }

  static restore(id: PaymentId, props: PaymentProps): Payment {
    return new Payment(id, { ...props });
  }

  get invoiceId(): InvoiceId {
    return this.props.invoiceId;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get date(): LocalDate {
    return this.props.date;
  }
  get method(): PaymentMethod {
    return this.props.method;
  }
  get reversesId(): PaymentId | null {
    return this.props.reversesId;
  }
  get isReversal(): boolean {
    return this.props.reversesId !== null;
  }
  get reason(): string | null {
    return this.props.reason;
  }
  get createdById(): UserId {
    return this.props.createdById;
  }

  /** + for a payment, − for a reversal. */
  signedAmount(): Money {
    return this.isReversal ? this.props.amount.negate() : this.props.amount;
  }

  snapshot(): Readonly<PaymentProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}

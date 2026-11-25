import { type Direction } from '../ledger/cash-movement';
import { DomainError } from '../shared/errors';
import { cleanText, type CompanyId, type PlannedFlowId, type UserId } from '../shared/id';
import { type LocalDate } from '../shared/local-date';
import { type Money } from '../shared/money';

export const RECURRENCES = ['NONE', 'MONTHLY'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export interface PlannedFlowProps {
  companyId: CompanyId;
  direction: Direction;
  amount: Money;
  expectedDate: LocalDate;
  label: string;
  recurrence: Recurrence;
  /** Last date of a MONTHLY recurrence (inclusive); null = open-ended. */
  endDate: LocalDate | null;
  cancelled: boolean;
  createdById: UserId;
}

export interface PlannedFlowInput {
  direction: Direction;
  amount: Money;
  expectedDate: LocalDate;
  label: string;
  recurrence: Recurrence;
  endDate?: LocalDate | null;
}

/**
 * A manual forecast entry (salaries, rent, an expected receipt without invoice yet…).
 * It never touches the ledger. It can be cancelled, not edited.
 */
export class PlannedFlow {
  private constructor(
    readonly id: PlannedFlowId,
    private props: PlannedFlowProps,
  ) {}

  static create(id: PlannedFlowId, companyId: CompanyId, createdById: UserId, input: PlannedFlowInput, today: LocalDate): PlannedFlow {
    const label = cleanText(input.label);
    if (!label || label.length < 2) throw new DomainError('VALIDATION', 'Label required', { field: 'label' });
    if (!input.amount.isPositive()) throw new DomainError('INVALID_AMOUNT');
    if (input.recurrence === 'NONE' && input.expectedDate.isBefore(today)) {
      throw new DomainError('PLANNED_FLOW_PAST');
    }
    if (input.endDate && input.endDate.isBefore(input.expectedDate)) {
      throw new DomainError('INVALID_DATE', 'End date before start', { field: 'endDate' });
    }
    return new PlannedFlow(id, {
      companyId,
      createdById,
      direction: input.direction,
      amount: input.amount,
      expectedDate: input.expectedDate,
      label,
      recurrence: input.recurrence,
      endDate: input.recurrence === 'MONTHLY' ? (input.endDate ?? null) : null,
      cancelled: false,
    });
  }

  static restore(id: PlannedFlowId, props: PlannedFlowProps): PlannedFlow {
    return new PlannedFlow(id, { ...props });
  }

  cancel(): void {
    if (this.props.cancelled) throw new DomainError('CONFLICT', 'Already cancelled');
    this.props = { ...this.props, cancelled: true };
  }

  /**
   * Dates on which this flow occurs within [from, to] (inclusive).
   * MONTHLY keeps the day of month of `expectedDate` (clamped at month end).
   */
  occurrencesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
    if (this.props.cancelled) return [];
    const start = this.props.expectedDate;
    if (this.props.recurrence === 'NONE') {
      return start.isAfter(to) || start.isBefore(from) ? [] : [start];
    }
    const last = this.props.endDate && this.props.endDate.isBefore(to) ? this.props.endDate : to;
    const dates: LocalDate[] = [];
    for (let i = 0; ; i++) {
      const d = start.addMonths(i, start.day);
      if (d.isAfter(last)) break;
      if (!d.isBefore(from)) dates.push(d);
    }
    return dates;
  }

  get direction(): Direction {
    return this.props.direction;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get label(): string {
    return this.props.label;
  }
  get expectedDate(): LocalDate {
    return this.props.expectedDate;
  }
  get recurrence(): Recurrence {
    return this.props.recurrence;
  }
  get cancelled(): boolean {
    return this.props.cancelled;
  }
  get companyId(): CompanyId {
    return this.props.companyId;
  }

  snapshot(): Readonly<PlannedFlowProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}

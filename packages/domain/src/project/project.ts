import { DomainError } from '../shared/errors';
import { cleanText, type CompanyId, type InvoiceId, type PartyId, type ProjectId } from '../shared/id';
import { type LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';

/**
 * Sector feature — digital agency: client projects with a budget, payment milestones
 * (acomptes / jalons) that feed the forecast, and a profitability view.
 */
export const PROJECT_STATUSES = ['ACTIVE', 'CLOSED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Milestone {
  id: string;
  label: string;
  amount: Money;
  expectedDate: LocalDate;
  /** Set once the milestone has been invoiced: it then leaves the forecast (the invoice takes over). */
  invoiceId: InvoiceId | null;
}

export interface ProjectProps {
  companyId: CompanyId;
  clientId: PartyId;
  name: string;
  budget: Money;
  startDate: LocalDate;
  endDate: LocalDate | null;
  status: ProjectStatus;
  milestones: Milestone[];
}

export interface ProjectInput {
  clientId: PartyId;
  name: string;
  budget: Money;
  startDate: LocalDate;
  endDate?: LocalDate | null;
}

export interface Profitability {
  invoicedHT: Money;
  expenses: Money;
  margin: Money;
  /** margin / invoicedHT in basis points (null when nothing is invoiced). */
  marginRateBp: number | null;
  /** expenses / budget in basis points (null when budget is 0). */
  budgetConsumedBp: number | null;
}

function check(input: ProjectInput) {
  const name = cleanText(input.name);
  if (!name || name.length < 2) throw new DomainError('PROJECT_INVALID', 'Name required', { field: 'name' });
  if (input.budget.isNegative()) throw new DomainError('INVALID_AMOUNT');
  if (input.endDate && input.endDate.isBefore(input.startDate)) {
    throw new DomainError('INVALID_DATE', 'End before start', { field: 'endDate' });
  }
  return { name, clientId: input.clientId, budget: input.budget, startDate: input.startDate, endDate: input.endDate ?? null };
}

export class Project {
  private constructor(
    readonly id: ProjectId,
    private props: ProjectProps,
  ) {}

  static create(id: ProjectId, companyId: CompanyId, input: ProjectInput): Project {
    return new Project(id, { companyId, ...check(input), status: 'ACTIVE', milestones: [] });
  }

  static restore(id: ProjectId, props: ProjectProps): Project {
    return new Project(id, { ...props, milestones: props.milestones.map((m) => ({ ...m })) });
  }

  update(input: ProjectInput): void {
    this.assertActive();
    this.props = { ...this.props, ...check(input) };
  }

  addMilestone(m: { id: string; label: string; amount: Money; expectedDate: LocalDate }): void {
    this.assertActive();
    const label = cleanText(m.label);
    if (!label) throw new DomainError('PROJECT_INVALID', 'Milestone label required', { field: 'label' });
    if (!m.amount.isPositive()) throw new DomainError('INVALID_AMOUNT');
    this.props = {
      ...this.props,
      milestones: [...this.props.milestones, { id: m.id, label, amount: m.amount, expectedDate: m.expectedDate, invoiceId: null }],
    };
  }

  removeMilestone(milestoneId: string): void {
    const m = this.props.milestones.find((x) => x.id === milestoneId);
    if (!m) throw new DomainError('NOT_FOUND');
    if (m.invoiceId) throw new DomainError('CONFLICT', 'Milestone already invoiced');
    this.props = { ...this.props, milestones: this.props.milestones.filter((x) => x.id !== milestoneId) };
  }

  markMilestoneInvoiced(milestoneId: string, invoiceId: InvoiceId): void {
    const m = this.props.milestones.find((x) => x.id === milestoneId);
    if (!m) throw new DomainError('NOT_FOUND');
    if (m.invoiceId) throw new DomainError('CONFLICT', 'Milestone already invoiced');
    this.props = {
      ...this.props,
      milestones: this.props.milestones.map((x) => (x.id === milestoneId ? { ...x, invoiceId } : x)),
    };
  }

  close(): void {
    this.assertActive();
    this.props = { ...this.props, status: 'CLOSED' };
  }

  /** Milestones not yet invoiced: expected receipts for the forecast. */
  pendingMilestones(): Milestone[] {
    if (this.props.status === 'CLOSED') return [];
    return this.props.milestones.filter((m) => m.invoiceId === null);
  }

  private assertActive(): void {
    if (this.props.status !== 'ACTIVE') throw new DomainError('PROJECT_INVALID', 'Project closed');
  }

  get companyId(): CompanyId {
    return this.props.companyId;
  }
  get clientId(): PartyId {
    return this.props.clientId;
  }
  get name(): string {
    return this.props.name;
  }
  get budget(): Money {
    return this.props.budget;
  }
  get status(): ProjectStatus {
    return this.props.status;
  }
  get milestones(): readonly Milestone[] {
    return this.props.milestones;
  }

  snapshot(): Readonly<ProjectProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}

/** margin = invoiced HT (issued invoices) − committed expenses (approved or paid). */
export function computeProfitability(budget: Money, invoicedHT: Money, expenses: Money): Profitability {
  const margin = invoicedHT.subtract(expenses);
  return {
    invoicedHT,
    expenses,
    margin,
    marginRateBp: invoicedHT.isPositive() ? Math.round((margin.millimes * 10_000) / invoicedHT.millimes) : null,
    budgetConsumedBp: budget.isPositive() ? Math.round((expenses.millimes * 10_000) / budget.millimes) : null,
  };
}

import { type LocalDate } from '../shared/local-date';
import { type Money } from '../shared/money';

export type FlowKind = 'RECEIVABLE' | 'PAYABLE' | 'PLANNED' | 'MILESTONE' | 'ADJUSTMENT';

/** One dated, signed cash flow expected in the future. */
export interface Flow {
  /** Stable key: `invoice:<id>`, `expense:<id>`, `planned:<id>:<date>`, `milestone:<id>`, `sim:<n>`. */
  key: string;
  date: LocalDate;
  /** Signed: + receipt, − disbursement. */
  amount: Money;
  kind: FlowKind;
  label: string;
  /** The real due date was in the past and the flow was rolled to today. */
  overdue?: boolean;
  /** Submitted expense not yet approved ("en attente"). */
  pending?: boolean;
  /** Original date before any simulation shift. */
  originalDate?: LocalDate;
}

export type OverduePolicy = 'ROLL_TO_TODAY' | 'EXCLUDE';

export interface Assumptions {
  overduePolicy: OverduePolicy;
  includePendingExpenses: boolean;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  overduePolicy: 'ROLL_TO_TODAY',
  includePendingExpenses: true,
};

export const HORIZONS = [30, 60, 90] as const;
export type Horizon = (typeof HORIZONS)[number];

/** What the forecast needs, as read by the ForecastReadModel port. */
export interface ForecastData {
  realBalance: Money;
  receivables: { invoiceId: string; label: string; remaining: Money; dueDate: LocalDate }[];
  payables: { expenseId: string; label: string; amount: Money; dueDate: LocalDate; status: 'APPROVED' | 'SUBMITTED' }[];
  plannedFlows: {
    id: string;
    label: string;
    direction: 'IN' | 'OUT';
    amount: Money;
    occurrences: LocalDate[];
  }[];
  milestones: { id: string; label: string; amount: Money; expectedDate: LocalDate }[];
}

export interface ProjectionPoint {
  date: LocalDate;
  balance: Money;
  inflow: Money;
  outflow: Money;
  flowKeys: string[];
}

export interface Shortfall {
  from: LocalDate;
  to: LocalDate;
  minBalance: Money;
  days: number;
}

export interface Projection {
  from: LocalDate;
  horizon: number;
  realBalance: Money;
  points: ProjectionPoint[];
  endBalance: Money;
  min: { date: LocalDate; balance: Money };
  firstNegativeDate: LocalDate | null;
  shortfalls: Shortfall[];
  totals: { in: Money; out: Money };
  assumptions: Assumptions;
}

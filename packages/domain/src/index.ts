// Public API of @cashpilot/domain — pure TypeScript, zero dependencies.
export { DomainError, Forbidden, NotFound, isDomainError, ERROR_CODES, type ErrorCode, type ErrorDetails } from './shared/errors';
export { Money } from './shared/money';
export { LocalDate } from './shared/local-date';
export type {
  CompanyId,
  UserId,
  PartyId,
  InvoiceId,
  PaymentId,
  ExpenseId,
  MovementId,
  PlannedFlowId,
  ScenarioId,
  ProjectId,
} from './shared/id';

export {
  can,
  assertCan,
  ROLES,
  ROLE_LABELS,
  PERMISSION_MATRIX,
  type Role,
  type Permission,
  type AccessSubject,
  type OwnedResource,
} from './access/policy';

export { Company, slugify, SECTORS, SECTOR_LABELS, type Sector, type CompanyProps } from './company/company';
export { Membership, type MembershipProps } from './company/membership';

export { Party, PARTY_KINDS, type PartyKind, type PartyDetails, type PartyProps } from './party/party';

export {
  computeTotals,
  computeLine,
  VAT_RATES_BP,
  type LineInput,
  type InvoiceTotals,
  type VatBucket,
} from './invoice/totals';
export { InvoiceNumber } from './invoice/invoice-number';
export { Payment, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod, type PaymentProps } from './invoice/payment';
export {
  Invoice,
  INVOICE_STATUSES,
  type InvoiceStatus,
  type Settlement,
  type InvoiceLine,
  type InvoiceProps,
} from './invoice/invoice';

export {
  Expense,
  EXPENSE_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  RECEIPT_MIME_TYPES,
  RECEIPT_MAX_BYTES,
  assertValidReceipt,
  type ExpenseStatus,
  type ExpenseCategory,
  type ExpenseProps,
  type ExpenseDetails,
  type Receipt,
} from './expense/expense';

export {
  CashMovement,
  balanceOf,
  DIRECTIONS,
  MOVEMENT_SOURCES,
  type Direction,
  type MovementSource,
  type CashMovementProps,
} from './ledger/cash-movement';

export { PlannedFlow, RECURRENCES, type Recurrence, type PlannedFlowProps } from './planned-flow/planned-flow';

export {
  Project,
  computeProfitability,
  PROJECT_STATUSES,
  type ProjectStatus,
  type ProjectProps,
  type Milestone,
  type Profitability,
} from './project/project';

export * from './forecast/types';
export { buildBaselineFlows, project, explainPoint, runwayDays, findShortfalls, type PointExplanation } from './forecast/engine';
export { applyAdjustments, compareProjections, type Adjustment, type AdjustmentType, type Comparison } from './forecast/simulation';
export {
  toFlowDto,
  fromFlowDto,
  toProjectionDto,
  toComparisonDto,
  type FlowDto,
  type ProjectionDto,
  type ProjectionPointDto,
  type ComparisonDto,
} from './forecast/dto';

export { computeAlerts, DUE_SOON_DAYS, type Alert, type AlertKind, type AlertSeverity, type AlertInputs } from './alerts/alerts';

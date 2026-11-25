import {
  type CashMovement,
  type Company,
  type Direction,
  type Expense,
  type ExpenseStatus,
  type ForecastData,
  type Invoice,
  type InvoiceStatus,
  type LocalDate,
  type Membership,
  type Money,
  type MovementSource,
  type Party,
  type PartyKind,
  type PlannedFlow,
  type Project,
  type Role,
  type Adjustment,
  type Assumptions,
} from '@cashpilot/domain';

/*
 * Ports: what the use cases need from the outside world, named in business vocabulary.
 * Every repository method takes `companyId`: there is no query without a tenant.
 */

export interface Clock {
  /** Today's calendar date in the company timezone (Africa/Tunis). */
  today(): LocalDate;
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface CompanyRepository {
  byId(id: string): Promise<Company | null>;
  bySlug(slug: string): Promise<Company | null>;
  slugExists(slug: string): Promise<boolean>;
  save(company: Company): Promise<void>;
}

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface MembershipRepository {
  get(companyId: string, userId: string): Promise<Membership | null>;
  listByCompany(companyId: string): Promise<MemberView[]>;
  listByUser(userId: string): Promise<{ companyId: string; companyName: string; companySlug: string; role: Role }[]>;
  countOwners(companyId: string): Promise<number>;
  save(membership: Membership): Promise<void>;
  remove(companyId: string, userId: string): Promise<void>;
}

export interface UserView {
  id: string;
  name: string;
  email: string;
}

/** Read access to accounts created by the auth provider. */
export interface UserDirectory {
  byId(id: string): Promise<UserView | null>;
  byEmail(email: string): Promise<UserView | null>;
  namesByIds(ids: readonly string[]): Promise<Map<string, string>>;
}

export interface PartyFilter {
  kind?: PartyKind;
  includeArchived?: boolean;
}

export interface PartyRepository {
  byId(companyId: string, id: string): Promise<Party | null>;
  list(companyId: string, filter?: PartyFilter): Promise<Party[]>;
  save(party: Party): Promise<void>;
}

export interface InvoiceFilter {
  statuses?: InvoiceStatus[];
  clientId?: string;
  projectId?: string;
}

export interface InvoiceRepository {
  byId(companyId: string, id: string): Promise<Invoice | null>;
  list(companyId: string, filter?: InvoiceFilter): Promise<Invoice[]>;
  /** Upserts the invoice and its lines; appends new payments (payments are never updated). */
  save(invoice: Invoice): Promise<void>;
  /** Drafts only. */
  delete(companyId: string, id: string): Promise<void>;
  /** Atomically increments and returns the company's counter for `year` (gapless numbering). */
  nextNumber(companyId: string, year: number): Promise<number>;
}

export interface ExpenseFilter {
  submittedById?: string;
  statuses?: ExpenseStatus[];
  supplierId?: string;
  projectId?: string;
}

export interface ExpenseRepository {
  byId(companyId: string, id: string): Promise<Expense | null>;
  list(companyId: string, filter?: ExpenseFilter): Promise<Expense[]>;
  save(expense: Expense): Promise<void>;
}

export interface LedgerFilter {
  from?: LocalDate;
  to?: LocalDate;
  sourceType?: MovementSource;
  direction?: Direction;
}

export interface LedgerRow {
  movement: CashMovement;
  /** Real balance right after this movement (all movements, ordered by date then insertion). */
  balanceAfter: Money;
}

/** Append-only: there is deliberately no update and no delete. */
export interface LedgerRepository {
  /** Throws DomainError DUPLICATE_OPERATION when (sourceType, sourceId) already exists. */
  append(movement: CashMovement): Promise<void>;
  balanceAt(companyId: string, asOf?: LocalDate): Promise<Money>;
  /** Newest first, with the running balance after each row. */
  list(companyId: string, filter: LedgerFilter, page: { offset: number; limit: number }): Promise<{ rows: LedgerRow[]; total: number }>;
  between(companyId: string, from: LocalDate, to: LocalDate): Promise<CashMovement[]>;
}

export interface PlannedFlowRepository {
  byId(companyId: string, id: string): Promise<PlannedFlow | null>;
  list(companyId: string, opts?: { includeCancelled?: boolean }): Promise<PlannedFlow[]>;
  save(flow: PlannedFlow): Promise<void>;
}

/** A saved what-if scenario. Lives in its own table; never joined into real data. */
export interface ScenarioRecord {
  id: string;
  companyId: string;
  name: string;
  baseDate: LocalDate;
  horizonDays: number;
  assumptions: Assumptions;
  adjustments: Adjustment[];
  createdById: string;
  updatedAt: Date;
}

export interface ScenarioRepository {
  byId(companyId: string, id: string): Promise<ScenarioRecord | null>;
  list(companyId: string): Promise<ScenarioRecord[]>;
  save(scenario: ScenarioRecord): Promise<void>;
  delete(companyId: string, id: string): Promise<void>;
}

export interface ProjectRepository {
  byId(companyId: string, id: string): Promise<Project | null>;
  list(companyId: string, filter?: { clientId?: string }): Promise<Project[]>;
  save(project: Project): Promise<void>;
}

export interface AuditInput {
  companyId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditEntryView {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  at: string;
}

export interface AuditFilter {
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: LocalDate;
  to?: LocalDate;
}

export interface AuditLog {
  record(entry: AuditInput): Promise<void>;
  list(companyId: string, filter: AuditFilter, page: { offset: number; limit: number }): Promise<{ items: AuditEntryView[]; total: number }>;
}

export interface AlertDismissalRepository {
  keys(companyId: string, userId: string): Promise<Set<string>>;
  dismiss(companyId: string, userId: string, key: string): Promise<void>;
}

/** Repositories bound to one transaction. */
export interface Repositories {
  companies: CompanyRepository;
  memberships: MembershipRepository;
  users: UserDirectory;
  parties: PartyRepository;
  invoices: InvoiceRepository;
  expenses: ExpenseRepository;
  ledger: LedgerRepository;
  plannedFlows: PlannedFlowRepository;
  scenarios: ScenarioRepository;
  projects: ProjectRepository;
  audit: AuditLog;
  alertDismissals: AlertDismissalRepository;
}

export interface UnitOfWork {
  /** Runs `work` in one transaction: everything is committed together or nothing is. */
  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T>;
  /** Non-transactional reads. */
  read<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

/** Aggregated read port for the forecast engine. */
export interface ForecastReadModel {
  load(companyId: string, today: LocalDate, until: LocalDate): Promise<ForecastData>;
}

export interface StoredFile {
  bytes: Uint8Array;
  mimeType: string;
}

/** Private file storage (receipts). Keys are random; files are never public. */
export interface FileStorage {
  put(bytes: Uint8Array, mimeType: string): Promise<string>;
  get(key: string): Promise<StoredFile | null>;
}

export interface InvoicePdfData {
  company: { name: string };
  client: { name: string; address: string | null; taxId: string | null; email: string | null };
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  lines: { description: string; qtyHundredths: number; unitMillimes: number; vatRateBp: number; htMillimes: number }[];
  vatByRate: { rateBp: number; baseMillimes: number; vatMillimes: number }[];
  htMillimes: number;
  vatMillimes: number;
  stampDutyMillimes: number;
  totalMillimes: number;
  paidMillimes: number;
  remainingMillimes: number;
  cancelReason: string | null;
  notes: string | null;
}

export interface InvoicePdfRenderer {
  render(data: InvoicePdfData): Promise<Uint8Array>;
}

/** Reads the signed-in user from the request (implemented with Better Auth in infra). */
export interface SessionReader {
  currentUser(headers: Headers): Promise<UserView | null>;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

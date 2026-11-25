import {
  type CashMovement,
  Company,
  DomainError,
  Expense,
  Invoice,
  LocalDate,
  Membership,
  Money,
  Party,
  PlannedFlow,
  Project,
} from '@cashpilot/domain';
import {
  type AlertDismissalRepository,
  type AuditEntryView,
  type AuditFilter,
  type AuditInput,
  type AuditLog,
  type Clock,
  type FileStorage,
  type IdGenerator,
  type InvoicePdfData,
  type InvoicePdfRenderer,
  type LedgerFilter,
  type LedgerRepository,
  type LedgerRow,
  type Repositories,
  type ScenarioRecord,
  type StoredFile,
  type UnitOfWork,
  type UserView,
} from '../../src/ports';

/*
 * In-memory twins of every repository: used by application tests and by DEMO_IN_MEMORY=1.
 * The state is cloned at the start of each transaction and swapped in on commit,
 * so a throwing use case leaves nothing behind (same guarantee as Postgres).
 */

interface AuditRow extends AuditInput {
  id: string;
  at: Date;
}

export interface State {
  users: Map<string, UserView>;
  companies: Map<string, Company>;
  memberships: Map<string, Membership>; // key companyId:userId
  parties: Map<string, Party>;
  invoices: Map<string, Invoice>;
  counters: Map<string, number>; // key companyId:year
  expenses: Map<string, Expense>;
  movements: CashMovement[];
  plannedFlows: Map<string, PlannedFlow>;
  scenarios: Map<string, ScenarioRecord>;
  projects: Map<string, Project>;
  audit: AuditRow[];
  dismissals: Set<string>; // companyId:userId:key
}

export function emptyState(): State {
  return {
    users: new Map(),
    companies: new Map(),
    memberships: new Map(),
    parties: new Map(),
    invoices: new Map(),
    counters: new Map(),
    expenses: new Map(),
    movements: [],
    plannedFlows: new Map(),
    scenarios: new Map(),
    projects: new Map(),
    audit: [],
    dismissals: new Set(),
  };
}

const cloneMap = <T>(m: Map<string, T>, clone: (x: T) => T) => new Map([...m].map(([k, v]) => [k, clone(v)]));

/** Entities are re-created from their snapshot; Money/LocalDate/Payment are immutable and can be shared. */
function cloneState(s: State): State {
  return {
    users: new Map(s.users),
    companies: cloneMap(s.companies, (c) => Company.restore(c.id, c.snapshot())),
    memberships: cloneMap(s.memberships, (m) => Membership.restore(m.snapshot())),
    parties: cloneMap(s.parties, (p) => Party.restore(p.id, p.snapshot())),
    invoices: cloneMap(s.invoices, (i) => Invoice.restore(i.id, i.snapshot())),
    counters: new Map(s.counters),
    expenses: cloneMap(s.expenses, (e) => Expense.restore(e.id, e.snapshot())),
    movements: [...s.movements],
    plannedFlows: cloneMap(s.plannedFlows, (f) => PlannedFlow.restore(f.id, f.snapshot())),
    scenarios: cloneMap(s.scenarios, (x) => ({ ...x, adjustments: [...x.adjustments] })),
    projects: cloneMap(s.projects, (p) => Project.restore(p.id, p.snapshot())),
    audit: [...s.audit],
    dismissals: new Set(s.dismissals),
  };
}

class InMemoryLedger implements LedgerRepository {
  constructor(private readonly s: State) {}

  async append(m: CashMovement): Promise<void> {
    if (this.s.movements.some((x) => x.sourceType === m.sourceType && x.sourceId === m.sourceId)) {
      throw new DomainError('DUPLICATE_OPERATION', `${m.sourceType}:${m.sourceId} already recorded`);
    }
    this.s.movements.push(m);
  }

  private ordered(companyId: string): CashMovement[] {
    // insertion order is the tie-breaker within a day (like the `seq` column in Postgres)
    return this.s.movements
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.companyId === companyId)
      .sort((a, b) => a.m.date.compare(b.m.date) || a.i - b.i)
      .map(({ m }) => m);
  }

  async balanceAt(companyId: string, asOf?: LocalDate): Promise<Money> {
    return this.ordered(companyId)
      .filter((m) => !asOf || !m.date.isAfter(asOf))
      .reduce((acc, m) => acc.add(m.signedAmount()), Money.zero());
  }

  async list(companyId: string, f: LedgerFilter, page: { offset: number; limit: number }) {
    let running = Money.zero();
    const rows: LedgerRow[] = this.ordered(companyId).map((movement) => {
      running = running.add(movement.signedAmount());
      return { movement, balanceAfter: running };
    });
    const filtered = rows
      .filter(({ movement: m }) => (!f.from || !m.date.isBefore(f.from)) && (!f.to || !m.date.isAfter(f.to)))
      .filter(({ movement: m }) => (!f.sourceType || m.sourceType === f.sourceType) && (!f.direction || m.direction === f.direction))
      .reverse();
    return { rows: filtered.slice(page.offset, page.offset + page.limit), total: filtered.length };
  }

  async between(companyId: string, from: LocalDate, to: LocalDate) {
    return this.ordered(companyId).filter((m) => !m.date.isBefore(from) && !m.date.isAfter(to));
  }
}

class InMemoryAudit implements AuditLog {
  constructor(
    private readonly s: State,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async record(entry: AuditInput): Promise<void> {
    this.s.audit.push({
      ...entry,
      before: entry.before === undefined ? undefined : JSON.parse(JSON.stringify(entry.before)),
      after: entry.after === undefined ? undefined : JSON.parse(JSON.stringify(entry.after)),
      id: this.ids.next(),
      at: this.clock.now(),
    });
  }

  async list(companyId: string, f: AuditFilter, page: { offset: number; limit: number }) {
    const rows = this.s.audit
      .filter((a) => a.companyId === companyId)
      .filter((a) => (!f.actorId || a.actorId === f.actorId) && (!f.action || a.action.startsWith(f.action)))
      .filter((a) => !f.entityType || a.entityType === f.entityType)
      .filter((a) => {
        const day = LocalDate.fromInstant(a.at, 'Africa/Tunis');
        return (!f.from || !day.isBefore(f.from)) && (!f.to || !day.isAfter(f.to));
      })
      .reverse();
    const items: AuditEntryView[] = rows.slice(page.offset, page.offset + page.limit).map((a) => ({
      id: a.id,
      actorId: a.actorId,
      actorName: this.s.users.get(a.actorId)?.name ?? '—',
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      before: a.before ?? null,
      after: a.after ?? null,
      at: a.at.toISOString(),
    }));
    return { items, total: rows.length };
  }

  /** Test helper. */
  entries(companyId?: string): AuditRow[] {
    return this.s.audit.filter((a) => !companyId || a.companyId === companyId);
  }
}

class InMemoryDismissals implements AlertDismissalRepository {
  constructor(private readonly s: State) {}
  async keys(companyId: string, userId: string) {
    const prefix = `${companyId}:${userId}:`;
    return new Set([...this.s.dismissals].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
  }
  async dismiss(companyId: string, userId: string, key: string) {
    this.s.dismissals.add(`${companyId}:${userId}:${key}`);
  }
}

function repositories(s: State, ids: IdGenerator, clock: Clock): Repositories {
  const byCompany = <T extends { companyId: string }>(m: Map<string, T>, companyId: string) =>
    [...m.values()].filter((x) => x.companyId === companyId);
  const one = <T extends { companyId: string }>(m: Map<string, T>, companyId: string, id: string) => {
    const x = m.get(id);
    return x && x.companyId === companyId ? x : null; // tenant filter: another company's id → null
  };

  return {
    users: {
      byId: async (id) => s.users.get(id) ?? null,
      byEmail: async (email) => [...s.users.values()].find((u) => u.email === email.toLowerCase()) ?? null,
      namesByIds: async (list) => new Map(list.filter((id) => s.users.has(id)).map((id) => [id, s.users.get(id)!.name])),
    },
    companies: {
      byId: async (id) => s.companies.get(id) ?? null,
      bySlug: async (slug) => [...s.companies.values()].find((c) => c.slug === slug) ?? null,
      slugExists: async (slug) => [...s.companies.values()].some((c) => c.slug === slug),
      save: async (c) => void s.companies.set(c.id, c),
    },
    memberships: {
      get: async (companyId, userId) => s.memberships.get(`${companyId}:${userId}`) ?? null,
      listByCompany: async (companyId) =>
        [...s.memberships.values()]
          .filter((m) => m.companyId === companyId)
          .map((m) => {
            const u = s.users.get(m.userId);
            return { userId: m.userId, name: u?.name ?? '—', email: u?.email ?? '—', role: m.role };
          }),
      listByUser: async (userId) =>
        [...s.memberships.values()]
          .filter((m) => m.userId === userId)
          .map((m) => {
            const c = s.companies.get(m.companyId)!;
            return { companyId: c.id, companyName: c.name, companySlug: c.slug, role: m.role };
          }),
      countOwners: async (companyId) => [...s.memberships.values()].filter((m) => m.companyId === companyId && m.role === 'OWNER').length,
      save: async (m) => void s.memberships.set(`${m.companyId}:${m.userId}`, m),
      remove: async (companyId, userId) => void s.memberships.delete(`${companyId}:${userId}`),
    },
    parties: {
      byId: async (companyId, id) => one(s.parties, companyId, id),
      list: async (companyId, f = {}) =>
        byCompany(s.parties, companyId).filter((p) => (!f.kind || p.kind === f.kind) && (f.includeArchived || !p.archived)),
      save: async (p) => void s.parties.set(p.id, p),
    },
    invoices: {
      byId: async (companyId, id) => one(s.invoices, companyId, id),
      list: async (companyId, f = {}) =>
        byCompany(s.invoices, companyId).filter(
          (i) =>
            (!f.statuses || f.statuses.includes(i.status)) &&
            (!f.clientId || i.clientId === f.clientId) &&
            (!f.projectId || i.projectId === f.projectId),
        ),
      save: async (i) => void s.invoices.set(i.id, i),
      delete: async (companyId, id) => {
        if (one(s.invoices, companyId, id)) s.invoices.delete(id);
      },
      nextNumber: async (companyId, year) => {
        const key = `${companyId}:${year}`;
        const next = (s.counters.get(key) ?? 0) + 1;
        s.counters.set(key, next);
        return next;
      },
    },
    expenses: {
      byId: async (companyId, id) => one(s.expenses, companyId, id),
      list: async (companyId, f = {}) =>
        byCompany(s.expenses, companyId).filter(
          (e) =>
            (!f.submittedById || e.submittedById === f.submittedById) &&
            (!f.statuses || f.statuses.includes(e.status)) &&
            (!f.supplierId || e.supplierId === f.supplierId) &&
            (!f.projectId || e.projectId === f.projectId),
        ),
      save: async (e) => void s.expenses.set(e.id, e),
    },
    ledger: new InMemoryLedger(s),
    plannedFlows: {
      byId: async (companyId, id) => one(s.plannedFlows, companyId, id),
      list: async (companyId, o = {}) => byCompany(s.plannedFlows, companyId).filter((f) => o.includeCancelled || !f.cancelled),
      save: async (f) => void s.plannedFlows.set(f.id, f),
    },
    scenarios: {
      byId: async (companyId, id) => one(s.scenarios, companyId, id),
      list: async (companyId) => byCompany(s.scenarios, companyId),
      save: async (x) => void s.scenarios.set(x.id, x),
      delete: async (companyId, id) => {
        if (one(s.scenarios, companyId, id)) s.scenarios.delete(id);
      },
    },
    projects: {
      byId: async (companyId, id) => one(s.projects, companyId, id),
      list: async (companyId, f = {}) => byCompany(s.projects, companyId).filter((p) => !f.clientId || p.clientId === f.clientId),
      save: async (p) => void s.projects.set(p.id, p),
    },
    audit: new InMemoryAudit(s, ids, clock),
    alertDismissals: new InMemoryDismissals(s),
  };
}

export class InMemoryUnitOfWork implements UnitOfWork {
  state: State = emptyState();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** Transactions are serialised; the working copy replaces the state only on success. */
  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const draft = cloneState(this.state);
      const result = await work(repositories(draft, this.ids, this.clock));
      this.state = draft;
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  read<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return work(repositories(this.state, this.ids, this.clock));
  }

  /** Test/seed helper: registers an account as the auth provider would. */
  addUser(user: UserView): void {
    this.state.users.set(user.id, { ...user, email: user.email.toLowerCase() });
  }

  auditEntries(companyId?: string) {
    return this.state.audit.filter((a) => !companyId || a.companyId === companyId);
  }
}

export class FixedClock implements Clock {
  constructor(
    private current: LocalDate,
    private readonly instant: Date = new Date(`${current.toString()}T09:00:00Z`),
  ) {}
  today(): LocalDate {
    return this.current;
  }
  now(): Date {
    return this.instant;
  }
  set(date: LocalDate): void {
    this.current = date;
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  constructor(private readonly prefix = 'id') {}
  next(): string {
    this.n += 1;
    return `${this.prefix}-${String(this.n).padStart(4, '0')}`;
  }
}

export class InMemoryFileStorage implements FileStorage {
  readonly files = new Map<string, StoredFile>();
  private n = 0;
  async put(bytes: Uint8Array, mimeType: string): Promise<string> {
    const key = `file-${++this.n}-${Math.random().toString(36).slice(2, 10)}`;
    this.files.set(key, { bytes, mimeType });
    return key;
  }
  async get(key: string): Promise<StoredFile | null> {
    return this.files.get(key) ?? null;
  }
}

/** Produces a tiny text "PDF" — enough for tests and the in-memory demo without native deps. */
export class FakePdfRenderer implements InvoicePdfRenderer {
  readonly rendered: InvoicePdfData[] = [];
  async render(data: InvoicePdfData): Promise<Uint8Array> {
    this.rendered.push(data);
    return new TextEncoder().encode(`%PDF-FAKE ${data.number} ${data.status}`);
  }
}

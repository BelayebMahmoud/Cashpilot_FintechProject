import {
  assertCan,
  computeProfitability,
  DomainError,
  LocalDate,
  Money,
  NotFound,
  Project,
  type ProjectStatus,
} from '@cashpilot/domain';
import { type Repositories } from '../ports';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, matchesQuery, ok, type Result } from '../shared/result';
import { toInvoiceSummary, type InvoiceSummaryDto } from '../invoices/invoice-dto';
import { toExpenseDto, type ExpenseDto } from '../expenses/expense-dto';

/* Sector feature — digital agency: projects, milestones feeding the forecast, profitability. */

export interface ProjectSummaryDto {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  status: ProjectStatus;
  budgetMillimes: number;
  startDate: string;
  endDate: string | null;
  invoicedHTMillimes: number;
  expensesMillimes: number;
  marginMillimes: number;
  marginRateBp: number | null;
  budgetConsumedBp: number | null;
  pendingMilestonesMillimes: number;
}

export interface ProjectDetailDto extends ProjectSummaryDto {
  milestones: { id: string; label: string; amountMillimes: number; expectedDate: string; invoiceId: string | null }[];
  invoices: InvoiceSummaryDto[];
  expenses: ExpenseDto[];
}

async function summarize(r: Repositories, companyId: string, p: Project, clientName: string) {
  const [invoices, expenses] = await Promise.all([
    r.invoices.list(companyId, { projectId: p.id }),
    r.expenses.list(companyId, { projectId: p.id }),
  ]);
  const issued = invoices.filter((i) => i.status === 'ISSUED');
  const committed = expenses.filter((e) => e.status === 'APPROVED' || e.status === 'PAID');
  const profit = computeProfitability(
    p.budget,
    Money.ofMillimes(issued.reduce((s, i) => s + i.totals().htMillimes, 0)),
    Money.sum(committed.map((e) => e.amount)),
  );
  const s = p.snapshot();
  const summary: ProjectSummaryDto = {
    id: p.id,
    name: s.name,
    clientId: s.clientId,
    clientName,
    status: s.status,
    budgetMillimes: s.budget.millimes,
    startDate: s.startDate.toString(),
    endDate: s.endDate?.toString() ?? null,
    invoicedHTMillimes: profit.invoicedHT.millimes,
    expensesMillimes: profit.expenses.millimes,
    marginMillimes: profit.margin.millimes,
    marginRateBp: profit.marginRateBp,
    budgetConsumedBp: profit.budgetConsumedBp,
    pendingMilestonesMillimes: Money.sum(p.pendingMilestones().map((m) => m.amount)).millimes,
  };
  return { summary, invoices, expenses };
}

async function loadProject(r: Repositories, actor: Actor, id: string): Promise<Project> {
  const p = await r.projects.byId(actor.companyId, id);
  if (!p) throw new NotFound();
  return p;
}

function auditProject(tx: Repositories, actor: Actor, action: string, p: Project, extra?: unknown) {
  return tx.audit.record({
    companyId: actor.companyId,
    actorId: actor.userId,
    action,
    entityType: 'Project',
    entityId: p.id,
    after: { name: p.name, status: p.status, budgetMillimes: p.budget.millimes, ...((extra as object) ?? {}) },
  });
}

export interface ProjectInputDto {
  clientId: string;
  name: string;
  budgetMillimes: number;
  startDate: string;
  endDate?: string | null;
}

function toProjectInput(input: ProjectInputDto) {
  return {
    clientId: input.clientId,
    name: input.name,
    budget: Money.ofMillimes(input.budgetMillimes),
    startDate: LocalDate.parse(input.startDate),
    endDate: input.endDate ? LocalDate.parse(input.endDate) : null,
  };
}

async function checkClient(tx: Repositories, companyId: string, clientId: string) {
  const c = await tx.parties.byId(companyId, clientId);
  if (!c || c.kind !== 'CLIENT') throw new DomainError('PROJECT_INVALID', 'Unknown client', { field: 'clientId' });
}

export class CreateProject {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ProjectInputDto): Promise<Result<{ projectId: string }>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'project.write');
        await checkClient(tx, actor.companyId, input.clientId);
        const p = Project.create(this.deps.ids.next(), actor.companyId, toProjectInput(input));
        await tx.projects.save(p);
        await auditProject(tx, actor, 'project.created', p);
        return ok({ projectId: p.id });
      }),
    );
  }
}

export class UpdateProject {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ProjectInputDto & { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'project.write');
        const p = await loadProject(tx, actor, input.id);
        await checkClient(tx, actor.companyId, input.clientId);
        p.update(toProjectInput(input));
        await tx.projects.save(p);
        await auditProject(tx, actor, 'project.updated', p);
        return ok(undefined);
      }),
    );
  }
}

export class AddMilestone {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { projectId: string; label: string; amountMillimes: number; expectedDate: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'project.write');
        const p = await loadProject(tx, actor, input.projectId);
        p.addMilestone({
          id: this.deps.ids.next(),
          label: input.label,
          amount: Money.ofMillimes(input.amountMillimes),
          expectedDate: LocalDate.parse(input.expectedDate),
        });
        await tx.projects.save(p);
        await auditProject(tx, actor, 'project.milestoneAdded', p, { milestone: input.label, amountMillimes: input.amountMillimes });
        return ok(undefined);
      }),
    );
  }
}

export class RemoveMilestone {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { projectId: string; milestoneId: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'project.write');
        const p = await loadProject(tx, actor, input.projectId);
        p.removeMilestone(input.milestoneId);
        await tx.projects.save(p);
        await auditProject(tx, actor, 'project.milestoneRemoved', p, { milestoneId: input.milestoneId });
        return ok(undefined);
      }),
    );
  }
}

export class CloseProject {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'project.write');
        const p = await loadProject(tx, actor, input.id);
        p.close();
        await tx.projects.save(p);
        await auditProject(tx, actor, 'project.closed', p);
        return ok(undefined);
      }),
    );
  }
}

export class ListProjects {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { q?: string; status?: ProjectStatus } = {}): Promise<Result<ProjectSummaryDto[]>> {
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'project.read');
        const [projects, clients] = await Promise.all([
          r.projects.list(actor.companyId),
          r.parties.list(actor.companyId, { kind: 'CLIENT', includeArchived: true }),
        ]);
        const names = new Map(clients.map((c) => [c.id, c.name]));
        const rows = await Promise.all(projects.map(async (p) => (await summarize(r, actor.companyId, p, names.get(p.clientId) ?? '—')).summary));
        return ok(
          rows
            .filter((p) => (!input.status || p.status === input.status) && matchesQuery(input.q, p.name, p.clientName))
            .sort((a, b) => a.status.localeCompare(b.status) || b.startDate.localeCompare(a.startDate)),
        );
      }),
    );
  }
}

export class GetProject {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<ProjectDetailDto>> {
    const today = this.deps.clock.today();
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'project.read');
        const p = await loadProject(r, actor, input.id);
        const client = await r.parties.byId(actor.companyId, p.clientId);
        const clientName = client?.name ?? '—';
        const { summary, invoices, expenses } = await summarize(r, actor.companyId, p, clientName);
        const names = await r.users.namesByIds(expenses.map((e) => e.submittedById));
        return ok({
          ...summary,
          milestones: p.milestones.map((m) => ({
            id: m.id,
            label: m.label,
            amountMillimes: m.amount.millimes,
            expectedDate: m.expectedDate.toString(),
            invoiceId: m.invoiceId,
          })),
          invoices: invoices.map((i) => toInvoiceSummary(i, clientName, today)),
          expenses: expenses.map((e) => toExpenseDto(e, names)),
        });
      }),
    );
  }
}

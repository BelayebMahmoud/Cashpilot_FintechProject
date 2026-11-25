import {
  type ExpenseFilter,
  type ExpenseRepository,
  type PlannedFlowRepository,
  type ProjectRepository,
  type ScenarioRecord,
  type ScenarioRepository,
} from '@cashpilot/application';
import { Expense, PlannedFlow, Project, type Adjustment, type Assumptions } from '@cashpilot/domain';
import { type Prisma, type PrismaTx } from '@cashpilot/db';
import { fromDbDate, fromDbDateOrNull, toBigInt, toDbDate, toJson, toMoney } from '../mappers';

type ExpenseRow = Awaited<ReturnType<PrismaTx['expense']['findUniqueOrThrow']>>;

function expenseToDomain(r: ExpenseRow): Expense {
  return Expense.restore(r.id, {
    companyId: r.companyId,
    submittedById: r.submittedById,
    label: r.label,
    category: r.category,
    amount: toMoney(r.amountMillimes),
    expenseDate: fromDbDate(r.expenseDate),
    dueDate: fromDbDateOrNull(r.dueDate),
    supplierId: r.supplierId,
    projectId: r.projectId,
    note: r.note,
    receipt: r.receiptKey
      ? { key: r.receiptKey, fileName: r.receiptName ?? 'justificatif', mimeType: r.receiptMime ?? 'application/octet-stream', sizeBytes: r.receiptSize ?? 0 }
      : null,
    status: r.status,
    submittedAt: fromDbDateOrNull(r.submittedAt),
    decidedById: r.decidedById,
    decidedAt: fromDbDateOrNull(r.decidedAt),
    rejectReason: r.rejectReason,
    selfApproved: r.selfApproved,
    paymentRef: r.paymentRef,
    paidAt: fromDbDateOrNull(r.paidAt),
  });
}

export class PrismaExpenseRepository implements ExpenseRepository {
  constructor(
    private readonly db: PrismaTx,
    private readonly inTransaction: boolean,
  ) {}

  async byId(companyId: string, id: string) {
    if (this.inTransaction) {
      await this.db.$queryRaw`SELECT 1 FROM "Expense" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    }
    const r = await this.db.expense.findFirst({ where: { id, companyId } });
    return r ? expenseToDomain(r) : null;
  }

  async list(companyId: string, f: ExpenseFilter = {}) {
    const rows = await this.db.expense.findMany({
      where: {
        companyId,
        ...(f.submittedById ? { submittedById: f.submittedById } : {}),
        ...(f.statuses ? { status: { in: f.statuses } } : {}),
        ...(f.supplierId ? { supplierId: f.supplierId } : {}),
        ...(f.projectId ? { projectId: f.projectId } : {}),
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(expenseToDomain);
  }

  async save(e: Expense) {
    const s = e.snapshot();
    const data = {
      companyId: s.companyId,
      submittedById: s.submittedById,
      supplierId: s.supplierId,
      projectId: s.projectId,
      label: s.label,
      category: s.category,
      amountMillimes: toBigInt(s.amount),
      expenseDate: toDbDate(s.expenseDate),
      dueDate: s.dueDate ? toDbDate(s.dueDate) : null,
      note: s.note,
      receiptKey: s.receipt?.key ?? null,
      receiptName: s.receipt?.fileName ?? null,
      receiptMime: s.receipt?.mimeType ?? null,
      receiptSize: s.receipt?.sizeBytes ?? null,
      status: s.status,
      submittedAt: s.submittedAt ? toDbDate(s.submittedAt) : null,
      decidedById: s.decidedById,
      decidedAt: s.decidedAt ? toDbDate(s.decidedAt) : null,
      rejectReason: s.rejectReason,
      selfApproved: s.selfApproved,
      paymentRef: s.paymentRef,
      paidAt: s.paidAt ? toDbDate(s.paidAt) : null,
    };
    await this.db.expense.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
}

type PlannedFlowRow = Awaited<ReturnType<PrismaTx['plannedFlow']['findUniqueOrThrow']>>;

export function plannedFlowToDomain(r: PlannedFlowRow): PlannedFlow {
  return PlannedFlow.restore(r.id, {
    companyId: r.companyId,
    direction: r.direction,
    amount: toMoney(r.amountMillimes),
    expectedDate: fromDbDate(r.expectedDate),
    label: r.label,
    recurrence: r.recurrence,
    endDate: fromDbDateOrNull(r.endDate),
    cancelled: r.cancelled,
    createdById: r.createdById,
  });
}

export class PrismaPlannedFlowRepository implements PlannedFlowRepository {
  constructor(private readonly db: PrismaTx) {}

  async byId(companyId: string, id: string) {
    const r = await this.db.plannedFlow.findFirst({ where: { id, companyId } });
    return r ? plannedFlowToDomain(r) : null;
  }

  async list(companyId: string, o: { includeCancelled?: boolean } = {}) {
    const rows = await this.db.plannedFlow.findMany({
      where: { companyId, ...(o.includeCancelled ? {} : { cancelled: false }) },
      orderBy: { expectedDate: 'asc' },
    });
    return rows.map(plannedFlowToDomain);
  }

  async save(f: PlannedFlow) {
    const s = f.snapshot();
    const data = {
      companyId: s.companyId,
      direction: s.direction,
      amountMillimes: toBigInt(s.amount),
      expectedDate: toDbDate(s.expectedDate),
      label: s.label,
      recurrence: s.recurrence,
      endDate: s.endDate ? toDbDate(s.endDate) : null,
      cancelled: s.cancelled,
      createdById: s.createdById,
    };
    await this.db.plannedFlow.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
}

type ScenarioRow = Awaited<ReturnType<PrismaTx['scenario']['findUniqueOrThrow']>>;

function scenarioToRecord(r: ScenarioRow): ScenarioRecord {
  return {
    id: r.id,
    companyId: r.companyId,
    name: r.name,
    baseDate: fromDbDate(r.baseDate),
    horizonDays: r.horizonDays,
    assumptions: r.assumptions as unknown as Assumptions,
    adjustments: r.adjustments as unknown as Adjustment[],
    createdById: r.createdById,
    updatedAt: r.updatedAt,
  };
}

export class PrismaScenarioRepository implements ScenarioRepository {
  constructor(private readonly db: PrismaTx) {}

  async byId(companyId: string, id: string) {
    const r = await this.db.scenario.findFirst({ where: { id, companyId } });
    return r ? scenarioToRecord(r) : null;
  }

  async list(companyId: string) {
    const rows = await this.db.scenario.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' } });
    return rows.map(scenarioToRecord);
  }

  async save(s: ScenarioRecord) {
    const data = {
      companyId: s.companyId,
      name: s.name,
      baseDate: toDbDate(s.baseDate),
      horizonDays: s.horizonDays,
      assumptions: toJson(s.assumptions) as unknown as Prisma.InputJsonValue,
      adjustments: toJson(s.adjustments) as unknown as Prisma.InputJsonValue,
      createdById: s.createdById,
    };
    await this.db.scenario.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }

  async delete(companyId: string, id: string) {
    await this.db.scenario.deleteMany({ where: { id, companyId } });
  }
}

const projectInclude = { milestones: { orderBy: { position: 'asc' } } } satisfies Prisma.ProjectInclude;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function projectToDomain(r: ProjectRow): Project {
  return Project.restore(r.id, {
    companyId: r.companyId,
    clientId: r.clientId,
    name: r.name,
    budget: toMoney(r.budgetMillimes),
    startDate: fromDbDate(r.startDate),
    endDate: fromDbDateOrNull(r.endDate),
    status: r.status,
    milestones: r.milestones.map((m) => ({
      id: m.id,
      label: m.label,
      amount: toMoney(m.amountMillimes),
      expectedDate: fromDbDate(m.expectedDate),
      invoiceId: m.invoiceId,
    })),
  });
}

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly db: PrismaTx) {}

  async byId(companyId: string, id: string) {
    const r = await this.db.project.findFirst({ where: { id, companyId }, include: projectInclude });
    return r ? projectToDomain(r) : null;
  }

  async list(companyId: string, f: { clientId?: string } = {}) {
    const rows = await this.db.project.findMany({
      where: { companyId, ...(f.clientId ? { clientId: f.clientId } : {}) },
      include: projectInclude,
      orderBy: { startDate: 'desc' },
    });
    return rows.map(projectToDomain);
  }

  async save(p: Project) {
    const s = p.snapshot();
    const data = {
      companyId: s.companyId,
      clientId: s.clientId,
      name: s.name,
      budgetMillimes: toBigInt(s.budget),
      startDate: toDbDate(s.startDate),
      endDate: s.endDate ? toDbDate(s.endDate) : null,
      status: s.status,
    };
    await this.db.project.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
    await this.db.milestone.deleteMany({ where: { projectId: s.id } });
    if (s.milestones.length > 0) {
      await this.db.milestone.createMany({
        data: s.milestones.map((m, position) => ({
          id: m.id,
          projectId: s.id,
          position,
          label: m.label,
          amountMillimes: toBigInt(m.amount),
          expectedDate: toDbDate(m.expectedDate),
          invoiceId: m.invoiceId,
        })),
      });
    }
  }
}

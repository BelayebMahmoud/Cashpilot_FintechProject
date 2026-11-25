import {
  assertCan,
  DomainError,
  Invoice,
  InvoiceNumber,
  LocalDate,
  NotFound,
  type InvoiceLine,
  type InvoiceStatus,
  type Party,
} from '@cashpilot/domain';
import { type Repositories } from '../ports';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, fail, matchesQuery, ok, paginate, type Page, type Result } from '../shared/result';
import {
  invoiceAuditView,
  toInvoiceDetail,
  toInvoiceSummary,
  type InvoiceDetailDto,
  type InvoiceSummaryDto,
} from './invoice-dto';

export interface InvoiceLineInput {
  description: string;
  qtyHundredths: number;
  unitMillimes: number;
  vatRateBp: number;
}

export interface InvoiceDraftInput {
  clientId: string;
  issueDate: string;
  dueDate: string;
  lines: InvoiceLineInput[];
  notes?: string | null;
  projectId?: string | null;
  /** Sector feature: invoicing a project milestone marks it as invoiced (same transaction). */
  milestoneId?: string | null;
}

async function loadClient(tx: Repositories, companyId: string, clientId: string): Promise<Party> {
  const client = await tx.parties.byId(companyId, clientId);
  if (!client) throw new DomainError('INVOICE_CLIENT_INVALID');
  if (client.archived) throw new DomainError('PARTY_ARCHIVED');
  return client;
}

async function checkProject(tx: Repositories, companyId: string, projectId: string | null | undefined, clientId: string) {
  if (!projectId) return;
  const project = await tx.projects.byId(companyId, projectId);
  if (!project) throw new DomainError('PROJECT_INVALID', 'Unknown project');
  if (project.clientId !== clientId) throw new DomainError('PROJECT_INVALID', 'Project belongs to another client');
}

export class CreateInvoiceDraft {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: InvoiceDraftInput): Promise<Result<{ invoiceId: string }>> {
    const { ids } = this.deps;
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'invoice.write');
        const [client, company] = await Promise.all([
          loadClient(tx, actor.companyId, input.clientId),
          tx.companies.byId(actor.companyId),
        ]);
        if (!company) throw new NotFound();
        await checkProject(tx, actor.companyId, input.projectId, client.id);
        const lines: InvoiceLine[] = input.lines.map((l) => ({ ...l, id: ids.next() }));
        const invoice = Invoice.draft(ids.next(), {
          companyId: actor.companyId,
          clientId: client.id,
          clientKind: client.kind,
          projectId: input.projectId ?? null,
          issueDate: LocalDate.parse(input.issueDate),
          dueDate: LocalDate.parse(input.dueDate),
          lines,
          stampDuty: company.stampDuty,
          notes: input.notes ?? null,
        });
        await tx.invoices.save(invoice);
        if (input.projectId && input.milestoneId) {
          const project = await tx.projects.byId(actor.companyId, input.projectId);
          project!.markMilestoneInvoiced(input.milestoneId, invoice.id);
          await tx.projects.save(project!);
        }
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'invoice.draftCreated',
          entityType: 'Invoice',
          entityId: invoice.id,
          after: invoiceAuditView(invoice),
        });
        return ok({ invoiceId: invoice.id });
      }),
    );
  }
}

export class UpdateInvoiceDraft {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: InvoiceDraftInput & { id: string }): Promise<Result<{ invoiceId: string }>> {
    const { ids } = this.deps;
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'invoice.write');
        const invoice = await tx.invoices.byId(actor.companyId, input.id);
        if (!invoice) throw new NotFound();
        const client = await loadClient(tx, actor.companyId, input.clientId);
        await checkProject(tx, actor.companyId, input.projectId, client.id);
        const before = invoiceAuditView(invoice);
        invoice.updateDraft({
          clientId: client.id,
          clientKind: client.kind,
          projectId: input.projectId ?? null,
          issueDate: LocalDate.parse(input.issueDate),
          dueDate: LocalDate.parse(input.dueDate),
          lines: input.lines.map((l) => ({ ...l, id: ids.next() })),
          notes: input.notes ?? null,
        });
        await tx.invoices.save(invoice);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'invoice.draftUpdated',
          entityType: 'Invoice',
          entityId: invoice.id,
          before,
          after: invoiceAuditView(invoice),
        });
        return ok({ invoiceId: invoice.id });
      }),
    );
  }
}

export class DeleteInvoiceDraft {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'invoice.write');
        const invoice = await tx.invoices.byId(actor.companyId, input.id);
        if (!invoice) throw new NotFound();
        invoice.assertDeletable();
        await tx.invoices.delete(actor.companyId, invoice.id);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'invoice.draftDeleted',
          entityType: 'Invoice',
          entityId: invoice.id,
          before: invoiceAuditView(invoice),
        });
        return ok(undefined);
      }),
    );
  }
}

/** DRAFT → ISSUED. The gapless number comes from InvoiceCounter, incremented in the same transaction. */
export class ValidateInvoice {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<{ number: string }>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'invoice.write');
        const invoice = await tx.invoices.byId(actor.companyId, input.id);
        if (!invoice) throw new NotFound();
        if (invoice.status !== 'DRAFT') return fail('INVOICE_NOT_DRAFT');
        const year = invoice.issueDate.year;
        const sequence = await tx.invoices.nextNumber(actor.companyId, year);
        invoice.validate(InvoiceNumber.of(year, sequence));
        await tx.invoices.save(invoice);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'invoice.validated',
          entityType: 'Invoice',
          entityId: invoice.id,
          before: { status: 'DRAFT' },
          after: invoiceAuditView(invoice),
        });
        return ok({ number: invoice.number! });
      }),
    );
  }
}

export class CancelInvoice {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string; reason: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'invoice.write');
        const invoice = await tx.invoices.byId(actor.companyId, input.id);
        if (!invoice) throw new NotFound();
        const before = invoiceAuditView(invoice);
        invoice.cancel(input.reason);
        await tx.invoices.save(invoice);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'invoice.cancelled',
          entityType: 'Invoice',
          entityId: invoice.id,
          before,
          after: { ...invoiceAuditView(invoice), cancelReason: invoice.cancelReason },
        });
        return ok(undefined);
      }),
    );
  }
}

export const INVOICE_TABS = ['all', 'draft', 'receivable', 'overdue', 'paid', 'cancelled'] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];

export interface ListInvoicesInput {
  tab?: InvoiceTab;
  clientId?: string;
  q?: string;
  dueFrom?: string;
  dueTo?: string;
  page?: number;
}

export interface InvoiceListDto extends Page<InvoiceSummaryDto> {
  counts: Record<InvoiceTab, number>;
}

function inTab(i: InvoiceSummaryDto, tab: InvoiceTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'draft':
      return i.status === 'DRAFT';
    case 'receivable':
      return i.status === 'ISSUED' && i.remainingMillimes > 0;
    case 'overdue':
      return i.overdue;
    case 'paid':
      return i.status === 'ISSUED' && i.settlement === 'PAID';
    case 'cancelled':
      return i.status === 'CANCELLED';
  }
}

/**
 * Settlement and "overdue" are derived (never stored), so tab filtering happens here
 * on the company's invoices — fine at the scale of a small business.
 */
export class ListInvoices {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ListInvoicesInput = {}): Promise<Result<InvoiceListDto>> {
    const today = this.deps.clock.today();
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'invoice.read');
        const [invoices, clients] = await Promise.all([
          r.invoices.list(actor.companyId, input.clientId ? { clientId: input.clientId } : {}),
          r.parties.list(actor.companyId, { kind: 'CLIENT', includeArchived: true }),
        ]);
        const names = new Map(clients.map((c) => [c.id, c.name]));
        const rows = invoices
          .map((i) => toInvoiceSummary(i, names.get(i.clientId) ?? '—', today))
          .filter((i) => matchesQuery(input.q, i.number, i.clientName))
          .filter((i) => !input.dueFrom || i.dueDate >= input.dueFrom)
          .filter((i) => !input.dueTo || i.dueDate <= input.dueTo);
        const counts = Object.fromEntries(INVOICE_TABS.map((t) => [t, rows.filter((i) => inTab(i, t)).length])) as Record<
          InvoiceTab,
          number
        >;
        const tab = input.tab ?? 'all';
        const sorted = rows
          .filter((i) => inTab(i, tab))
          .sort((a, b) => (tab === 'overdue' || tab === 'receivable' ? a.dueDate.localeCompare(b.dueDate) : b.issueDate.localeCompare(a.issueDate) || (b.number ?? '').localeCompare(a.number ?? '')));
        return ok({ ...paginate(sorted, input.page), counts });
      }),
    );
  }
}

export class GetInvoice {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<InvoiceDetailDto>> {
    const today = this.deps.clock.today();
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        assertCan(actor, 'invoice.read');
        const invoice = await r.invoices.byId(actor.companyId, input.id);
        if (!invoice) throw new NotFound();
        const [client, names] = await Promise.all([
          r.parties.byId(actor.companyId, invoice.clientId),
          r.users.namesByIds(invoice.payments.map((p) => p.createdById)),
        ]);
        return ok(toInvoiceDetail(invoice, client?.name ?? '—', today, names));
      }),
    );
  }
}

/** PDF export of an ISSUED or CANCELLED invoice (a cancelled one carries an "ANNULÉE" watermark). */
export class RenderInvoicePdf {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<{ fileName: string; bytes: Uint8Array }>> {
    return attempt(async () => {
      const data = await this.deps.uow.read(async (r) => {
        assertCan(actor, 'invoice.read');
        const invoice = await r.invoices.byId(actor.companyId, input.id);
        if (!invoice) throw new NotFound();
        if (invoice.status === 'DRAFT') throw new DomainError('INVOICE_NOT_ISSUED');
        const [client, company] = await Promise.all([
          r.parties.byId(actor.companyId, invoice.clientId),
          r.companies.byId(actor.companyId),
        ]);
        const totals = invoice.totals();
        const c = client?.snapshot();
        return {
          company: { name: company?.name ?? '' },
          client: { name: c?.name ?? '—', address: c?.address ?? null, taxId: c?.taxId ?? null, email: c?.email ?? null },
          number: invoice.number!,
          status: invoice.status as InvoiceStatus,
          issueDate: invoice.issueDate.toString(),
          dueDate: invoice.dueDate.toString(),
          lines: invoice.lines.map((l, i) => ({
            description: l.description,
            qtyHundredths: l.qtyHundredths,
            unitMillimes: l.unitMillimes,
            vatRateBp: l.vatRateBp,
            htMillimes: totals.lines[i]?.htMillimes ?? 0,
          })),
          vatByRate: totals.vatByRate,
          htMillimes: totals.htMillimes,
          vatMillimes: totals.vatMillimes,
          stampDutyMillimes: totals.stampDutyMillimes,
          totalMillimes: totals.totalMillimes,
          paidMillimes: invoice.netPaid().millimes,
          remainingMillimes: invoice.remaining().millimes,
          cancelReason: invoice.cancelReason,
          notes: invoice.notes,
        };
      });
      const bytes = await this.deps.pdf.render(data);
      return ok({ fileName: `${data.number}.pdf`, bytes });
    });
  }
}

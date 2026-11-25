import { type Invoice, type InvoiceStatus, type LocalDate, type Settlement } from '@cashpilot/domain';

export interface InvoiceSummaryDto {
  id: string;
  number: string | null;
  clientId: string;
  clientName: string;
  status: InvoiceStatus;
  settlement: Settlement;
  issueDate: string;
  dueDate: string;
  totalMillimes: number;
  paidMillimes: number;
  remainingMillimes: number;
  overdue: boolean;
  daysOverdue: number;
}

export function toInvoiceSummary(inv: Invoice, clientName: string, today: LocalDate): InvoiceSummaryDto {
  return {
    id: inv.id,
    number: inv.number,
    clientId: inv.clientId,
    clientName,
    status: inv.status,
    settlement: inv.settlement(),
    issueDate: inv.issueDate.toString(),
    dueDate: inv.dueDate.toString(),
    totalMillimes: inv.total().millimes,
    paidMillimes: inv.netPaid().millimes,
    remainingMillimes: inv.remaining().millimes,
    overdue: inv.isOverdue(today),
    daysOverdue: inv.daysOverdue(today),
  };
}

export interface PaymentDto {
  id: string;
  date: string;
  amountMillimes: number;
  method: string;
  isReversal: boolean;
  reversesId: string | null;
  reversedById: string | null;
  reason: string | null;
  createdByName: string;
}

export interface InvoiceDetailDto extends InvoiceSummaryDto {
  projectId: string | null;
  notes: string | null;
  cancelReason: string | null;
  stampDutyMillimes: number;
  lines: { id: string; description: string; qtyHundredths: number; unitMillimes: number; vatRateBp: number; htMillimes: number }[];
  htMillimes: number;
  vatMillimes: number;
  vatByRate: { rateBp: number; baseMillimes: number; vatMillimes: number }[];
  payments: PaymentDto[];
}

export function toInvoiceDetail(
  inv: Invoice,
  clientName: string,
  today: LocalDate,
  userNames: Map<string, string>,
): InvoiceDetailDto {
  const totals = inv.totals();
  return {
    ...toInvoiceSummary(inv, clientName, today),
    projectId: inv.projectId,
    notes: inv.notes,
    cancelReason: inv.cancelReason,
    stampDutyMillimes: inv.stampDuty.millimes,
    lines: inv.lines.map((l, i) => ({
      id: l.id,
      description: l.description,
      qtyHundredths: l.qtyHundredths,
      unitMillimes: l.unitMillimes,
      vatRateBp: l.vatRateBp,
      htMillimes: totals.lines[i]?.htMillimes ?? 0,
    })),
    htMillimes: totals.htMillimes,
    vatMillimes: totals.vatMillimes,
    vatByRate: totals.vatByRate,
    payments: inv.payments.map((p) => ({
      id: p.id,
      date: p.date.toString(),
      amountMillimes: p.amount.millimes,
      method: p.method,
      isReversal: p.isReversal,
      reversesId: p.reversesId,
      reversedById: inv.payments.find((x) => x.reversesId === p.id)?.id ?? null,
      reason: p.reason,
      createdByName: userNames.get(p.createdById) ?? '—',
    })),
  };
}

/** Small JSON-safe view of an invoice for audit entries. */
export function invoiceAuditView(inv: Invoice) {
  return {
    number: inv.number,
    status: inv.status,
    clientId: inv.clientId,
    totalMillimes: inv.total().millimes,
    paidMillimes: inv.netPaid().millimes,
    dueDate: inv.dueDate.toString(),
  };
}

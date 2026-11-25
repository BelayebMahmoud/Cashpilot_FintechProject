import { type Expense, type ExpenseCategory, type ExpenseStatus } from '@cashpilot/domain';

export interface ExpenseDto {
  id: string;
  label: string;
  category: ExpenseCategory;
  amountMillimes: number;
  expenseDate: string;
  dueDate: string;
  supplierId: string | null;
  supplierName: string | null;
  projectId: string | null;
  note: string | null;
  status: ExpenseStatus;
  submittedById: string;
  submittedByName: string;
  submittedAt: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  selfApproved: boolean;
  paidAt: string | null;
  hasReceipt: boolean;
  receiptName: string | null;
  receiptMimeType: string | null;
}

export function toExpenseDto(e: Expense, userNames: Map<string, string>, supplierName: string | null = null): ExpenseDto {
  const s = e.snapshot();
  return {
    id: s.id,
    label: s.label,
    category: s.category,
    amountMillimes: s.amount.millimes,
    expenseDate: s.expenseDate.toString(),
    dueDate: e.effectiveDueDate().toString(),
    supplierId: s.supplierId,
    supplierName,
    projectId: s.projectId,
    note: s.note,
    status: s.status,
    submittedById: s.submittedById,
    submittedByName: userNames.get(s.submittedById) ?? '—',
    submittedAt: s.submittedAt?.toString() ?? null,
    decidedByName: s.decidedById ? (userNames.get(s.decidedById) ?? '—') : null,
    decidedAt: s.decidedAt?.toString() ?? null,
    rejectReason: s.rejectReason,
    selfApproved: s.selfApproved,
    paidAt: s.paidAt?.toString() ?? null,
    hasReceipt: !!s.receipt,
    receiptName: s.receipt?.fileName ?? null,
    receiptMimeType: s.receipt?.mimeType ?? null,
  };
}

export function expenseAuditView(e: Expense) {
  const s = e.snapshot();
  return {
    label: s.label,
    status: s.status,
    amountMillimes: s.amount.millimes,
    category: s.category,
    selfApproved: s.selfApproved,
    rejectReason: s.rejectReason,
    paymentRef: s.paymentRef,
  };
}

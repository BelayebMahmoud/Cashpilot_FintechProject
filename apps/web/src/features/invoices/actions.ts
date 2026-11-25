'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/container';
import { action } from '@/lib/action';
import { routes } from '@/lib/routes';
import { CancelInvoiceSchema, InvoiceDraftSchema, InvoiceIdSchema, RecordPaymentSchema, ReversePaymentSchema } from './schemas';

const touch = (company: string, id?: string) => {
  revalidatePath(`/${company}`, 'layout'); // balances, alerts, forecast all depend on invoices
  if (id) revalidatePath(routes.invoice(company, id));
};

export const saveInvoiceDraftAction = action(InvoiceDraftSchema, async (actor, data) => {
  const { useCases } = await container();
  const input = {
    clientId: data.clientId,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    notes: data.notes,
    projectId: data.projectId,
    milestoneId: data.milestoneId,
    lines: data.lines,
  };
  const r = data.id ? await useCases.updateInvoiceDraft.execute(actor, { id: data.id, ...input }) : await useCases.createInvoiceDraft.execute(actor, input);
  if (!r.ok) return r;
  touch(actor.companySlug, r.value.invoiceId);
  redirect(routes.invoice(actor.companySlug, r.value.invoiceId));
});

export const deleteInvoiceDraftAction = action(InvoiceIdSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.deleteInvoiceDraft.execute(actor, data);
  if (!r.ok) return r;
  touch(actor.companySlug);
  redirect(routes.invoices(actor.companySlug));
});

export const validateInvoiceAction = action(InvoiceIdSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.validateInvoice.execute(actor, data);
  if (r.ok) touch(actor.companySlug, data.id);
  return r;
});

export const cancelInvoiceAction = action(CancelInvoiceSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.cancelInvoice.execute(actor, data);
  if (r.ok) touch(actor.companySlug, data.id);
  return r;
});

export const recordPaymentAction = action(RecordPaymentSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.recordPayment.execute(actor, {
    invoiceId: data.invoiceId,
    amountMillimes: data.amount,
    date: data.date,
    method: data.method,
    ...(data.operationId ? { operationId: data.operationId } : {}),
  });
  if (r.ok) touch(actor.companySlug, data.invoiceId);
  return r;
});

export const reversePaymentAction = action(ReversePaymentSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.reversePayment.execute(actor, data);
  if (r.ok) touch(actor.companySlug, data.invoiceId);
  return r;
});

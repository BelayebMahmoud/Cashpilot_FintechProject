'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '@cashpilot/domain';
import { container } from '@/container';
import { action } from '@/lib/action';
import { routes } from '@/lib/routes';
import { DateSchema, IdSchema, OptionalDateSchema, OptionalText, PositiveMoneySchema, RequiredText } from '@/lib/schemas';

/** An empty file input still sends a 0-byte File: treat it as "no file". Size/MIME rules live in the domain. */
const OptionalFile = z
  .instanceof(File)
  .optional()
  .transform((f) => (f && f.size > 0 ? f : null));

const ExpenseSchema = z.object({
  label: RequiredText(2, 160, 'Libellé'),
  category: z.enum(EXPENSE_CATEGORIES, { error: 'Choisissez une catégorie' }),
  amount: PositiveMoneySchema,
  expenseDate: DateSchema,
  dueDate: OptionalDateSchema,
  supplierId: OptionalText(64),
  projectId: OptionalText(64),
  note: OptionalText(1000),
  receipt: OptionalFile,
  intent: z.enum(['submit', 'draft']).default('submit'),
});

async function toUpload(file: File | null) {
  return file ? { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name || 'justificatif', mimeType: file.type } : null;
}

const touch = (company: string) => revalidatePath(`/${company}`, 'layout');

export const createExpenseAction = action(ExpenseSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.createExpense.execute(actor, {
    label: data.label,
    category: data.category,
    amountMillimes: data.amount,
    expenseDate: data.expenseDate,
    dueDate: data.dueDate,
    supplierId: data.supplierId,
    projectId: data.projectId,
    note: data.note,
    receipt: await toUpload(data.receipt),
    submit: data.intent === 'submit',
  });
  if (!r.ok) return r;
  touch(actor.companySlug);
  redirect(routes.myExpenses(actor.companySlug, { created: data.intent }));
});

export const updateExpenseDraftAction = action(ExpenseSchema.extend({ id: IdSchema }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.updateExpenseDraft.execute(actor, {
    id: data.id,
    label: data.label,
    category: data.category,
    amountMillimes: data.amount,
    expenseDate: data.expenseDate,
    dueDate: data.dueDate,
    supplierId: data.supplierId,
    projectId: data.projectId,
    note: data.note,
    receipt: await toUpload(data.receipt),
  });
  if (!r.ok) return r;
  if (data.intent === 'submit') {
    const s = await useCases.submitExpense.execute(actor, { id: data.id });
    if (!s.ok) return s;
  }
  touch(actor.companySlug);
  redirect(routes.expense(actor.companySlug, data.id));
});

const IdOnly = z.object({ id: IdSchema });
const WithReason = z.object({ id: IdSchema, reason: z.string().trim().min(1, 'Motif obligatoire').max(500) });

export const submitExpenseAction = action(IdOnly, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.submitExpense.execute(actor, data);
  if (r.ok) touch(actor.companySlug);
  return r;
});

export const withdrawExpenseAction = action(IdOnly, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.withdrawExpense.execute(actor, data);
  if (r.ok) touch(actor.companySlug);
  return r;
});

export const approveExpenseAction = action(IdOnly, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.approveExpense.execute(actor, data);
  if (r.ok) touch(actor.companySlug);
  return r;
});

export const rejectExpenseAction = action(WithReason, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.rejectExpense.execute(actor, data);
  if (r.ok) touch(actor.companySlug);
  return r;
});

export const markExpensePaidAction = action(z.object({ id: IdSchema, date: DateSchema }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.markExpensePaid.execute(actor, data);
  if (r.ok) touch(actor.companySlug);
  return r;
});

export const reverseExpensePaymentAction = action(WithReason, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.reverseExpensePayment.execute(actor, data);
  if (r.ok) touch(actor.companySlug);
  return r;
});

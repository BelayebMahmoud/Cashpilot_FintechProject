import { z } from 'zod';
import { PAYMENT_METHODS, VAT_RATES_BP } from '@cashpilot/domain';
import { DateSchema, IdSchema, jsonField, OptionalText, parseAmountToMillimes, PositiveMoneySchema } from '@/lib/schemas';
import { parseQuantity } from './line-editor';

const LineSchema = z
  .object({
    description: z.string().trim().min(1, 'Désignation obligatoire').max(300),
    quantity: z.string(),
    unitPrice: z.string(),
    vatRateBp: z.number().refine((v) => (VAT_RATES_BP as readonly number[]).includes(v), 'Taux de TVA invalide'),
  })
  .transform((l, ctx) => {
    const qtyHundredths = parseQuantity(l.quantity);
    const unitMillimes = parseAmountToMillimes(l.unitPrice);
    if (qtyHundredths === null) ctx.addIssue({ code: 'custom', message: 'Quantité invalide (ex. 1 ou 1,5)' });
    if (unitMillimes === null || unitMillimes < 0) ctx.addIssue({ code: 'custom', message: 'Prix unitaire invalide' });
    return { description: l.description, qtyHundredths: qtyHundredths ?? 0, unitMillimes: unitMillimes ?? 0, vatRateBp: l.vatRateBp };
  });

export const InvoiceDraftSchema = z.object({
  id: z.string().optional(),
  clientId: z.string({ error: 'Choisissez un client' }).min(1, 'Choisissez un client'),
  issueDate: DateSchema,
  dueDate: DateSchema,
  notes: OptionalText(1000),
  projectId: OptionalText(64),
  milestoneId: OptionalText(64),
  lines: jsonField(z.array(LineSchema).min(1, 'Ajoutez au moins une ligne').max(100)),
});

export const InvoiceIdSchema = z.object({ id: IdSchema });
export const CancelInvoiceSchema = z.object({ id: IdSchema, reason: z.string().trim().min(1, 'Motif obligatoire').max(500) });

export const RecordPaymentSchema = z.object({
  invoiceId: IdSchema,
  amount: PositiveMoneySchema,
  date: DateSchema,
  method: z.enum(PAYMENT_METHODS),
  operationId: z.uuid().optional(),
});

export const ReversePaymentSchema = z.object({
  invoiceId: IdSchema,
  paymentId: IdSchema,
  reason: z.string().trim().min(1, 'Motif obligatoire').max(500),
});

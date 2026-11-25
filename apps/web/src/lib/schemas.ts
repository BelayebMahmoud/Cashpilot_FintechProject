import { z } from 'zod';

/*
 * Boundary schemas: they validate SHAPE only. Business rules (amount ≤ remaining,
 * due ≥ issue…) stay in the domain. Amounts arrive as typed strings and become millimes here.
 */

const AMOUNT = /^-?\d+(\.\d{1,3})?$/;

/** "1 234,5" → 1234500 (millimes, integer maths). */
export function parseAmountToMillimes(input: string): number | null {
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!AMOUNT.test(s)) return null;
  const negative = s.startsWith('-');
  const [i = '0', f = ''] = s.replace('-', '').split('.');
  const value = Number(i) * 1000 + Number(f.padEnd(3, '0'));
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

export const MoneyInputSchema = z
  .string({ error: 'Montant obligatoire' })
  .trim()
  .min(1, 'Montant obligatoire')
  .transform((s, ctx) => {
    const v = parseAmountToMillimes(s);
    if (v === null) {
      ctx.addIssue({ code: 'custom', message: 'Montant invalide (ex. 1 234,500)' });
      return z.NEVER;
    }
    return v;
  });

export const PositiveMoneySchema = MoneyInputSchema.refine((v) => v > 0, 'Le montant doit être positif');

export const DateSchema = z.string({ error: 'Date obligatoire' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide');

export const OptionalDateSchema = z
  .string()
  .optional()
  .transform((s) => (s && s.trim() ? s : null))
  .pipe(DateSchema.nullable());

export const IdSchema = z.string().min(1).max(64);

export const OptionalText = (max = 500) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : null));

export const RequiredText = (min: number, max: number, label: string) =>
  z.string({ error: `${label} obligatoire` }).trim().min(min, `${label} : au moins ${min} caractères`).max(max);

/** A field holding JSON (e.g. the invoice lines or the simulation adjustments). */
export function jsonField<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Données invalides' });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

export const CheckboxSchema = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
  .optional()
  .transform((v) => v === 'on' || v === 'true');

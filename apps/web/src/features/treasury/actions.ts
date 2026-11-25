'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DIRECTIONS } from '@cashpilot/domain';
import { container } from '@/container';
import { action } from '@/lib/action';
import { DateSchema, PositiveMoneySchema } from '@/lib/schemas';

const AdjustmentSchema = z.object({
  direction: z.enum(DIRECTIONS),
  amount: PositiveMoneySchema,
  date: DateSchema,
  reason: z.string().trim().min(1, 'Motif obligatoire').max(300),
});

export const recordAdjustmentAction = action(AdjustmentSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.recordAdjustment.execute(actor, { direction: data.direction, amountMillimes: data.amount, date: data.date, reason: data.reason });
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

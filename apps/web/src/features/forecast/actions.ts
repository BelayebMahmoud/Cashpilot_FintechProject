'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DIRECTIONS, RECURRENCES } from '@cashpilot/domain';
import { container } from '@/container';
import { action } from '@/lib/action';
import { DateSchema, IdSchema, OptionalDateSchema, PositiveMoneySchema, RequiredText } from '@/lib/schemas';

const PlannedFlowSchema = z.object({
  label: RequiredText(2, 120, 'Libellé'),
  direction: z.enum(DIRECTIONS),
  amount: PositiveMoneySchema,
  expectedDate: DateSchema,
  recurrence: z.enum(RECURRENCES),
  endDate: OptionalDateSchema,
});

export const createPlannedFlowAction = action(PlannedFlowSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.createPlannedFlow.execute(actor, {
    label: data.label,
    direction: data.direction,
    amountMillimes: data.amount,
    expectedDate: data.expectedDate,
    recurrence: data.recurrence,
    endDate: data.endDate,
  });
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

export const cancelPlannedFlowAction = action(z.object({ id: IdSchema }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.cancelPlannedFlow.execute(actor, data);
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

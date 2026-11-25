'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { container } from '@/container';
import { action } from '@/lib/action';
import { routes } from '@/lib/routes';
import { IdSchema, jsonField, RequiredText } from '@/lib/schemas';

const days = z.number().int().min(-365).max(365);
const AdjustmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DELAY_RECEIVABLE'), invoiceId: z.string().min(1), days }),
  z.object({ type: z.literal('SHIFT_PAYABLE'), expenseId: z.string().min(1), days }),
  z.object({ type: z.literal('ADD_INFLOW'), label: z.string().max(120), amountMillimes: z.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ type: z.literal('ADD_OUTFLOW'), label: z.string().max(120), amountMillimes: z.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ type: z.literal('EXCLUDE_FLOW'), flowKey: z.string().min(1).max(200) }),
]);

const SaveScenarioSchema = z.object({
  id: z.string().optional(),
  name: RequiredText(2, 120, 'Nom du scénario'),
  horizon: z.enum(['30', '60', '90']).transform((h) => Number(h) as 30 | 60 | 90),
  adjustments: jsonField(z.array(AdjustmentSchema).max(50)),
});

/** Saving recomputes the scenario on the server (validating every target). Real data is never written. */
export const saveScenarioAction = action(SaveScenarioSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.saveScenario.execute(actor, {
    ...(data.id ? { id: data.id } : {}),
    name: data.name,
    horizon: data.horizon,
    adjustments: data.adjustments,
  });
  if (!r.ok) return r;
  revalidatePath(routes.simulations(actor.companySlug));
  if (!data.id) redirect(routes.simulation(actor.companySlug, r.value.id));
  revalidatePath(routes.simulation(actor.companySlug, r.value.id));
  return r;
});

export const duplicateScenarioAction = action(z.object({ id: IdSchema }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.duplicateScenario.execute(actor, data);
  if (!r.ok) return r;
  revalidatePath(routes.simulations(actor.companySlug));
  redirect(routes.simulation(actor.companySlug, r.value.id));
});

export const deleteScenarioAction = action(z.object({ id: IdSchema }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.deleteScenario.execute(actor, data);
  if (!r.ok) return r;
  revalidatePath(routes.simulations(actor.companySlug));
  redirect(routes.simulations(actor.companySlug));
});

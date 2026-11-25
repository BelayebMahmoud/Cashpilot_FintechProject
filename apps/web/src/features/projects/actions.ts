'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { container } from '@/container';
import { action } from '@/lib/action';
import { routes } from '@/lib/routes';
import { DateSchema, IdSchema, MoneyInputSchema, OptionalDateSchema, PositiveMoneySchema, RequiredText } from '@/lib/schemas';

const ProjectSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().min(1, 'Choisissez un client'),
  name: RequiredText(2, 120, 'Nom du projet'),
  budget: MoneyInputSchema.refine((v) => v >= 0, 'Budget positif ou nul'),
  startDate: DateSchema,
  endDate: OptionalDateSchema,
});

export const saveProjectAction = action(ProjectSchema, async (actor, data) => {
  const { useCases } = await container();
  const input = { clientId: data.clientId, name: data.name, budgetMillimes: data.budget, startDate: data.startDate, endDate: data.endDate };
  if (data.id) {
    const r = await useCases.updateProject.execute(actor, { id: data.id, ...input });
    if (r.ok) revalidatePath(routes.project(actor.companySlug, data.id));
    return r;
  }
  const r = await useCases.createProject.execute(actor, input);
  if (!r.ok) return r;
  revalidatePath(routes.projects(actor.companySlug));
  redirect(routes.project(actor.companySlug, r.value.projectId));
});

export const addMilestoneAction = action(
  z.object({ projectId: IdSchema, label: RequiredText(1, 120, 'Libellé'), amount: PositiveMoneySchema, expectedDate: DateSchema }),
  async (actor, data) => {
    const { useCases } = await container();
    const r = await useCases.addMilestone.execute(actor, { projectId: data.projectId, label: data.label, amountMillimes: data.amount, expectedDate: data.expectedDate });
    if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
    return r;
  },
);

export const removeMilestoneAction = action(z.object({ projectId: IdSchema, milestoneId: IdSchema }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.removeMilestone.execute(actor, data);
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

export const closeProjectAction = action(z.object({ id: IdSchema }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.closeProject.execute(actor, data);
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { container } from '@/container';
import { action, formToObject, type ActionState } from '@/lib/action';
import { messageFor } from '@/lib/errors';
import { routes } from '@/lib/routes';
import { requireUser } from '@/lib/session';
import { AddMemberSchema, ChangeRoleSchema, CreateCompanySchema, RemoveMemberSchema, UpdateCompanySchema } from './schemas';

/** Onboarding: the signed-in user (no company yet) creates a company and becomes its OWNER. */
export async function createCompanyAction(_prev: ActionState<{ slug: string }>, formData: FormData): Promise<ActionState<{ slug: string }>> {
  const user = await requireUser();
  const parsed = CreateCompanySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION', message: messageFor('VALIDATION'), fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  }
  const { useCases } = await container();
  const r = await useCases.createCompany.execute(user.id, {
    name: parsed.data.name,
    sector: parsed.data.sector,
    openingBalanceMillimes: parsed.data.openingBalance,
    openingDate: parsed.data.openingDate,
  });
  if (!r.ok) {
    const field = typeof r.details?.field === 'string' ? r.details.field : r.code === 'INVALID_DATE' ? 'openingDate' : null;
    return { ok: false, code: r.code, message: messageFor(r.code, r.details), ...(field ? { fieldErrors: { [field]: [messageFor(r.code)] } } : {}) };
  }
  redirect(routes.dashboard(r.value.slug));
}

export const updateCompanyAction = action(UpdateCompanySchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.updateCompanySettings.execute(actor, { name: data.name, sector: data.sector, stampDutyMillimes: data.stampDuty });
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

export const addMemberAction = action(AddMemberSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.addMember.execute(actor, data);
  if (r.ok) revalidatePath(routes.members(actor.companySlug));
  return r;
});

export const changeRoleAction = action(ChangeRoleSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.changeRole.execute(actor, data);
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

export const removeMemberAction = action(RemoveMemberSchema, async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.removeMember.execute(actor, data);
  if (r.ok) revalidatePath(routes.members(actor.companySlug));
  return r;
});

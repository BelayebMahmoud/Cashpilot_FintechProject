'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { container } from '@/container';
import { action } from '@/lib/action';

export const dismissAlertAction = action(z.object({ key: z.string().min(1).max(200) }), async (actor, data) => {
  const { useCases } = await container();
  const r = await useCases.dismissAlert.execute(actor, data);
  if (r.ok) revalidatePath(`/${actor.companySlug}`, 'layout');
  return r;
});

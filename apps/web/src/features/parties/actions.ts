'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PARTY_KINDS } from '@cashpilot/domain';
import { container } from '@/container';
import { action } from '@/lib/action';
import { OptionalText, RequiredText } from '@/lib/schemas';

const PartySchema = z.object({
  id: z.string().optional(),
  kind: z.enum(PARTY_KINDS),
  name: RequiredText(2, 120, 'Nom'),
  email: OptionalText(160),
  phone: OptionalText(30),
  address: OptionalText(300),
  taxId: OptionalText(40),
  notes: OptionalText(1000),
});

const base = (kind: string, company: string) => `/${company}/${kind === 'CLIENT' ? 'clients' : 'suppliers'}`;

export const savePartyAction = action(PartySchema, async (actor, data) => {
  const { useCases } = await container();
  const { id, ...details } = data;
  const r = id ? await useCases.updateParty.execute(actor, { id, ...details }) : await useCases.createParty.execute(actor, details);
  if (r.ok) revalidatePath(base(data.kind, actor.companySlug), 'layout');
  return r;
});

export const archivePartyAction = action(
  z.object({ id: z.string().min(1), kind: z.enum(PARTY_KINDS), archived: z.enum(['true', 'false']).transform((v) => v === 'true') }),
  async (actor, data) => {
    const { useCases } = await container();
    const r = await useCases.archiveParty.execute(actor, { id: data.id, archived: data.archived });
    if (r.ok) revalidatePath(base(data.kind, actor.companySlug), 'layout');
    return r;
  },
);

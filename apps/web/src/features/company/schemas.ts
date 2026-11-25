import { z } from 'zod';
import { ROLES, SECTORS } from '@cashpilot/domain';
import { DateSchema, MoneyInputSchema, RequiredText } from '@/lib/schemas';

export const CreateCompanySchema = z.object({
  name: RequiredText(2, 80, 'Nom'),
  sector: z.enum(SECTORS, { error: 'Choisissez un secteur' }),
  openingBalance: MoneyInputSchema,
  openingDate: DateSchema,
});

export const UpdateCompanySchema = z.object({
  name: RequiredText(2, 80, 'Nom'),
  sector: z.enum(SECTORS),
  stampDuty: MoneyInputSchema.refine((v) => v >= 0, 'Montant positif ou nul'),
});

export const AddMemberSchema = z.object({
  email: z.email('E-mail invalide').trim().toLowerCase(),
  role: z.enum(ROLES),
});

export const ChangeRoleSchema = z.object({ userId: z.string().min(1), role: z.enum(ROLES) });
export const RemoveMemberSchema = z.object({ userId: z.string().min(1) });

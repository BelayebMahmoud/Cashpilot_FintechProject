import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { type Actor, type Result } from '@cashpilot/application';
import { type ErrorCode } from '@cashpilot/domain';
import { container } from '@/container';
import { getActor } from './session';
import { messageFor } from './errors';
import { type ActionState } from './action-state';

export type { ActionState } from './action-state';

const CompanyField = z.object({ company: z.string().min(1).max(64) });

/**
 * Wraps every server action (the only entry point for mutations from the UI):
 *  1. actor = session + membership of the company in the form (otherwise redirect / 404)
 *  2. zod safeParse of the form → { ok:false, fieldErrors } on invalid shape
 *  3. runs the use case (which checks permissions, tenant, transaction, audit)
 *  4. maps DomainError codes to French messages; unexpected errors go to error.tsx + logs
 */
export function action<S extends z.ZodType, T>(
  schema: S,
  handler: (actor: Actor, data: z.output<S>) => Promise<Result<T>>,
): (prev: ActionState<unknown>, formData: FormData) => Promise<ActionState<T>> {
  return async (_prev, formData) => {
    const company = CompanyField.safeParse({ company: formData.get('company') });
    if (!company.success) return { ok: false, code: 'VALIDATION', message: messageFor('VALIDATION') };
    const actor = await getActor(company.data.company);

    const parsed = schema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: messageFor('VALIDATION'),
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      };
    }

    try {
      const result = await handler(actor, parsed.data);
      if (result.ok) return { ok: true, value: result.value };
      return failure(result.code, result.details);
    } catch (e) {
      unstable_rethrow(e); // redirect() / notFound() keep working
      const { logger } = await container();
      logger.error('action.failed', { company: actor.companySlug, userId: actor.userId, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  };
}

function failure<T>(code: ErrorCode, details?: Record<string, string | number>): ActionState<T> {
  const message = messageFor(code, details);
  const field = typeof details?.field === 'string' ? details.field : null;
  return { ok: false, code, message, ...(field ? { fieldErrors: { [field]: [message] } } : {}) };
}

/** FormData → plain object; repeated keys become arrays, File entries are kept. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('$ACTION')) continue;
    const current = out[key];
    out[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return out;
}

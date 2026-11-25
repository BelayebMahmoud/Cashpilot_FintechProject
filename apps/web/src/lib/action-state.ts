import { type ErrorCode } from '@cashpilot/domain';

/** What a server action returns to `useActionState` (serializable). `null` = not submitted yet. */
export type ActionState<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> }
  | null;

export function fieldError(state: ActionState<unknown>, field: string): string | undefined {
  return state && !state.ok ? state.fieldErrors?.[field]?.[0] : undefined;
}

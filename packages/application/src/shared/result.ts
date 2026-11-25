import { isDomainError, type ErrorCode, type ErrorDetails } from '@cashpilot/domain';

/** Serializable outcome of every use case: server actions return it as-is to the client. */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message?: string; details?: ErrorDetails };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(code: ErrorCode, message?: string, details?: ErrorDetails): Result<T> {
  return { ok: false, code, ...(message ? { message } : {}), ...(details ? { details } : {}) };
}

/**
 * Runs a use case body and turns thrown DomainErrors (invariants, Forbidden, NotFound)
 * into a failed Result. Because the throw happens inside `uow.run`, the transaction is
 * rolled back first. Unexpected errors are rethrown (→ error.tsx + logs).
 */
export async function attempt<T>(body: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await body();
  } catch (e) {
    if (isDomainError(e)) return fail(e.code, e.message, e.details);
    throw e;
  }
}

/** Unwraps a Result in tests and scripts. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`Expected ok, got ${r.code}${r.message ? `: ${r.message}` : ''}`);
  return r.value;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const PAGE_SIZE = 25;

export function paginate<T>(all: readonly T[], page = 1, pageSize = PAGE_SIZE): Page<T> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const start = (safePage - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), total: all.length, page: safePage, pageSize };
}

/** Case- and accent-insensitive "contains" used by list searches. */
export function matchesQuery(q: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!q?.trim()) return true;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const needle = norm(q.trim());
  return fields.some((f) => f && norm(f).includes(needle));
}

/**
 * Every business error has a stable code. The web layer maps each code to a
 * French message (apps/web/src/lib/errors.ts); the domain never formats text for users.
 */
export const ERROR_CODES = [
  'NOT_FOUND',
  'FORBIDDEN',
  'VALIDATION',
  'CONFLICT',
  'INVALID_AMOUNT',
  'INVALID_DATE',
  'REASON_REQUIRED',
  // company & access
  'SLUG_TAKEN',
  'LAST_OWNER',
  'ALREADY_MEMBER',
  'USER_NOT_FOUND',
  // parties
  'PARTY_INVALID',
  'PARTY_ARCHIVED',
  // invoices & payments
  'INVOICE_NOT_DRAFT',
  'INVOICE_NOT_ISSUED',
  'INVOICE_EMPTY',
  'INVOICE_DUE_BEFORE_ISSUE',
  'INVOICE_CLIENT_INVALID',
  'INVOICE_HAS_PAYMENTS',
  'INVOICE_OVERPAID',
  'PAYMENT_IN_FUTURE',
  'PAYMENT_BEFORE_ISSUE',
  'PAYMENT_ALREADY_REVERSED',
  'PAYMENT_IS_REVERSAL',
  // expenses
  'EXPENSE_INVALID_TRANSITION',
  'EXPENSE_NOT_APPROVED',
  'EXPENSE_RECEIPT_REQUIRED',
  'RECEIPT_INVALID_TYPE',
  'RECEIPT_TOO_LARGE',
  // ledger & forecast
  'MOVEMENT_BEFORE_OPENING',
  'DUPLICATE_OPERATION',
  'PLANNED_FLOW_PAST',
  'ADJUSTMENT_TARGET_NOT_FOUND',
  // sector module
  'PROJECT_INVALID',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorDetails = Record<string, string | number>;

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: ErrorDetails,
  ) {
    super(message ?? code);
    this.name = 'DomainError';
  }
}

export class Forbidden extends DomainError {
  constructor(message = 'Action not permitted for this role') {
    super('FORBIDDEN', message);
    this.name = 'Forbidden';
  }
}

export class NotFound extends DomainError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message);
    this.name = 'NotFound';
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

/** Throws a DomainError when `condition` is false. Keeps invariant checks to one line. */
export function invariant(
  condition: unknown,
  code: ErrorCode,
  details?: ErrorDetails,
): asserts condition {
  if (!condition) throw new DomainError(code, code, details);
}

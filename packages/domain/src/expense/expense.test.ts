import { describe, expect, it } from 'vitest';
import { DomainError, type ErrorCode } from '../shared/errors';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { assertValidReceipt, Expense, RECEIPT_MAX_BYTES } from './expense';

const today = LocalDate.parse('2026-12-01');
const receipt = { key: 'k', fileName: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 1000 };

function draft(submitter = 'emp') {
  return Expense.draft('e1', 'c1', submitter, {
    label: 'Licences',
    category: 'SOFTWARE',
    amount: Money.dinars(6000),
    expenseDate: today,
    dueDate: today.addDays(15),
  });
}

function submitted(submitter = 'emp') {
  const e = draft(submitter);
  e.attachReceipt(receipt);
  e.submit(today);
  return e;
}

function codeOf(fn: () => unknown): ErrorCode | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return undefined;
}

describe('Expense state machine', () => {
  it('validates details', () => {
    expect(
      codeOf(() => Expense.draft('e', 'c', 'u', { label: 'x', category: 'OTHER', amount: Money.dinars(1), expenseDate: today })),
    ).toBe('VALIDATION');
    expect(
      codeOf(() => Expense.draft('e', 'c', 'u', { label: 'ok', category: 'OTHER', amount: Money.zero(), expenseDate: today })),
    ).toBe('INVALID_AMOUNT');
    expect(
      codeOf(() =>
        Expense.draft('e', 'c', 'u', { label: 'ok', category: 'OTHER', amount: Money.dinars(1), expenseDate: today, dueDate: today.addDays(-1) }),
      ),
    ).toBe('INVALID_DATE');
  });

  it('submit requires a receipt', () => {
    expect(codeOf(() => draft().submit(today))).toBe('EXPENSE_RECEIPT_REQUIRED');
    expect(submitted().status).toBe('SUBMITTED');
  });

  it('a submitter can withdraw before any decision, then edit', () => {
    const e = submitted();
    e.withdraw();
    expect(e.status).toBe('DRAFT');
    e.updateDraft({ label: 'Licences 2', category: 'SOFTWARE', amount: Money.dinars(10), expenseDate: today });
    expect(e.label).toBe('Licences 2');
    expect(e.effectiveDueDate().equals(today)).toBe(true); // dueDate defaults to expenseDate
  });

  it('approve → pay → reverse payment → APPROVED again', () => {
    const e = submitted();
    e.approve('owner', today);
    expect(e.status).toBe('APPROVED');
    expect(e.selfApproved).toBe(false);
    e.markPaid('ref1', today, today);
    expect(e.status).toBe('PAID');
    expect(e.paymentRef).toBe('ref1');
    expect(e.reversePayment()).toBe('ref1');
    expect(e.status).toBe('APPROVED');
    expect(e.paymentRef).toBeNull();
  });

  it('self-approval is allowed and flagged', () => {
    const e = submitted('owner');
    e.approve('owner', today);
    expect(e.selfApproved).toBe(true);
  });

  it('a reason is required to reject', () => {
    const e = submitted();
    expect(codeOf(() => e.reject('owner', ' ', today))).toBe('REASON_REQUIRED');
    e.reject('owner', 'Hors budget', today);
    expect(e.status).toBe('REJECTED');
    expect(e.snapshot().rejectReason).toBe('Hors budget');
  });

  it('REJECTED expense cannot be marked paid', () => {
    const e = submitted();
    e.reject('owner', 'Hors budget', today);
    expect(codeOf(() => e.markPaid('ref', today, today))).toBe('EXPENSE_NOT_APPROVED');
    expect(codeOf(() => e.approve('owner', today))).toBe('EXPENSE_INVALID_TRANSITION');
    expect(codeOf(() => e.withdraw())).toBe('EXPENSE_INVALID_TRANSITION');
  });

  it('a SUBMITTED or DRAFT expense cannot be paid, nor paid in the future', () => {
    expect(codeOf(() => submitted().markPaid('r', today, today))).toBe('EXPENSE_NOT_APPROVED');
    expect(codeOf(() => draft().markPaid('r', today, today))).toBe('EXPENSE_NOT_APPROVED');
    const e = submitted();
    e.approve('owner', today);
    expect(codeOf(() => e.markPaid('r', today.addDays(1), today))).toBe('PAYMENT_IN_FUTURE');
    expect(codeOf(() => e.reversePayment())).toBe('EXPENSE_INVALID_TRANSITION');
  });

  it('cannot edit or attach after submission', () => {
    const e = submitted();
    expect(codeOf(() => e.attachReceipt(receipt))).toBe('EXPENSE_INVALID_TRANSITION');
    expect(codeOf(() => e.updateDraft({ label: 'xx', category: 'OTHER', amount: Money.dinars(1), expenseDate: today }))).toBe(
      'EXPENSE_INVALID_TRANSITION',
    );
  });
});

describe('receipt validation', () => {
  it.each(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])('accepts %s', (mimeType) => {
    expect(() => assertValidReceipt({ mimeType, sizeBytes: 100 })).not.toThrow();
  });

  it('an invalid file type or size is refused', () => {
    expect(codeOf(() => assertValidReceipt({ mimeType: 'text/html', sizeBytes: 100 }))).toBe('RECEIPT_INVALID_TYPE');
    expect(codeOf(() => assertValidReceipt({ mimeType: 'image/png', sizeBytes: RECEIPT_MAX_BYTES + 1 }))).toBe('RECEIPT_TOO_LARGE');
    expect(codeOf(() => assertValidReceipt({ mimeType: 'image/png', sizeBytes: 0 }))).toBe('RECEIPT_TOO_LARGE');
    expect(() => assertValidReceipt({ mimeType: 'image/png', sizeBytes: RECEIPT_MAX_BYTES })).not.toThrow();
  });
});

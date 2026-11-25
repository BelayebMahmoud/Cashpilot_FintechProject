import { describe, expect, it } from 'vitest';
import { Company } from '../company/company';
import { Expense } from '../expense/expense';
import { Payment } from '../invoice/payment';
import { DomainError } from '../shared/errors';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { balanceOf, CashMovement } from './cash-movement';

const d = LocalDate.parse;
const opening = d('2026-11-01');
const today = d('2026-12-01');

const company = Company.create(
  'c1',
  { name: 'Atlas', slug: 'atlas', sector: 'DIGITAL_AGENCY', openingBalance: Money.dinars(5000), openingDate: opening },
  today,
);

function payment(id: string, amount: number, reversesId: string | null = null) {
  return Payment.create(id, {
    invoiceId: 'inv1',
    amount: Money.dinars(amount),
    date: today,
    method: 'TRANSFER',
    reversesId,
    reason: reversesId ? 'erreur' : null,
    createdById: 'u1',
  });
}

describe('CashMovement', () => {
  it('opening movement uses sourceId = companyId and the opening date', () => {
    const m = CashMovement.fromOpening('m0', company, 'u1')!;
    expect(m.sourceType).toBe('OPENING');
    expect(m.sourceId).toBe('c1');
    expect(m.date.equals(opening)).toBe(true);
    expect(m.direction).toBe('IN');
  });

  it('a zero opening balance creates no movement; a negative one is OUT', () => {
    const zero = Company.create('c2', { ...company.snapshot(), slug: 'z', openingBalance: Money.zero() }, today);
    expect(CashMovement.fromOpening('m', zero, 'u1')).toBeNull();
    const neg = Company.create('c3', { ...company.snapshot(), slug: 'n', openingBalance: Money.dinars(-100) }, today);
    expect(CashMovement.fromOpening('m', neg, 'u1')!.signedAmount().millimes).toBe(-100_000);
  });

  it('balance after opening + 2 payments + 1 reversal + 1 expense paid + 1 adjustment equals the hand-computed value', () => {
    const expense = Expense.draft('e1', 'c1', 'u1', { label: 'Loyer', category: 'RENT', amount: Money.dinars(1200), expenseDate: today });
    const movements = [
      CashMovement.fromOpening('m0', company, 'u1')!, // +5 000
      CashMovement.fromPayment('m1', 'c1', payment('p1', 1000), 'FAC-1', opening), // +1 000
      CashMovement.fromPayment('m2', 'c1', payment('p2', 500), 'FAC-1', opening), // +500
      CashMovement.fromPayment('m3', 'c1', payment('r1', 500, 'p2'), 'FAC-1', opening), // −500
      CashMovement.fromExpensePayment('m4', expense, 'ref1', today, 'u1', opening), // −1 200
      CashMovement.adjustment(
        'm5',
        { companyId: 'c1', direction: 'OUT', amount: Money.parse('12,345'), date: today, reason: 'Frais bancaires', createdById: 'u1' },
        opening,
        today,
      ), // −12,345
    ];
    expect(movements.map((m) => m.sourceType)).toEqual([
      'OPENING',
      'PAYMENT',
      'PAYMENT',
      'PAYMENT_REVERSAL',
      'EXPENSE_PAYMENT',
      'ADJUSTMENT',
    ]);
    // 5000 + 1000 + 500 − 500 − 1200 − 12.345 = 4787.655
    expect(balanceOf(movements).millimes).toBe(4_787_655);
    expect(balanceOf(movements, opening).millimes).toBe(5_000_000);
  });

  it('no movement is allowed before the opening date', () => {
    const p = Payment.create('p', { ...payment('x', 1).snapshot(), date: d('2026-10-31') });
    expect(() => CashMovement.fromPayment('m', 'c1', p, 'x', opening)).toThrow(DomainError);
  });

  it('adjustments need a reason and cannot be in the future; amounts must be positive', () => {
    const base = { companyId: 'c1', direction: 'IN' as const, amount: Money.dinars(1), date: today, reason: 'ok', createdById: 'u' };
    expect(() => CashMovement.adjustment('m', { ...base, reason: ' ' }, opening, today)).toThrow(DomainError);
    expect(() => CashMovement.adjustment('m', { ...base, date: today.addDays(1) }, opening, today)).toThrow(DomainError);
    expect(() => CashMovement.adjustment('m', { ...base, amount: Money.zero() }, opening, today)).toThrow(DomainError);
    expect(CashMovement.adjustment('m', base, opening, today).sourceId).toBe('m');
  });

  it('expense payment reversal is IN with sourceId = reversed ref and needs a reason', () => {
    const e = Expense.draft('e1', 'c1', 'u1', { label: 'Loyer', category: 'RENT', amount: Money.dinars(10), expenseDate: today });
    const m = CashMovement.fromExpensePaymentReversal('m', e, 'ref1', today, 'erreur', 'u1', opening);
    expect(m.direction).toBe('IN');
    expect(m.sourceId).toBe('ref1');
    expect(() => CashMovement.fromExpensePaymentReversal('m', e, 'ref1', today, '', 'u1', opening)).toThrow(DomainError);
  });
});

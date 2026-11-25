import { describe, expect, it } from 'vitest';
import { DomainError, type ErrorCode } from '../shared/errors';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { Invoice, type InvoiceLine } from './invoice';
import { InvoiceNumber } from './invoice-number';
import { computeLine, computeTotals } from './totals';

const d = LocalDate.parse;
const today = d('2026-12-01');

function line(unitMillimes: number, qtyHundredths = 100, vatRateBp = 0): InvoiceLine {
  return { id: `l${unitMillimes}`, description: 'Prestation', qtyHundredths, unitMillimes, vatRateBp };
}

function draft(lines: InvoiceLine[] = [line(3_000_000)]) {
  return Invoice.draft('inv1', {
    companyId: 'c1',
    clientId: 'p1',
    clientKind: 'CLIENT',
    issueDate: today,
    dueDate: today.addDays(10),
    lines,
    stampDuty: Money.zero(),
  });
}

function issued(lines?: InvoiceLine[]) {
  const inv = draft(lines);
  inv.validate(InvoiceNumber.of(2026, 1));
  return inv;
}

function pay(inv: Invoice, amount: string, date = today, id = 'pay1') {
  return inv.recordPayment({
    paymentId: id,
    amount: Money.parse(amount),
    date,
    method: 'TRANSFER',
    today,
    createdById: 'u1',
  });
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

describe('computeTotals (VAT rounded per line, never on the sum)', () => {
  it.each([
    // unit, qty×100, vat bp → ht, vat
    [1_000_000, 100, 1900, 1_000_000, 190_000],
    [333, 300, 1900, 999, 190], // 189.81 → 190
    [1_005, 100, 1900, 1_005, 191], // 190.95 → 191
    [12_345, 150, 700, 18_518, 1_296], // 18 517.5 → 18 518 ; 1 296.26 → 1 296
    [500, 100, 0, 500, 0],
  ])('unit %i × qty %i at %i bp → HT %i, VAT %i', (unit, qty, vat, ht, vatAmount) => {
    expect(computeLine({ unitMillimes: unit, qtyHundredths: qty, vatRateBp: vat })).toEqual({
      htMillimes: ht,
      vatMillimes: vatAmount,
      ttcMillimes: ht + vatAmount,
    });
  });

  it('sums rounded lines and groups VAT per rate, plus stamp duty', () => {
    const t = computeTotals(
      [
        { description: 'a', unitMillimes: 333, qtyHundredths: 100, vatRateBp: 1900 }, // vat 63.27 → 63
        { description: 'b', unitMillimes: 333, qtyHundredths: 100, vatRateBp: 1900 }, // 63
        { description: 'c', unitMillimes: 1_000, qtyHundredths: 100, vatRateBp: 700 }, // 70
      ],
      1_000,
    );
    // per-line rounding gives 126 for the 19 % bucket; rounding the sum (666 × 19 %) would give 127
    expect(t.vatByRate).toEqual([
      { rateBp: 1900, baseMillimes: 666, vatMillimes: 126 },
      { rateBp: 700, baseMillimes: 1_000, vatMillimes: 70 },
    ]);
    expect(t.htMillimes).toBe(1_666);
    expect(t.vatMillimes).toBe(196);
    expect(t.totalMillimes).toBe(1_666 + 196 + 1_000);
  });
});

describe('Invoice draft rules', () => {
  it('requires at least one line, a CLIENT party and dueDate ≥ issueDate', () => {
    expect(codeOf(() => draft([]))).toBe('INVOICE_EMPTY');
    expect(
      codeOf(() =>
        Invoice.draft('x', {
          companyId: 'c1',
          clientId: 's1',
          clientKind: 'SUPPLIER',
          issueDate: today,
          dueDate: today,
          lines: [line(1)],
          stampDuty: Money.zero(),
        }),
      ),
    ).toBe('INVOICE_CLIENT_INVALID');
    expect(
      codeOf(() =>
        Invoice.draft('x', {
          companyId: 'c1',
          clientId: 'p1',
          clientKind: 'CLIENT',
          issueDate: today,
          dueDate: today.addDays(-1),
          lines: [line(1)],
          stampDuty: Money.zero(),
        }),
      ),
    ).toBe('INVOICE_DUE_BEFORE_ISSUE');
    expect(codeOf(() => draft([{ ...line(1), qtyHundredths: 0 }]))).toBe('VALIDATION');
    expect(codeOf(() => draft([{ ...line(1), vatRateBp: 1234 }]))).toBe('VALIDATION');
    expect(codeOf(() => draft([{ ...line(1), description: ' ' }]))).toBe('VALIDATION');
  });

  it('can be edited and deleted while DRAFT', () => {
    const inv = draft();
    inv.updateDraft({
      clientId: 'p2',
      clientKind: 'CLIENT',
      issueDate: today,
      dueDate: today.addDays(30),
      lines: [line(1_000_000), line(2_000_000)],
      notes: '  merci ',
    });
    expect(inv.clientId).toBe('p2');
    expect(inv.total().millimes).toBe(3_000_000);
    expect(inv.notes).toBe('merci');
    expect(() => inv.assertDeletable()).not.toThrow();
    expect(inv.remaining().millimes).toBe(0); // drafts are not receivable
  });

  it('editing after validation is refused', () => {
    const inv = issued();
    expect(inv.number).toBe('FAC-2026-0001');
    expect(inv.status).toBe('ISSUED');
    expect(
      codeOf(() =>
        inv.updateDraft({ clientId: 'p1', clientKind: 'CLIENT', issueDate: today, dueDate: today, lines: [line(1)] }),
      ),
    ).toBe('INVOICE_NOT_DRAFT');
    expect(codeOf(() => inv.assertDeletable())).toBe('INVOICE_NOT_DRAFT');
    expect(codeOf(() => inv.validate(InvoiceNumber.of(2026, 2)))).toBe('INVOICE_NOT_DRAFT');
  });
});

describe('Invoice payments', () => {
  it('invoice.recordPayment reduces remaining', () => {
    const inv = issued();
    expect(inv.remaining().millimes).toBe(3_000_000);
    expect(inv.settlement()).toBe('UNPAID');
    pay(inv, '1000');
    expect(inv.remaining().millimes).toBe(2_000_000);
    expect(inv.netPaid().millimes).toBe(1_000_000);
    expect(inv.settlement()).toBe('PARTIALLY_PAID');
    pay(inv, '2 000,000', today, 'pay2');
    expect(inv.remaining().isZero()).toBe(true);
    expect(inv.settlement()).toBe('PAID');
  });

  it('rejects payment > remaining with INVOICE_OVERPAID', () => {
    const inv = issued();
    pay(inv, '1000');
    expect(codeOf(() => pay(inv, '2000,001', today, 'pay2'))).toBe('INVOICE_OVERPAID');
    expect(inv.remaining().millimes).toBe(2_000_000);
  });

  it('refuses zero/negative amounts, future dates, dates before issue', () => {
    const inv = issued();
    expect(codeOf(() => pay(inv, '0'))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => pay(inv, '-5'))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => pay(inv, '10', today.addDays(1)))).toBe('PAYMENT_IN_FUTURE');
    expect(codeOf(() => pay(inv, '10', today.addDays(-1)))).toBe('PAYMENT_BEFORE_ISSUE');
  });

  it('a payment on a DRAFT or CANCELLED invoice is refused', () => {
    expect(codeOf(() => pay(draft(), '10'))).toBe('INVOICE_NOT_ISSUED');
    const inv = issued();
    inv.cancel('Erreur de client');
    expect(codeOf(() => pay(inv, '10'))).toBe('INVOICE_NOT_ISSUED');
  });

  it('reversal creates a counter-entry and leaves the original untouched', () => {
    const inv = issued();
    const original = pay(inv, '1000');
    const before = original.snapshot();
    const reversal = inv.reversePayment({ reversalId: 'rev1', paymentId: 'pay1', reason: 'Chèque rejeté', date: today, createdById: 'u1' });
    expect(reversal.reversesId).toBe('pay1');
    expect(reversal.amount.millimes).toBe(1_000_000);
    expect(original.snapshot()).toEqual(before);
    expect(inv.payments).toHaveLength(2);
    expect(inv.remaining().millimes).toBe(3_000_000);
    expect(inv.isReversed('pay1')).toBe(true);
    expect(codeOf(() => inv.reversePayment({ reversalId: 'rev2', paymentId: 'pay1', reason: 'x', date: today, createdById: 'u1' }))).toBe(
      'PAYMENT_ALREADY_REVERSED',
    );
    expect(codeOf(() => inv.reversePayment({ reversalId: 'rev3', paymentId: 'rev1', reason: 'x', date: today, createdById: 'u1' }))).toBe(
      'PAYMENT_IS_REVERSAL',
    );
    expect(codeOf(() => inv.reversePayment({ reversalId: 'rev4', paymentId: 'nope', reason: 'x', date: today, createdById: 'u1' }))).toBe(
      'NOT_FOUND',
    );
  });

  it('a reversal requires a reason', () => {
    const inv = issued();
    pay(inv, '1000');
    expect(codeOf(() => inv.reversePayment({ reversalId: 'r', paymentId: 'pay1', reason: '  ', date: today, createdById: 'u1' }))).toBe(
      'REASON_REQUIRED',
    );
  });
});

describe('Invoice cancel and overdue', () => {
  it('cancelling with payments → INVOICE_HAS_PAYMENTS; after reversal it is allowed', () => {
    const inv = issued();
    pay(inv, '1000');
    expect(codeOf(() => inv.cancel('Litige'))).toBe('INVOICE_HAS_PAYMENTS');
    inv.reversePayment({ reversalId: 'rev1', paymentId: 'pay1', reason: 'Litige', date: today, createdById: 'u1' });
    inv.cancel('Litige');
    expect(inv.status).toBe('CANCELLED');
    expect(inv.cancelReason).toBe('Litige');
    expect(inv.remaining().isZero()).toBe(true);
  });

  it('cancel needs a reason and an ISSUED invoice', () => {
    expect(codeOf(() => issued().cancel(''))).toBe('REASON_REQUIRED');
    expect(codeOf(() => draft().cancel('x'))).toBe('INVOICE_NOT_ISSUED');
  });

  it('is overdue when remaining > 0 and dueDate < today', () => {
    const inv = issued();
    const due = inv.dueDate;
    expect(inv.isOverdue(due)).toBe(false);
    expect(inv.isOverdue(due.addDays(1))).toBe(true);
    expect(inv.daysOverdue(due.addDays(12))).toBe(12);
    pay(inv, '3000');
    expect(inv.isOverdue(due.addDays(1))).toBe(false);
    expect(inv.daysOverdue(due.addDays(1))).toBe(0);
  });
});

describe('InvoiceNumber', () => {
  it('formats and parses FAC-YYYY-NNNN', () => {
    expect(InvoiceNumber.of(2026, 12).value).toBe('FAC-2026-0012');
    expect(InvoiceNumber.parse('FAC-2026-0012').toString()).toBe('FAC-2026-0012');
    expect(() => InvoiceNumber.parse('F-1')).toThrow(DomainError);
    expect(() => InvoiceNumber.of(2026, 0)).toThrow(DomainError);
  });
});

import { describe, expect, it } from 'vitest';
import { RECEIPT_MAX_BYTES } from '@cashpilot/domain';
import { unwrap } from '../src/shared/result';
import { DT, issueInvoice, makeWorld, pdfReceipt, submitExpense, TODAY } from './fixture';

describe('Dépenses et validation', () => {
  it('submit → approve → pay creates one OUT movement', async () => {
    const w = await makeWorld();
    const id = await submitExpense(w, w.employee, 600);
    unwrap(await w.useCases.approveExpense.execute(w.owner, { id }));
    unwrap(await w.useCases.markExpensePaid.execute(w.finance, { id, date: '2026-12-01' }));
    expect(unwrap(await w.useCases.getExpense.execute(w.employee, { id })).status).toBe('PAID');
    expect(unwrap(await w.useCases.getTreasury.execute(w.owner)).balanceTodayMillimes).toBe(DT(4400));
    // reverse the payment: back to APPROVED and balance restored, original movement kept
    unwrap(await w.useCases.reverseExpensePayment.execute(w.finance, { id, reason: 'Virement rejeté' }));
    expect(unwrap(await w.useCases.getExpense.execute(w.owner, { id })).status).toBe('APPROVED');
    expect(unwrap(await w.useCases.getTreasury.execute(w.owner)).balanceTodayMillimes).toBe(DT(5000));
    expect(w.uow.state.movements.filter((m) => m.documentId === id).map((m) => m.sourceType)).toEqual([
      'EXPENSE_PAYMENT',
      'EXPENSE_PAYMENT_REVERSAL',
    ]);
  });

  it('REJECTED expense cannot be marked paid', async () => {
    const w = await makeWorld();
    const id = await submitExpense(w, w.employee, 600);
    unwrap(await w.useCases.rejectExpense.execute(w.owner, { id, reason: 'Hors budget' }));
    expect(await w.useCases.markExpensePaid.execute(w.finance, { id, date: '2026-12-01' })).toMatchObject({ code: 'EXPENSE_NOT_APPROVED' });
    expect(unwrap(await w.useCases.getTreasury.execute(w.owner)).balanceTodayMillimes).toBe(DT(5000));
  });

  it('a reason is required to reject', async () => {
    const w = await makeWorld();
    const id = await submitExpense(w, w.employee, 10);
    expect(await w.useCases.rejectExpense.execute(w.owner, { id, reason: '   ' })).toMatchObject({ code: 'REASON_REQUIRED' });
  });

  it('only the owner approves; only finance pays', async () => {
    const w = await makeWorld();
    const id = await submitExpense(w, w.employee, 10);
    expect(await w.useCases.approveExpense.execute(w.finance, { id })).toMatchObject({ code: 'FORBIDDEN' });
    expect(await w.useCases.approveExpense.execute(w.employee, { id })).toMatchObject({ code: 'FORBIDDEN' });
    unwrap(await w.useCases.approveExpense.execute(w.owner, { id }));
    expect(await w.useCases.markExpensePaid.execute(w.owner, { id, date: '2026-12-01' })).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('self-approval is audited with the flag', async () => {
    const w = await makeWorld();
    const id = await submitExpense(w, w.owner, 50);
    unwrap(await w.useCases.approveExpense.execute(w.owner, { id }));
    const entry = w.uow.auditEntries(w.owner.companyId).find((a) => a.action === 'expense.approved' && a.entityId === id);
    expect(entry?.after).toMatchObject({ selfApproved: true, status: 'APPROVED' });
  });

  it("EMPLOYEE cannot read others' expenses", async () => {
    const w = await makeWorld();
    const finExpense = await submitExpense(w, w.finance, 10);
    const ownExpense = await submitExpense(w, w.employee, 20);
    expect(await w.useCases.getExpense.execute(w.employee, { id: finExpense })).toMatchObject({ code: 'FORBIDDEN' });
    expect(await w.useCases.getReceipt.execute(w.employee, { expenseId: finExpense })).toMatchObject({ code: 'FORBIDDEN' });
    unwrap(await w.useCases.getReceipt.execute(w.employee, { expenseId: ownExpense }));
    const list = unwrap(await w.useCases.listExpenses.execute(w.employee, { scope: 'all' }));
    expect(list.items.map((e) => e.id)).toEqual([ownExpense]);
    const all = unwrap(await w.useCases.listExpenses.execute(w.owner, { scope: 'all', tab: 'submitted' }));
    expect(all.total).toBe(2);
  });

  it('cross-tenant expense access returns NOT_FOUND', async () => {
    const w = await makeWorld();
    const id = await submitExpense(w, w.employee, 10);
    expect(await w.useCases.getExpense.execute(w.outsider, { id })).toMatchObject({ code: 'NOT_FOUND' });
    expect(await w.useCases.approveExpense.execute(w.outsider, { id })).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('an invalid file type or size is refused and nothing is stored', async () => {
    const w = await makeWorld();
    const base = { label: 'Taxi', category: 'TRAVEL' as const, amountMillimes: DT(10), expenseDate: '2026-12-01', submit: true };
    expect(
      await w.useCases.createExpense.execute(w.employee, { ...base, receipt: { ...pdfReceipt(), mimeType: 'text/html' } }),
    ).toMatchObject({ code: 'RECEIPT_INVALID_TYPE' });
    expect(
      await w.useCases.createExpense.execute(w.employee, { ...base, receipt: { ...pdfReceipt(), bytes: new Uint8Array(RECEIPT_MAX_BYTES + 1) } }),
    ).toMatchObject({ code: 'RECEIPT_TOO_LARGE' });
    expect(w.storage.files.size).toBe(0);
    expect(await w.useCases.createExpense.execute(w.employee, { ...base, receipt: null })).toMatchObject({ code: 'EXPENSE_RECEIPT_REQUIRED' });
  });

  it('draft → attach → submit → withdraw, only by the submitter', async () => {
    const w = await makeWorld();
    const e = unwrap(
      await w.useCases.createExpense.execute(w.employee, { label: 'Fournitures', category: 'SUPPLIES', amountMillimes: DT(30), expenseDate: '2026-12-01' }),
    );
    expect(await w.useCases.submitExpense.execute(w.employee, { id: e.id })).toMatchObject({ code: 'EXPENSE_RECEIPT_REQUIRED' });
    expect(await w.useCases.attachReceipt.execute(w.finance, { id: e.id, receipt: pdfReceipt() })).toMatchObject({ code: 'FORBIDDEN' });
    unwrap(await w.useCases.attachReceipt.execute(w.employee, { id: e.id, receipt: pdfReceipt() }));
    unwrap(await w.useCases.submitExpense.execute(w.employee, { id: e.id }));
    unwrap(await w.useCases.withdrawExpense.execute(w.employee, { id: e.id }));
    unwrap(
      await w.useCases.updateExpenseDraft.execute(w.employee, {
        id: e.id,
        label: 'Fournitures bureau',
        category: 'SUPPLIES',
        amountMillimes: DT(35),
        expenseDate: '2026-12-01',
      }),
    );
    // others cannot see someone else's draft in lists
    expect(unwrap(await w.useCases.listExpenses.execute(w.owner, { scope: 'all' })).items).toHaveLength(0);
  });
});

describe('Trésorerie', () => {
  it('balance after opening + 2 payments + 1 reversal + 1 expense paid + 1 adjustment equals the hand-computed value', async () => {
    const w = await makeWorld();
    const inv = await issueInvoice(w, 3000);
    const p1 = unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId: inv, amountMillimes: DT(1000), date: '2026-12-01', method: 'CASH' }));
    unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId: inv, amountMillimes: 500_500, date: '2026-12-01', method: 'CASH' }));
    unwrap(await w.useCases.reversePayment.execute(w.finance, { invoiceId: inv, paymentId: p1.paymentId, reason: 'Erreur' }));
    const exp = await submitExpense(w, w.employee, 1200);
    unwrap(await w.useCases.approveExpense.execute(w.owner, { id: exp }));
    unwrap(await w.useCases.markExpensePaid.execute(w.finance, { id: exp, date: '2026-12-01' }));
    unwrap(await w.useCases.recordAdjustment.execute(w.finance, { direction: 'OUT', amountMillimes: 12_345, date: '2026-12-01', reason: 'Frais bancaires' }));
    // 5000 + 1000 + 500.5 − 1000 − 1200 − 12.345 = 4288.155
    const t = unwrap(await w.useCases.getTreasury.execute(w.owner));
    expect(t.balanceTodayMillimes).toBe(4_288_155);
    expect(t.items[0]!.balanceAfterMillimes).toBe(4_288_155);
    expect(t.total).toBe(6);
  });

  it('no movement is allowed before the opening date; adjustments need finance + reason', async () => {
    const w = await makeWorld();
    expect(
      await w.useCases.recordAdjustment.execute(w.finance, { direction: 'IN', amountMillimes: 1, date: '2026-10-31', reason: 'x' }),
    ).toMatchObject({ code: 'MOVEMENT_BEFORE_OPENING' });
    expect(await w.useCases.recordAdjustment.execute(w.finance, { direction: 'IN', amountMillimes: 1, date: '2026-12-01', reason: '' })).toMatchObject({
      code: 'REASON_REQUIRED',
    });
    expect(await w.useCases.recordAdjustment.execute(w.owner, { direction: 'IN', amountMillimes: 1, date: '2026-12-01', reason: 'x' })).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await w.useCases.getTreasury.execute(w.employee)).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('the running balance is correct across pages', async () => {
    const w = await makeWorld();
    for (let i = 1; i <= 30; i++) {
      unwrap(await w.useCases.recordAdjustment.execute(w.finance, { direction: 'IN', amountMillimes: DT(i), date: '2026-12-01', reason: `r${i}` }));
    }
    const p1 = unwrap(await w.useCases.getTreasury.execute(w.owner, { page: 1 }));
    const p2 = unwrap(await w.useCases.getTreasury.execute(w.owner, { page: 2 }));
    expect(p1.total).toBe(31);
    expect(p1.items).toHaveLength(25);
    expect(p2.items).toHaveLength(6);
    // oldest row (page 2, last) is the opening; each row = previous row's balance + its signed amount
    const all = [...p1.items, ...p2.items].reverse();
    expect(all[0]).toMatchObject({ sourceType: 'OPENING', balanceAfterMillimes: DT(5000) });
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.balanceAfterMillimes).toBe(all[i - 1]!.balanceAfterMillimes + all[i]!.amountMillimes);
    }
    expect(p1.items[0]!.balanceAfterMillimes).toBe(DT(5000 + 465));
    // filtered views keep the real running balance
    const outOnly = unwrap(await w.useCases.getTreasury.execute(w.owner, { direction: 'OUT' }));
    expect(outOnly.total).toBe(0);
  });

  it('balance history covers each day', async () => {
    const w = await makeWorld();
    unwrap(await w.useCases.recordAdjustment.execute(w.finance, { direction: 'IN', amountMillimes: DT(10), date: '2026-11-20', reason: 'x' }));
    const h = unwrap(await w.useCases.getBalanceHistory.execute(w.owner, { days: 90 }));
    expect(h).toHaveLength(90);
    expect(h.at(-1)).toEqual({ date: TODAY.toString(), balanceMillimes: DT(5010) });
    expect(h.find((p) => p.date === '2026-11-19')?.balanceMillimes).toBe(DT(5000));
    expect(h.find((p) => p.date === '2026-10-31')?.balanceMillimes).toBe(0);
  });
});

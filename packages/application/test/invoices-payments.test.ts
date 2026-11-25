import { describe, expect, it } from 'vitest';
import { unwrap } from '../src/shared/result';
import { DT, issueInvoice, makeWorld, TODAY } from './fixture';

describe('Facturation', () => {
  it('drafts can be edited and deleted; validation assigns gapless numbers', async () => {
    const w = await makeWorld();
    const uc = w.useCases;
    const draft = unwrap(
      await uc.createInvoiceDraft.execute(w.finance, {
        clientId: w.clientId,
        issueDate: '2026-12-01',
        dueDate: '2026-12-31',
        lines: [{ description: 'Design', qtyHundredths: 150, unitMillimes: DT(1000), vatRateBp: 1900 }],
      }),
    );
    const detail = unwrap(await uc.getInvoice.execute(w.owner, { id: draft.invoiceId }));
    expect(detail).toMatchObject({ status: 'DRAFT', htMillimes: DT(1500), vatMillimes: 285_000, totalMillimes: 1_785_000, number: null });

    unwrap(await uc.deleteInvoiceDraft.execute(w.finance, { id: draft.invoiceId }));
    expect(await uc.getInvoice.execute(w.owner, { id: draft.invoiceId })).toMatchObject({ code: 'NOT_FOUND' });

    const a = await issueInvoice(w, 100);
    const b = await issueInvoice(w, 200);
    expect(unwrap(await uc.getInvoice.execute(w.owner, { id: a })).number).toBe('FAC-2026-0001');
    expect(unwrap(await uc.getInvoice.execute(w.owner, { id: b })).number).toBe('FAC-2026-0002');
    expect(await uc.validateInvoice.execute(w.finance, { id: a })).toMatchObject({ code: 'INVOICE_NOT_DRAFT' });
    expect(await uc.deleteInvoiceDraft.execute(w.finance, { id: a })).toMatchObject({ code: 'INVOICE_NOT_DRAFT' });
  });

  it('OWNER reads invoices but cannot write; EMPLOYEE cannot read', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 100);
    expect(await w.useCases.cancelInvoice.execute(w.owner, { id, reason: 'x' })).toMatchObject({ code: 'FORBIDDEN' });
    expect(await w.useCases.getInvoice.execute(w.employee, { id })).toMatchObject({ code: 'FORBIDDEN' });
    expect(await w.useCases.listInvoices.execute(w.employee)).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cross-tenant byId returns NOT_FOUND', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 100);
    expect(await w.useCases.getInvoice.execute(w.outsider, { id })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await w.useCases.renderInvoicePdf.execute(w.outsider, { id })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await w.useCases.getPartyDetail.execute(w.outsider, { id: w.clientId })).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a draft cannot use a supplier as client', async () => {
    const w = await makeWorld();
    const r = await w.useCases.createInvoiceDraft.execute(w.finance, {
      clientId: w.supplierId,
      issueDate: '2026-12-01',
      dueDate: '2026-12-02',
      lines: [{ description: 'x', qtyHundredths: 100, unitMillimes: 1, vatRateBp: 0 }],
    });
    expect(r).toMatchObject({ code: 'INVOICE_CLIENT_INVALID' });
  });

  it('lists by tab with counts', async () => {
    const w = await makeWorld();
    const overdue = await issueInvoice(w, 100, 0);
    await issueInvoice(w, 200, 10);
    w.clockFixed.set(TODAY.addDays(1));
    const list = unwrap(await w.useCases.listInvoices.execute(w.owner, { tab: 'overdue' }));
    expect(list.items.map((i) => i.id)).toEqual([overdue]);
    expect(list.counts).toMatchObject({ all: 2, receivable: 2, overdue: 1, paid: 0, draft: 0 });
    expect(unwrap(await w.useCases.listInvoices.execute(w.owner, { q: '0002' })).items).toHaveLength(1);
  });

  it('PDF export: refused for drafts, watermark data for cancelled', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 100);
    const pdf = unwrap(await w.useCases.renderInvoicePdf.execute(w.owner, { id }));
    expect(pdf.fileName).toBe('FAC-2026-0001.pdf');
    unwrap(await w.useCases.cancelInvoice.execute(w.finance, { id, reason: 'Erreur' }));
    unwrap(await w.useCases.renderInvoicePdf.execute(w.owner, { id }));
    const { invoiceId: draft } = unwrap(
      await w.useCases.createInvoiceDraft.execute(w.finance, {
        clientId: w.clientId,
        issueDate: '2026-12-01',
        dueDate: '2026-12-02',
        lines: [{ description: 'x', qtyHundredths: 100, unitMillimes: 1, vatRateBp: 0 }],
      }),
    );
    expect(await w.useCases.renderInvoicePdf.execute(w.owner, { id: draft })).toMatchObject({ code: 'INVOICE_NOT_ISSUED' });
  });
});

describe('Encaissements', () => {
  it('a partial payment reduces remaining and increases the real balance', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 3000);
    const r = unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId: id, amountMillimes: DT(1000), date: '2026-12-01', method: 'TRANSFER' }));
    expect(r.remainingMillimes).toBe(DT(2000));
    const t = unwrap(await w.useCases.getTreasury.execute(w.owner));
    expect(t.balanceTodayMillimes).toBe(DT(6000));
    expect(unwrap(await w.useCases.getInvoice.execute(w.owner, { id })).settlement).toBe('PARTIALLY_PAID');
  });

  it('rejects payment > remaining with INVOICE_OVERPAID and changes nothing', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 3000);
    const r = await w.useCases.recordPayment.execute(w.finance, { invoiceId: id, amountMillimes: DT(3000) + 1, date: '2026-12-01', method: 'CASH' });
    expect(r).toMatchObject({ ok: false, code: 'INVOICE_OVERPAID', details: { remainingMillimes: DT(3000) } });
    expect(unwrap(await w.useCases.getTreasury.execute(w.owner)).balanceTodayMillimes).toBe(DT(5000));
  });

  it('a retried action keeps the balance unchanged (same operation id)', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 3000);
    const input = { invoiceId: id, amountMillimes: DT(1000), date: '2026-12-01', method: 'TRANSFER' as const, operationId: 'op-1' };
    unwrap(await w.useCases.recordPayment.execute(w.finance, input));
    unwrap(await w.useCases.recordPayment.execute(w.finance, input)); // double submit
    expect(unwrap(await w.useCases.getTreasury.execute(w.owner)).balanceTodayMillimes).toBe(DT(6000));
    expect(unwrap(await w.useCases.getInvoice.execute(w.owner, { id })).payments).toHaveLength(1);
  });

  it('reversal creates counter-entry + audit, original untouched', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 3000);
    const { paymentId } = unwrap(
      await w.useCases.recordPayment.execute(w.finance, { invoiceId: id, amountMillimes: DT(1000), date: '2026-12-01', method: 'CHEQUE' }),
    );
    const original = w.uow.state.invoices.get(id)!.payments[0]!.snapshot();
    unwrap(await w.useCases.reversePayment.execute(w.finance, { invoiceId: id, paymentId, reason: 'Chèque impayé' }));

    const detail = unwrap(await w.useCases.getInvoice.execute(w.owner, { id }));
    expect(detail.payments).toHaveLength(2);
    expect(detail.payments[0]).toMatchObject({ id: paymentId, isReversal: false, reversedById: detail.payments[1]!.id });
    expect(detail.payments[1]).toMatchObject({ isReversal: true, reversesId: paymentId, reason: 'Chèque impayé' });
    expect(w.uow.state.invoices.get(id)!.payments[0]!.snapshot()).toEqual(original);
    expect(detail.remainingMillimes).toBe(DT(3000));

    const movements = w.uow.state.movements.filter((m) => m.documentId === id).map((m) => [m.sourceType, m.direction]);
    expect(movements).toEqual([
      ['PAYMENT', 'IN'],
      ['PAYMENT_REVERSAL', 'OUT'],
    ]);
    expect(unwrap(await w.useCases.getTreasury.execute(w.owner)).balanceTodayMillimes).toBe(DT(5000));
    expect(w.uow.auditEntries(w.owner.companyId).map((a) => a.action)).toEqual(expect.arrayContaining(['payment.recorded', 'payment.reversed']));
  });

  it('a payment on a DRAFT or CANCELLED invoice is refused', async () => {
    const w = await makeWorld();
    const { invoiceId } = unwrap(
      await w.useCases.createInvoiceDraft.execute(w.finance, {
        clientId: w.clientId,
        issueDate: '2026-12-01',
        dueDate: '2026-12-02',
        lines: [{ description: 'x', qtyHundredths: 100, unitMillimes: DT(10), vatRateBp: 0 }],
      }),
    );
    const pay = (invoiceId: string) =>
      w.useCases.recordPayment.execute(w.finance, { invoiceId, amountMillimes: DT(1), date: '2026-12-01', method: 'CASH' });
    expect(await pay(invoiceId)).toMatchObject({ code: 'INVOICE_NOT_ISSUED' });
    const issued = await issueInvoice(w, 10);
    unwrap(await w.useCases.cancelInvoice.execute(w.finance, { id: issued, reason: 'Doublon' }));
    expect(await pay(issued)).toMatchObject({ code: 'INVOICE_NOT_ISSUED' });
  });

  it('cancelling with payments → INVOICE_HAS_PAYMENTS', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 3000);
    unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId: id, amountMillimes: DT(1), date: '2026-12-01', method: 'CASH' }));
    expect(await w.useCases.cancelInvoice.execute(w.finance, { id, reason: 'x' })).toMatchObject({ code: 'INVOICE_HAS_PAYMENTS' });
  });

  it('lists payments with reversals and a net total', async () => {
    const w = await makeWorld();
    const id = await issueInvoice(w, 3000);
    const { paymentId } = unwrap(
      await w.useCases.recordPayment.execute(w.finance, { invoiceId: id, amountMillimes: DT(1000), date: '2026-12-01', method: 'CASH' }),
    );
    unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId: id, amountMillimes: DT(500), date: '2026-12-01', method: 'CASH' }));
    unwrap(await w.useCases.reversePayment.execute(w.finance, { invoiceId: id, paymentId, reason: 'Erreur' }));
    const list = unwrap(await w.useCases.listPayments.execute(w.owner));
    expect(list.total).toBe(3);
    expect(list.totalMillimes).toBe(DT(500));
  });

  it('client detail totals from known data', async () => {
    const w = await makeWorld();
    const a = await issueInvoice(w, 3000, 0);
    await issueInvoice(w, 1000, 20);
    unwrap(await w.useCases.recordPayment.execute(w.finance, { invoiceId: a, amountMillimes: DT(1000), date: '2026-12-01', method: 'CASH' }));
    w.clockFixed.set(TODAY.addDays(2));
    const d = unwrap(await w.useCases.getPartyDetail.execute(w.owner, { id: w.clientId }));
    expect(d.totals).toMatchObject({
      invoicedMillimes: DT(4000),
      receivedMillimes: DT(1000),
      outstandingMillimes: DT(3000),
      overdueMillimes: DT(2000),
    });
    expect(d.invoices).toHaveLength(2);
    expect(d.payments).toHaveLength(1);
  });
});

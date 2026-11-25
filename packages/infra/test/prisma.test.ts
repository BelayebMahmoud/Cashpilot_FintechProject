import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUseCases, unwrap, type Actor, type UseCases } from '@cashpilot/application';
import { CashMovement, DomainError, LocalDate, Money } from '@cashpilot/domain';
import { type PrismaClient } from '@cashpilot/db';
import { PrismaForecastReadModel } from '../src/prisma/prisma-forecast-read-model';
import { PrismaUnitOfWork } from '../src/prisma/prisma-unit-of-work';
import { UuidGenerator } from '../src/system/system';
import { LocalFileStorage } from '../src/storage/local-file-storage';
import { dockerAvailable, withTestDb, type TestDb } from './with-test-db';
import os from 'node:os';
import path from 'node:path';

const runIntegration = await dockerAvailable();
const today = LocalDate.parse('2026-12-01');
const DT = (n: number) => n * 1000;

describe.runIf(runIntegration)('Prisma adapters (Testcontainers PostgreSQL)', () => {
  let db: TestDb;
  let prisma: PrismaClient;
  let uow: PrismaUnitOfWork;
  let uc: UseCases;
  let finance: Actor;
  let outsider: Actor;
  let clientId: string;

  beforeAll(async () => {
    db = await withTestDb();
    prisma = db.prisma;
    const ids = new UuidGenerator();
    uow = new PrismaUnitOfWork(prisma, ids);
    const clock = { today: () => today, now: () => new Date('2026-12-01T10:00:00Z') };
    uc = createUseCases({
      uow,
      clock,
      ids,
      forecast: new PrismaForecastReadModel(prisma),
      storage: new LocalFileStorage(path.join(os.tmpdir(), 'cashpilot-it')),
      pdf: { render: async () => new Uint8Array([37]) },
    });
    for (const [id, email] of [
      ['u-owner', 'owner@it.tn'],
      ['u-fin', 'fin@it.tn'],
      ['u-out', 'out@it.tn'],
    ]) {
      await prisma.user.create({ data: { id: id!, email: email!, name: id! } });
    }
    const { slug } = unwrap(
      await uc.createCompany.execute('u-owner', { name: 'Atlas IT', sector: 'SERVICES', openingBalanceMillimes: DT(5000), openingDate: '2026-11-01' }),
    );
    const owner = unwrap(await uc.resolveActor.execute('u-owner', slug));
    unwrap(await uc.addMember.execute(owner, { email: 'fin@it.tn', role: 'FINANCE_MANAGER' }));
    finance = unwrap(await uc.resolveActor.execute('u-fin', slug));
    const other = unwrap(
      await uc.createCompany.execute('u-out', { name: 'Other IT', sector: 'RETAIL', openingBalanceMillimes: DT(1), openingDate: '2026-11-01' }),
    );
    outsider = unwrap(await uc.resolveActor.execute('u-out', other.slug));
    clientId = unwrap(await uc.createParty.execute(finance, { kind: 'CLIENT', name: 'Client IT' })).id;
  });

  afterAll(async () => {
    await db?.stop();
  });

  async function draft(amount: number) {
    return unwrap(
      await uc.createInvoiceDraft.execute(finance, {
        clientId,
        issueDate: '2026-12-01',
        dueDate: '2026-12-11',
        lines: [{ description: 'Prestation', qtyHundredths: 100, unitMillimes: DT(amount), vatRateBp: 1900 }],
      }),
    ).invoiceId;
  }

  it('a transaction which throws persists nothing (incl. its audit entry)', async () => {
    const before = await prisma.auditEntry.count();
    const parties = await prisma.party.count();
    await expect(
      uow.run(async (tx) => {
        await tx.audit.record({ companyId: finance.companyId, actorId: 'u-fin', action: 'test.rollback', entityType: 'Test', entityId: 'x' });
        await prisma.$executeRaw`SELECT 1`; // unrelated statement outside the tx
        throw new DomainError('VALIDATION', 'boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.auditEntry.count()).toBe(before);
    expect(await prisma.party.count()).toBe(parties);
  });

  it('an audit entry is written inside the same transaction as the change', async () => {
    const id = await draft(100);
    unwrap(await uc.validateInvoice.execute(finance, { id }));
    const entry = await prisma.auditEntry.findFirst({ where: { entityId: id, action: 'invoice.validated' } });
    expect(entry?.after).toMatchObject({ status: 'ISSUED', totalMillimes: 119_000 });
  });

  it('maps invoices with lines and payments; amounts round-trip exactly', async () => {
    const id = await draft(3000);
    unwrap(await uc.validateInvoice.execute(finance, { id }));
    unwrap(await uc.recordPayment.execute(finance, { invoiceId: id, amountMillimes: 1_000_005, date: '2026-12-01', method: 'TRANSFER' }));
    const inv = unwrap(await uc.getInvoice.execute(finance, { id }));
    expect(inv).toMatchObject({ totalMillimes: 3_570_000, paidMillimes: 1_000_005, remainingMillimes: 2_569_995, settlement: 'PARTIALLY_PAID' });
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(row.totalMillimes).toBe(3_570_000n);
  });

  it('ledger unique (sourceType, sourceId): a retried action keeps the same balance', async () => {
    const balanceBefore = unwrap(await uc.getTreasury.execute(finance)).balanceTodayMillimes;
    const make = (id: string) =>
      CashMovement.adjustment(
        id,
        { companyId: finance.companyId, direction: 'IN', amount: Money.dinars(10), date: today, reason: 'retry', createdById: 'u-fin' },
        LocalDate.parse('2026-11-01'),
        today,
      );
    const m = make('11111111-1111-1111-1111-111111111111');
    await uow.run((tx) => tx.ledger.append(m));
    // same operation appended again (sourceId = movement id) → refused, balance unchanged by the retry
    await expect(uow.run((tx) => tx.ledger.append(m))).rejects.toMatchObject({ code: 'DUPLICATE_OPERATION' });
    expect(unwrap(await uc.getTreasury.execute(finance)).balanceTodayMillimes).toBe(balanceBefore + DT(10));
    // and through the use case with an idempotency key
    const id = await draft(100);
    unwrap(await uc.validateInvoice.execute(finance, { id }));
    const input = { invoiceId: id, amountMillimes: DT(50), date: '2026-12-01', method: 'CASH' as const, operationId: '22222222-2222-2222-2222-222222222222' };
    unwrap(await uc.recordPayment.execute(finance, input));
    unwrap(await uc.recordPayment.execute(finance, input));
    expect(unwrap(await uc.getTreasury.execute(finance)).balanceTodayMillimes).toBe(balanceBefore + DT(10) + DT(50));
  });

  it('gapless numbering under concurrency: 2 parallel validations → two consecutive numbers', async () => {
    const [a, b] = [await draft(10), await draft(20)];
    const results = await Promise.all([uc.validateInvoice.execute(finance, { id: a }), uc.validateInvoice.execute(finance, { id: b })]);
    const numbers = results.map((r) => unwrap(r).number).sort();
    const seq = numbers.map((n) => Number(n.split('-')[2]));
    expect(seq[1]! - seq[0]!).toBe(1);
    const all = await prisma.invoice.findMany({ where: { companyId: finance.companyId, number: { not: null } }, select: { number: true } });
    const sorted = all.map((x) => Number(x.number!.split('-')[2])).sort((x, y) => x - y);
    expect(sorted).toEqual(sorted.map((_, i) => i + 1)); // no gap
  });

  it('concurrent payments cannot overpay (row lock on the invoice)', async () => {
    const id = await draft(1000); // 1 190 TTC
    unwrap(await uc.validateInvoice.execute(finance, { id }));
    const pay = () => uc.recordPayment.execute(finance, { invoiceId: id, amountMillimes: DT(1000), date: '2026-12-01', method: 'CASH' });
    const results = await Promise.all([pay(), pay()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: 'INVOICE_OVERPAID' });
  });

  it('tenant filtering: another company id returns NOT_FOUND', async () => {
    const id = await draft(10);
    expect(await uc.getInvoice.execute(outsider, { id })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await uow.read((r) => r.invoices.byId(outsider.companyId, id))).toBeNull();
    expect(await uow.read((r) => r.parties.byId(outsider.companyId, clientId))).toBeNull();
  });

  it('running balance via SQL window function matches across pages and filters', async () => {
    const t1 = unwrap(await uc.getTreasury.execute(finance, { page: 1 }));
    const rows = [...t1.items].reverse();
    for (let i = 1; i < rows.length; i++) {
      const signed = rows[i]!.direction === 'IN' ? rows[i]!.amountMillimes : -rows[i]!.amountMillimes;
      expect(rows[i]!.balanceAfterMillimes).toBe(rows[i - 1]!.balanceAfterMillimes + signed);
    }
    expect(t1.items[0]!.balanceAfterMillimes).toBe(t1.balanceTodayMillimes);
    const inOnly = unwrap(await uc.getTreasury.execute(finance, { direction: 'IN', sourceType: 'OPENING' }));
    expect(inOnly.items).toEqual([expect.objectContaining({ sourceType: 'OPENING', balanceAfterMillimes: DT(5000) })]);
  });

  it('forecast read model: remaining computed in SQL, planned flows expanded', async () => {
    unwrap(
      await uc.createPlannedFlow.execute(finance, { label: 'Loyer', direction: 'OUT', amountMillimes: DT(100), expectedDate: '2026-12-05', recurrence: 'MONTHLY' }),
    );
    const f = unwrap(await uc.getForecast.execute(finance, { horizon: 30 }));
    const invoices = await uow.read((r) => r.invoices.list(finance.companyId, { statuses: ['ISSUED'] }));
    const expected = invoices.reduce((s, i) => s + i.remaining().millimes, 0);
    const receivables = f.flows.filter((x) => x.kind === 'RECEIVABLE').reduce((s, x) => s + x.amountMillimes, 0);
    expect(receivables).toBe(expected);
    expect(f.flows.filter((x) => x.kind === 'PLANNED').map((x) => x.date).slice(0, 2)).toEqual(['2026-12-05', '2027-01-05']);
  });
});

describe.skipIf(runIntegration)('Prisma adapters', () => {
  it.skip('skipped: Docker is not available for Testcontainers', () => {});
});

import { LocalDate } from '@cashpilot/domain';
import { type Actor } from '../src/shared/actor';
import { unwrap } from '../src/shared/result';
import { createInMemoryApp, FixedClock, type InMemoryApp } from './fakes';

export const TODAY = LocalDate.parse('2026-12-01');
export const DT = (n: number) => n * 1000;

export interface World extends InMemoryApp {
  clockFixed: FixedClock;
  owner: Actor;
  finance: Actor;
  employee: Actor;
  /** Owner of another company (tenant isolation tests). */
  outsider: Actor;
  clientId: string;
  supplierId: string;
}

/**
 * A company "Atlas" with 5 000 DT opened on 2026-11-01, three members (one per role),
 * one client and one supplier — plus a second company "Other" for cross-tenant checks.
 */
export async function makeWorld(): Promise<World> {
  const clockFixed = new FixedClock(TODAY);
  const app = createInMemoryApp({ clock: clockFixed });
  const { uow, useCases: uc } = app;
  uow.addUser({ id: 'u-owner', name: 'Dirigeant', email: 'dirigeant@test.tn' });
  uow.addUser({ id: 'u-fin', name: 'Gestion', email: 'gestion@test.tn' });
  uow.addUser({ id: 'u-emp', name: 'Collab', email: 'collab@test.tn' });
  uow.addUser({ id: 'u-out', name: 'Autre', email: 'autre@test.tn' });

  const { slug } = unwrap(
    await uc.createCompany.execute('u-owner', { name: 'Atlas', sector: 'DIGITAL_AGENCY', openingBalanceMillimes: DT(5000), openingDate: '2026-11-01' }),
  );
  const owner = unwrap(await uc.resolveActor.execute('u-owner', slug));
  unwrap(await uc.addMember.execute(owner, { email: 'gestion@test.tn', role: 'FINANCE_MANAGER' }));
  unwrap(await uc.addMember.execute(owner, { email: 'collab@test.tn', role: 'EMPLOYEE' }));
  const finance = unwrap(await uc.resolveActor.execute('u-fin', slug));
  const employee = unwrap(await uc.resolveActor.execute('u-emp', slug));

  const other = unwrap(
    await uc.createCompany.execute('u-out', { name: 'Other', sector: 'RETAIL', openingBalanceMillimes: DT(100), openingDate: '2026-11-01' }),
  );
  const outsider = unwrap(await uc.resolveActor.execute('u-out', other.slug));

  const client = unwrap(await uc.createParty.execute(finance, { kind: 'CLIENT', name: 'Client Alpha', email: 'alpha@client.tn' }));
  const supplier = unwrap(await uc.createParty.execute(finance, { kind: 'SUPPLIER', name: 'Fournisseur Beta' }));

  return { ...app, clockFixed, owner, finance, employee, outsider, clientId: client.id, supplierId: supplier.id };
}

/** Creates and validates an invoice of `totalDinars` (no VAT) due `dueInDays` after today. */
export async function issueInvoice(w: World, totalDinars: number, dueInDays = 10): Promise<string> {
  const { invoiceId } = unwrap(
    await w.useCases.createInvoiceDraft.execute(w.finance, {
      clientId: w.clientId,
      issueDate: TODAY.toString(),
      dueDate: TODAY.addDays(dueInDays).toString(),
      lines: [{ description: 'Prestation', qtyHundredths: 100, unitMillimes: DT(totalDinars), vatRateBp: 0 }],
    }),
  );
  unwrap(await w.useCases.validateInvoice.execute(w.finance, { id: invoiceId }));
  return invoiceId;
}

export const pdfReceipt = () => ({ bytes: new Uint8Array([37, 80, 68, 70]), fileName: 'recu.pdf', mimeType: 'application/pdf' });

/** Submits (as `who`) an expense with a receipt, due `dueInDays` after today. */
export async function submitExpense(w: World, who: Actor, dinars: number, dueInDays = 15): Promise<string> {
  const e = unwrap(
    await w.useCases.createExpense.execute(who, {
      label: 'Licences logicielles',
      category: 'SOFTWARE',
      amountMillimes: DT(dinars),
      expenseDate: TODAY.toString(),
      dueDate: TODAY.addDays(dueInDays).toString(),
      receipt: pdfReceipt(),
      submit: true,
    }),
  );
  return e.id;
}

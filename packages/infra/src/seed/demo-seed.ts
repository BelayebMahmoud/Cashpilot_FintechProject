import { unwrap, type Actor, type Result, type UseCases } from '@cashpilot/application';
import { type LocalDate, type Role } from '@cashpilot/domain';

/*
 * Demo data "Atlas Digital" (agence digitale), built THROUGH the use cases so every business
 * rule, ledger movement and audit entry is real. Dates are relative to the run date.
 * Covers every state: drafts, issued, partially paid, paid, overdue, cancelled, reversed;
 * expenses draft/submitted/approved/rejected/paid (incl. a self-approval); planned flows;
 * a project with milestones; a saved scenario.
 */

export const DEMO_SLUG = 'atlas-digital';
export const DEMO_PASSWORD = 'CashPilot2026!';
export const DEMO_ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: 'dirigeant@cashpilot.demo', name: 'Salma Ben Ali', role: 'OWNER' },
  { email: 'gestion@cashpilot.demo', name: 'Karim Trabelsi', role: 'FINANCE_MANAGER' },
  { email: 'collab@cashpilot.demo', name: 'Yasmine Haddad', role: 'EMPLOYEE' },
];

export interface SeedContext {
  today: LocalDate;
  /** Creates (or finds) an auth account and returns its user id. */
  ensureUser: (account: { email: string; name: string; password: string }) => Promise<string>;
}

const DT = (n: number) => Math.round(n * 1000);

// A tiny but valid PDF used as receipt for seeded expenses.
const RECEIPT_PDF = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);
const receipt = (name: string) => ({ bytes: RECEIPT_PDF, fileName: `${name}.pdf`, mimeType: 'application/pdf' });

export async function seedDemo(uc: UseCases, ctx: SeedContext): Promise<{ slug: string }> {
  const { today } = ctx;
  const day = (offset: number) => today.addDays(offset).toString();

  const [ownerId, financeId, employeeId] = await Promise.all(
    DEMO_ACCOUNTS.map((a) => ctx.ensureUser({ email: a.email, name: a.name, password: DEMO_PASSWORD })),
  );

  const { slug } = unwrap(
    await uc.createCompany.execute(ownerId!, {
      name: 'Atlas Digital',
      sector: 'DIGITAL_AGENCY',
      openingBalanceMillimes: DT(25_000),
      openingDate: day(-120),
    }),
  );
  const owner: Actor = unwrap(await uc.resolveActor.execute(ownerId!, slug));
  unwrap(await uc.addMember.execute(owner, { email: DEMO_ACCOUNTS[1]!.email, role: 'FINANCE_MANAGER' }));
  unwrap(await uc.addMember.execute(owner, { email: DEMO_ACCOUNTS[2]!.email, role: 'EMPLOYEE' }));
  const finance = unwrap(await uc.resolveActor.execute(financeId!, slug));
  const employee = unwrap(await uc.resolveActor.execute(employeeId!, slug));

  // ── Tiers ──────────────────────────────────────────────────────────────
  const client = async (name: string, email: string, taxId: string, address: string) =>
    unwrap(await uc.createParty.execute(finance, { kind: 'CLIENT', name, email, taxId, address, phone: '+216 71 000 000' })).id;
  const horizon = await client('Horizon Média', 'compta@horizon-media.tn', '1234567A/A/M/000', '12 rue de Marseille, Tunis');
  const carthage = await client('Carthage Retail', 'finance@carthage-retail.tn', '2345678B/A/M/000', 'Les Berges du Lac, Tunis');
  const medina = await client('Médina Tours', 'contact@medina-tours.tn', '3456789C/A/M/000', 'Avenue Habib Bourguiba, Sousse');
  const sahel = await client('Sahel Industries', 'achats@sahel-industries.tn', '4567890D/A/M/000', 'Zone industrielle, Monastir');
  const olivia = await client('Olivia Cosmetics', 'admin@olivia-cosmetics.tn', '5678901E/A/M/000', 'Route de Gremda, Sfax');
  const fintech = await client('Tunis Fintech Lab', 'ops@tunisfintechlab.tn', '6789012F/A/M/000', 'Technopole El Ghazala, Ariana');

  const supplier = async (name: string, email: string) =>
    unwrap(await uc.createParty.execute(finance, { kind: 'SUPPLIER', name, email })).id;
  const cloudhost = await supplier('CloudHost TN', 'billing@cloudhost.tn');
  const pixel = await supplier('Studio Pixel (freelance)', 'hello@studiopixel.tn');
  const bureau = await supplier('Bureau Plus', 'ventes@bureauplus.tn');

  // ── Projet (fonctionnalité sectorielle) ────────────────────────────────
  const { projectId } = unwrap(
    await uc.createProject.execute(finance, {
      clientId: carthage,
      name: 'Refonte e-commerce Carthage Retail',
      budgetMillimes: DT(18_000),
      startDate: day(-65),
      endDate: day(60),
    }),
  );
  for (const m of [
    { label: 'Acompte 30 %', amount: 5_400, at: -60 },
    { label: 'Livraison V1', amount: 6_000, at: 25 },
    { label: 'Recette finale', amount: 6_600, at: 50 },
  ]) {
    unwrap(await uc.addMilestone.execute(finance, { projectId, label: m.label, amountMillimes: DT(m.amount), expectedDate: day(m.at) }));
  }
  const acompte = unwrap(await uc.getProject.execute(finance, { id: projectId })).milestones[0]!;

  // ── Factures ───────────────────────────────────────────────────────────
  type Line = { d: string; qty?: number; unit: number; vat?: number };
  const invoice = async (o: {
    clientId: string;
    issue: number;
    due: number;
    lines: Line[];
    validate?: boolean;
    projectId?: string;
    milestoneId?: string;
  }) => {
    const { invoiceId } = unwrap(
      await uc.createInvoiceDraft.execute(finance, {
        clientId: o.clientId,
        issueDate: day(o.issue),
        dueDate: day(o.due),
        projectId: o.projectId ?? null,
        milestoneId: o.milestoneId ?? null,
        lines: o.lines.map((l) => ({ description: l.d, qtyHundredths: Math.round((l.qty ?? 1) * 100), unitMillimes: DT(l.unit), vatRateBp: l.vat ?? 1900 })),
      }),
    );
    if (o.validate !== false) unwrap(await uc.validateInvoice.execute(finance, { id: invoiceId }));
    return invoiceId;
  };
  const pay = async (invoiceId: string, amount: number, at: number, method: 'TRANSFER' | 'CHEQUE' | 'CASH' = 'TRANSFER') =>
    unwrap(await uc.recordPayment.execute(finance, { invoiceId, amountMillimes: DT(amount), date: day(at), method })).paymentId;
  const totalOf = async (invoiceId: string) => unwrap(await uc.getInvoice.execute(finance, { id: invoiceId })).totalMillimes / 1000;

  const inv1 = await invoice({ clientId: fintech, issue: -100, due: -70, lines: [{ d: 'Audit UX application mobile', unit: 4_500 }] });
  await pay(inv1, await totalOf(inv1), -72);

  const inv2 = await invoice({ clientId: horizon, issue: -75, due: -45, lines: [{ d: 'Campagne social media — octobre', unit: 2_100, qty: 2 }] });
  await pay(inv2, await totalOf(inv2), -50);

  const inv3 = await invoice({
    clientId: carthage,
    issue: -60,
    due: -30,
    projectId,
    milestoneId: acompte.id,
    lines: [{ d: 'Refonte e-commerce — acompte 30 %', unit: 5_400 }],
  });
  await pay(inv3, await totalOf(inv3), -35);

  // overdue, partially paid
  const inv4 = await invoice({ clientId: medina, issue: -55, due: -25, lines: [{ d: 'Site vitrine multilingue', unit: 2_800 }] });
  await pay(inv4, 1_000, -20, 'CHEQUE');

  // overdue, unpaid
  await invoice({
    clientId: sahel,
    issue: -50,
    due: -20,
    lines: [
      { d: 'Identité visuelle', unit: 3_500 },
      { d: 'Charte graphique (déclinaisons)', unit: 750, qty: 4 },
    ],
  });

  // cancelled
  const inv6 = await invoice({ clientId: medina, issue: -40, due: -10, lines: [{ d: 'Maintenance — doublon', unit: 600 }] });
  unwrap(await uc.cancelInvoice.execute(finance, { id: inv6, reason: 'Doublon de la facture de maintenance' }));

  // payment then reversal (cheque bounced) — open again
  const inv7 = await invoice({ clientId: olivia, issue: -25, due: 15, lines: [{ d: 'Shooting produits + retouches', unit: 2_000 }] });
  const bounced = await pay(inv7, 2_380, -15, 'CHEQUE');
  unwrap(await uc.reversePayment.execute(finance, { invoiceId: inv7, paymentId: bounced, reason: 'Chèque impayé', date: day(-12) }));

  // due soon
  await invoice({ clientId: olivia, issue: -30, due: 3, lines: [{ d: 'Newsletter mensuelle', unit: 1_950, vat: 1900 }] });
  // future receivables
  const inv9 = await invoice({ clientId: fintech, issue: -20, due: 10, lines: [{ d: 'Développement API partenaires', unit: 450, qty: 20 }] });
  const inv10 = await invoice({ clientId: horizon, issue: -10, due: 20, lines: [{ d: 'Production vidéo motion design', unit: 3_600 }] });
  await pay(inv10, 1_200, -5);
  await invoice({ clientId: sahel, issue: -5, due: 35, lines: [{ d: 'Campagne Google Ads — trimestre', unit: 6_500, vat: 1900 }] });

  // drafts
  await invoice({ clientId: fintech, issue: 0, due: 30, validate: false, lines: [{ d: 'Atelier design system', unit: 1_800 }] });
  await invoice({ clientId: carthage, issue: 0, due: 30, validate: false, lines: [{ d: 'Formation back-office', unit: 900, qty: 2 }] });

  // ── Dépenses ───────────────────────────────────────────────────────────
  const expense = async (
    who: Actor,
    o: { label: string; category: Parameters<UseCases['createExpense']['execute']>[1]['category']; amount: number; at: number; due?: number; supplierId?: string; projectId?: string; submit?: boolean; receipt?: boolean },
  ) =>
    unwrap(
      await uc.createExpense.execute(who, {
        label: o.label,
        category: o.category,
        amountMillimes: DT(o.amount),
        expenseDate: day(o.at),
        dueDate: o.due !== undefined ? day(o.due) : null,
        supplierId: o.supplierId ?? null,
        projectId: o.projectId ?? null,
        receipt: o.receipt === false ? null : receipt(o.label.toLowerCase().replace(/\W+/g, '-')),
        submit: o.submit ?? true,
      }),
    ).id;
  const approve = async (id: string) => unwrap(await uc.approveExpense.execute(owner, { id }));
  const markPaid = async (id: string, at: number) => unwrap(await uc.markExpensePaid.execute(finance, { id, date: day(at) }));

  const taxi = await expense(employee, { label: 'Taxi — rendez-vous client Sousse', category: 'TRAVEL', amount: 45, at: -30 });
  await approve(taxi);
  await markPaid(taxi, -28);

  const papeterie = await expense(finance, { label: 'Fournitures de bureau', category: 'SUPPLIES', amount: 640, at: -40, supplierId: bureau });
  await approve(papeterie);
  await markPaid(papeterie, -38);

  const hosting = await expense(finance, { label: 'Hébergement serveurs — trimestre', category: 'SOFTWARE', amount: 950, at: -3, due: 8, supplierId: cloudhost });
  await approve(hosting);

  const freelance = await expense(finance, {
    label: 'Intégration front (freelance)',
    category: 'SUBCONTRACTING',
    amount: 3_200,
    at: -8,
    due: 12,
    supplierId: pixel,
    projectId,
  });
  await approve(freelance);

  const salon = await expense(owner, { label: 'Stand salon Tunis Digital', category: 'MARKETING', amount: 2_400, at: -6, due: 18 });
  await approve(salon); // self-approval, audited with selfApproved = true

  const dejeuner = await expense(employee, { label: 'Déjeuner équipe', category: 'OTHER', amount: 120, at: -9 });
  unwrap(await uc.rejectExpense.execute(owner, { id: dejeuner, reason: 'Non pris en charge par la politique de frais' }));

  await expense(employee, { label: 'Fournitures atelier client', category: 'SUPPLIES', amount: 180, at: -2, due: 5 });
  await expense(employee, { label: 'Déplacement Sfax — tournage', category: 'TRAVEL', amount: 310, at: -1, due: 7 });
  await expense(finance, { label: 'Campagne LinkedIn Ads', category: 'MARKETING', amount: 1_500, at: -1, due: 14 });
  await expense(employee, { label: 'Abonnement Figma', category: 'SOFTWARE', amount: 260, at: 0, submit: false, receipt: false });

  // ── Trésorerie : correction manuelle ───────────────────────────────────
  unwrap(await uc.recordAdjustment.execute(finance, { direction: 'OUT', amountMillimes: 35_750, date: day(-15), reason: 'Frais bancaires trimestriels' }));

  // ── Flux prévus ────────────────────────────────────────────────────────
  const nextDay = (dom: number) => {
    let d = today;
    while (d.day !== Math.min(dom, 28)) d = d.addDays(1);
    return d.toString();
  };
  unwrap(await uc.createPlannedFlow.execute(finance, { label: 'Salaires', direction: 'OUT', amountMillimes: DT(9_500), expectedDate: nextDay(28), recurrence: 'MONTHLY' }));
  unwrap(await uc.createPlannedFlow.execute(finance, { label: 'Loyer des bureaux', direction: 'OUT', amountMillimes: DT(1_800), expectedDate: nextDay(5), recurrence: 'MONTHLY' }));
  unwrap(
    await uc.createPlannedFlow.execute(finance, {
      label: 'Contrat de maintenance annuel (à facturer)',
      direction: 'IN',
      amountMillimes: DT(4_000),
      expectedDate: day(20),
      recurrence: 'NONE',
    }),
  );

  // ── Scénario enregistré ────────────────────────────────────────────────
  unwrap(
    await uc.saveScenario.execute(owner, {
      name: 'Retard Tunis Fintech + recrutement',
      horizon: 90,
      adjustments: [
        { type: 'DELAY_RECEIVABLE', invoiceId: inv9, days: 30 },
        { type: 'ADD_OUTFLOW', label: 'Recrutement développeur (1er mois)', amountMillimes: DT(2_500), date: day(30) },
      ],
    }),
  );

  return { slug };
}

/** Convenience for scripts: throws with the failing code. */
export function must<T>(r: Result<T>): T {
  return unwrap(r);
}

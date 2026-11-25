import { expect, test } from '@playwright/test';
import { DEMO, isoDay, login, logout, RECEIPT_PNG, register, unique } from './helpers';

/**
 * The brief's defense scenario, end to end:
 * company with an opening balance → issue an invoice → partial payment → submit and approve
 * an expense → open the forecast → simulate a payment delay → compare both scenarios.
 */
test('soutenance: from company creation to the what-if comparison', async ({ page }) => {
  const id = unique();
  const ownerEmail = `owner-${id}@soutenance.test`;
  const ownerPassword = 'Soutenance2026!';
  const companyName = `Soutenance ${id}`;

  // 1. Create a company with an opening balance of 5 000 DT
  await register(page, 'Nadia Owner', ownerEmail, ownerPassword);
  await page.getByLabel(/^Nom de l'entreprise/).fill(companyName);
  await page.getByLabel(/^Solde initial/).fill('5 000');
  await page.getByRole('button', { name: "Créer l'entreprise" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const slug = new URL(page.url()).pathname.split('/')[1]!;
  await expect(page.getByText(/5\s000,000/).first()).toBeVisible();

  // the owner invites a finance manager and a collaborator (existing accounts)
  await page.goto(`/${slug}/settings/members`);
  for (const [email, role] of [
    [DEMO.finance, 'Gestionnaire financier'],
    [DEMO.employee, 'Collaborateur'],
  ] as const) {
    await page.getByRole('button', { name: 'Ajouter un membre' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^E-mail/).fill(email);
    await dialog.getByLabel(/^Rôle/).selectOption({ label: role });
    await dialog.getByRole('button', { name: 'Ajouter le membre' }).click();
    await expect(page.getByRole('cell', { name: email })).toBeVisible();
  }
  await logout(page);

  // 2. Finance: create a client and issue a 3 000 DT invoice due in 10 days
  await login(page, DEMO.finance);
  await page.goto(`/${slug}/clients?new=1`);
  await page.getByLabel(/^Raison sociale ou nom/).fill('Client Soutenance');
  await page.getByRole('button', { name: 'Créer le client' }).click();
  await expect(page.getByRole('link', { name: 'Client Soutenance' })).toBeVisible();

  await page.goto(`/${slug}/invoices/new`);
  await page.getByLabel(/^Client/).selectOption({ label: 'Client Soutenance' });
  await page.getByLabel(/^Échéance/).fill(isoDay(10));
  await page.getByLabel(/Désignation/).fill('Développement site web');
  await page.getByLabel('Prix unitaire HT').fill('3000');
  await page.getByLabel('TVA').selectOption('0');
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByRole('heading', { name: /Brouillon/ })).toBeVisible();
  await page.getByRole('button', { name: 'Valider la facture' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Valider la facture' }).click();
  await expect(page.getByText(/FAC-\d{4}-0001/).first()).toBeVisible();

  // 3. Partial payment of 1 000 DT → remaining 2 000, real balance 6 000
  await page.getByRole('button', { name: 'Enregistrer un encaissement' }).click();
  const payDialog = page.getByRole('dialog');
  await payDialog.getByLabel(/^Montant/).fill('1000');
  await payDialog.getByRole('button', { name: "Enregistrer l'encaissement" }).click();
  await expect(page.getByText('Partiellement payée')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /payée à 33 %/ })).toBeVisible();
  await page.goto(`/${slug}/treasury`);
  await expect(page.getByText(/6\s000,000/).first()).toBeVisible();
  await logout(page);

  // 4. The collaborator submits a 6 000 DT expense with a receipt, due in 15 days
  await login(page, DEMO.employee);
  await page.goto(`/${slug}/expenses/new`);
  await page.getByLabel(/^Montant/).fill('6000');
  await page.getByText('Logiciels & abonnements').click();
  await page.getByLabel(/^Libellé/).fill('Licences annuelles');
  await page.getByLabel('À payer avant le').fill(isoDay(15));
  await page.locator('input[type="file"][name="receipt"]').setInputFiles({ name: 'recu.png', mimeType: 'image/png', buffer: RECEIPT_PNG });
  await page.getByRole('button', { name: 'Soumettre la dépense' }).click();
  await expect(page).toHaveURL(/expenses\/mine/);
  await expect(page.getByText('Soumise · à valider')).toBeVisible();
  await logout(page);

  // 5. The owner approves it
  await login(page, ownerEmail, ownerPassword);
  await page.goto(`/${slug}/expenses/approvals`);
  await expect(page.getByRole('heading', { name: 'Licences annuelles' })).toBeVisible();
  await page.getByRole('button', { name: 'Approuver' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approuver la dépense' }).click();
  await expect(page.getByText('Rien à valider')).toBeVisible();

  // 6. Forecast: 6 000 real + 2 000 expected − 6 000 approved = 2 000 at J+30
  await page.goto(`/${slug}/forecast`);
  await expect(page.getByRole('heading', { name: /Solde prévisionnel — 30 jours/ })).toBeVisible();
  await expect(page.getByText(/Fin de période\s*:\s*2\s000,000/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Comment ce montant est calculé/ })).toBeVisible();

  // 7. Simulate a 20-day payment delay
  await page.goto(`/${slug}/simulations/new`);
  await expect(page.getByText("aucune donnée réelle n'est modifiée")).toBeVisible();
  await page.getByRole('button', { name: /Ajouter une hypothèse/ }).click();
  await page.getByRole('menuitem', { name: 'Retarder un encaissement' }).click();
  await expect(page.getByLabel('Retard (jours)')).toHaveValue('20');

  // 8. Compare: the lowest point drops by the delayed 2 000 DT; the end balance is unchanged
  const strip = page.getByRole('region', { name: 'Comparaison prévision / scénario' });
  await expect(strip.getByText(/2\s000,000\sDT/).first()).toBeVisible();
  await expect(strip.getByText(/−2\s000,000\sDT/)).toBeVisible();
  await expect(strip.getByText('inchangé')).toBeVisible();

  // saving the scenario never touches real data
  await page.getByLabel(/^Nom du scénario/).fill('Retard client 20 jours');
  await page.getByRole('button', { name: 'Enregistrer le scénario' }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/simulations/[\\w-]+$`));
  await page.goto(`/${slug}/treasury`);
  await expect(page.getByText(/6\s000,000/).first()).toBeVisible();
});

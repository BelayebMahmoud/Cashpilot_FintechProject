import { expect, test } from '@playwright/test';
import { DEMO, login, RECEIPT_PNG, unique } from './helpers';

test('expense flow: submit → reject with reason → cannot be paid', async ({ page }) => {
  const label = `Taxi aéroport ${unique()}`;

  await login(page, DEMO.employee);
  await page.goto('/atlas-digital/expenses/new');
  await page.getByLabel(/^Montant/).fill('85,500');
  await page.getByText('Déplacements').click();
  await page.getByLabel(/^Libellé/).fill(label);
  // submitting without receipt is refused by the server
  await page.getByRole('button', { name: 'Soumettre la dépense' }).click();
  await expect(page.getByText('Ajoutez un justificatif avant de soumettre la dépense.')).toBeVisible();
  await page.locator('input[type="file"][name="receipt"]').setInputFiles({ name: 'taxi.png', mimeType: 'image/png', buffer: RECEIPT_PNG });
  await page.getByRole('button', { name: 'Soumettre la dépense' }).click();
  await expect(page.getByRole('link', { name: label })).toBeVisible();
  await page.context().clearCookies();

  // the owner rejects it — a reason is required
  await login(page, DEMO.owner);
  await page.goto('/atlas-digital/expenses/approvals');
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await page.getByRole('button', { name: 'Refuser' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Refuser la dépense' })).toBeDisabled();
  await dialog.getByLabel(/^Motif du refus/).fill('Trajet personnel');
  await dialog.getByRole('button', { name: 'Refuser la dépense' }).click();
  await expect(page.getByRole('button', { name: new RegExp(label) })).toHaveCount(0);
  await page.context().clearCookies();

  // finance sees it as rejected, with no "mark as paid" action
  await login(page, DEMO.finance);
  await page.goto('/atlas-digital/expenses?tab=rejected');
  await page.getByRole('link', { name: label }).first().click();
  await expect(page.getByText('Trajet personnel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marquer comme payée' })).toHaveCount(0);
  await page.context().clearCookies();

  // the collaborator sees the decision and its reason
  await login(page, DEMO.employee);
  await expect(page.getByText(/Refusée/).first()).toBeVisible();
  await expect(page.getByText(/Trajet personnel/).first()).toBeVisible();
});

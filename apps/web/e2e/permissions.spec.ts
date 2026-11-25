import { expect, test } from '@playwright/test';
import { DEMO, login, register, unique } from './helpers';

test.describe('permissions', () => {
  test('EMPLOYEE cannot reach invoices or treasury and lands on "Mes dépenses"', async ({ page }) => {
    await login(page, DEMO.employee);
    await expect(page).toHaveURL(/\/atlas-digital\/expenses\/mine$/);
    const nav = page.getByRole('navigation', { name: 'Atlas Digital' });
    await expect(nav.getByRole('link', { name: 'Mes dépenses' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Factures' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Trésorerie' })).toHaveCount(0);

    for (const path of ['invoices', 'treasury', 'forecast', 'dashboard']) {
      await page.goto(`/atlas-digital/${path}`);
      await expect(page.getByText('Votre rôle ne permet pas cette action.')).toBeVisible();
    }
  });

  test('the sidebar differs per role', async ({ page }) => {
    await login(page, DEMO.owner);
    const nav = page.getByRole('navigation', { name: 'Atlas Digital' });
    await expect(nav.getByRole('link', { name: 'À valider' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Membres' })).toBeVisible();
    await page.context().clearCookies();
    await login(page, DEMO.finance);
    await expect(nav.getByRole('link', { name: 'À valider' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Membres' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Trésorerie' })).toBeVisible();
  });

  test('cross-company URL → 404 (existence never leaks)', async ({ page }) => {
    const id = unique();
    await register(page, 'Outsider', `outsider-${id}@test.tn`, 'Outsider2026!');
    await page.goto('/atlas-digital/dashboard');
    await expect(page.getByText("Cette ressource n'existe pas ou vous n'y avez pas accès.").first()).toBeVisible();
    await page.goto('/entreprise-inconnue/invoices');
    await expect(page.getByText("Cette ressource n'existe pas ou vous n'y avez pas accès.").first()).toBeVisible();
  });

  test('receipts and PDFs are never public', async ({ request }) => {
    const pdf = await request.get('/api/invoices/whatever/pdf?company=atlas-digital', { maxRedirects: 0 });
    expect([302, 303, 307, 401]).toContain(pdf.status());
    const receipt = await request.get('/api/expenses/whatever/receipt?company=atlas-digital', { maxRedirects: 0 });
    expect([302, 303, 307, 401]).toContain(receipt.status());
  });
});

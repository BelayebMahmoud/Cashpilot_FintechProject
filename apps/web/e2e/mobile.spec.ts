import { expect, test } from '@playwright/test';
import { DEMO, login } from './helpers';

// Chromium mobile emulation at 375 px (same engine as the other projects)
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test('mobile 375 px: collaborator flow and navigation sheet', async ({ page }) => {
  await login(page, DEMO.employee);
  await expect(page).toHaveURL(/expenses\/mine$/);
  // no horizontal scroll at phone width
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Nouvelle dépense' })).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: 'Nouvelle dépense' }).click();
  await expect(page).toHaveURL(/expenses\/new$/);

  // big amount field, category chips, sticky submit bar visible without scrolling to the end
  await expect(page.getByLabel(/^Montant/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Soumettre la dépense' })).toBeInViewport();
});

test('mobile 375 px: invoice list shows cards, not a wide table', async ({ page }) => {
  await login(page, DEMO.finance);
  await page.goto('/atlas-digital/invoices');
  await expect(page.getByRole('table')).toBeHidden();
  await expect(page.getByRole('listitem').getByText('Reste à payer').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

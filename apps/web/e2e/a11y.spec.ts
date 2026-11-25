import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEMO, login } from './helpers';

const PAGES = [
  'dashboard',
  'invoices',
  'payments',
  'expenses',
  'expenses/approvals',
  'treasury',
  'forecast',
  'simulations',
  'alerts',
  'clients',
  'projects',
  'settings/audit',
];

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: zero serious or critical violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, DEMO.owner);
    const failures: string[] = [];
    for (const path of PAGES) {
      await page.goto(`/atlas-digital/${path}`);
      await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      for (const v of violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
        failures.push(`${path}: ${v.id} (${v.impact}) — ${v.nodes.length} node(s): ${v.nodes[0]?.target.join(' ')}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
}

test('keyboard: skip link and command palette', async ({ page }) => {
  await login(page, DEMO.finance);
  await page.goto('/atlas-digital/dashboard'); // fresh document: focus starts at the top
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Aller à une page ou lancer une action…')).toBeVisible();
  await page.keyboard.type('Trésorerie');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/treasury$/);
});

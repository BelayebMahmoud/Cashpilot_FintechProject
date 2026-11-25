import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'CashPilot2026!';
export const DEMO = {
  owner: 'dirigeant@cashpilot.demo',
  finance: 'gestion@cashpilot.demo',
  employee: 'collab@cashpilot.demo',
};

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Mot de passe/).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

export async function register(page: Page, name: string, email: string, password: string) {
  await page.goto('/register');
  await page.getByLabel(/^Nom complet/).fill(name);
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Mot de passe/).fill(password);
  await page.getByLabel(/^Confirmer le mot de passe/).fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

/** "YYYY-MM-DD" in Africa/Tunis, offset by `days`. */
export function isoDay(days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Text of an element with narrow/no-break spaces normalised. */
export async function plainText(page: Page, selector: string): Promise<string> {
  return ((await page.locator(selector).first().textContent()) ?? '').replace(/[  ]/g, ' ');
}

export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A tiny valid PNG used as receipt. */
export const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

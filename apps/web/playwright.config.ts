import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against a production build. By default the app runs in DEMO_IN_MEMORY mode
 * (seeded "Atlas Digital", no database needed). Set E2E_BASE_URL to target a running server.
 */
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Tunis',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start --port ${PORT}`,
        url: `${baseURL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DEMO_IN_MEMORY: '1',
          AUTH_RATE_LIMIT: '0',
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-e2e!',
          BETTER_AUTH_URL: baseURL,
          NEXT_PUBLIC_APP_URL: baseURL,
          STORAGE_DIR: './.e2e-storage',
          APP_TIMEZONE: 'Africa/Tunis',
        },
      },
});

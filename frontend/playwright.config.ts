import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/fixtures/env';

/**
 * E2E против живого Vercel-деплоя (BASE_URL, по умолчанию
 * https://clubs-avandata.vercel.app). webServer НЕ поднимаем — тестируем
 * задеплоенный фронт + прод API. Учётки и override URL — в tests/e2e/.env.e2e
 * (не коммитится). Артефакты (скрин/видео/трейс) — только при падении.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
});

import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/fixtures/env';

/**
 * Если preview закрыт Vercel Deployment Protection — задай секрет
 * VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Settings → Deployment Protection →
 * Protection Bypass for Automation). Шлём его заголовком на каждый запрос +
 * просим Vercel поставить bypass-cookie, чтобы и client-side навигации прошли.
 */
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders = bypassSecret
  ? {
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    }
  : undefined;

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
  // Serial: каждый тест логинится через UI, а прод-бэк (Render, argon2) не тянет
  // параллельные логины одним пользователем — конкурентные входы упираются в
  // таймаут/рейт-лимит. Один воркер = входы по очереди, стабильно.
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Одноразовый логин → storageState (см. auth.setup.ts).
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],
});

import { test, expect } from '@playwright/test';
import { getCreds, loginViaUI, enterTenantAsAdmin } from '../fixtures/auth';
import { ENTER_SLUG } from '../fixtures/env';

const admin = getCreds('admin');

test.describe('Кабинет тренера · дашборд клуба (admin → войти в клуб)', () => {
  test.skip(!admin, 'E2E_ADMIN_* не заданы в .env.e2e');

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, admin!);
    await enterTenantAsAdmin(page, ENTER_SLUG);
  });

  test('дашборд /club рендерится с контентом', async ({ page }) => {
    const dash = page.getByTestId('club-dashboard');
    await expect(dash).toBeVisible({ timeout: 20_000 });
    await expect(dash).not.toBeEmpty();
    await page.screenshot({ path: 'artifacts/coach-dashboard.png', fullPage: true });
  });

  test('боковая навигация присутствует', async ({ page }) => {
    await expect(page.locator('[data-nav-id="club"]')).toBeVisible();
    await expect(page.locator('[data-nav-id="matches"]')).toBeVisible();
    await expect(page.locator('[data-nav-id="calendar"]')).toBeVisible();
  });
});

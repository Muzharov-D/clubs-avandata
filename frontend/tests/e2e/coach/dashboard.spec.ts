import { test, expect } from '@playwright/test';
import { getCreds, enterTenantAsAdmin } from '../fixtures/auth';
import { ENTER_SLUG } from '../fixtures/env';
import { ADMIN_STATE } from '../fixtures/state';

const admin = getCreds('admin');

/**
 * Вход в кабинет клуба через admin → «войти в клуб». Проверяем оболочку кабинета
 * (сайдбар + URL /club), а не полную загрузку дашборда: рендер данных дашборда
 * зависит от наличия активной команды/матчей в проде и не должен валить тест входа.
 */
test.describe('Кабинет клуба (admin → войти в клуб)', () => {
  test.skip(!admin, 'E2E_ADMIN_* не заданы в .env.e2e');
  test.use({ storageState: ADMIN_STATE });

  test.beforeEach(async ({ page }) => {
    await enterTenantAsAdmin(page, ENTER_SLUG);
  });

  test('оболочка кабинета (сайдбар) рендерится на /club', async ({ page }) => {
    await expect(page).toHaveURL(/\/club/);
    await expect(page.locator('[data-nav-id="club"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-nav-id="matches"]')).toBeVisible();
    await expect(page.locator('[data-nav-id="calendar"]')).toBeVisible();
    await page.screenshot({ path: 'artifacts/coach-cabinet.png', fullPage: true });
  });
});

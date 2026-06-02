import { test, expect } from '@playwright/test';
import { getCreds, enterTenantAsAdmin } from '../fixtures/auth';
import { ENTER_SLUG } from '../fixtures/env';
import { ADMIN_STATE } from '../fixtures/state';

const admin = getCreds('admin');

/** Разделы кабинета тренера: nav-id → ожидаемый префикс URL. */
const SECTIONS = [
  { navId: 'analytics', url: /\/analytics/ },
  { navId: 'matches', url: /\/matches/ },
  { navId: 'calendar', url: /\/calendar/ },
  { navId: 'trainings', url: /\/trainings/ },
  { navId: 'players', url: /\/players/ },
  { navId: 'load', url: /\/load/ },
] as const;

test.describe('Кабинет тренера · навигация по разделам (admin → войти в клуб)', () => {
  test.skip(!admin, 'E2E_ADMIN_* не заданы в .env.e2e');
  test.use({ storageState: ADMIN_STATE });

  test.beforeEach(async ({ page }) => {
    await enterTenantAsAdmin(page, ENTER_SLUG);
    // Готовность кабинета = сайдбар (не загрузка данных дашборда).
    await expect(page.locator('[data-nav-id="club"]')).toBeVisible({ timeout: 20_000 });
  });

  for (const section of SECTIONS) {
    test(`раздел «${section.navId}» открывается без падений`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      const navBtn = page.locator(`[data-nav-id="${section.navId}"]`);
      // Раздел может отсутствовать у роли — тогда пропускаем.
      test.skip((await navBtn.count()) === 0, `нет раздела ${section.navId} у этой роли`);

      await navBtn.click();
      await expect(page).toHaveURL(section.url, { timeout: 15_000 });
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
});

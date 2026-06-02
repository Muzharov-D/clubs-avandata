import { test as setup } from '@playwright/test';
import { getCreds, loginViaUI } from './fixtures/auth';
import { ADMIN_STATE } from './fixtures/state';

/**
 * Одноразовый логин admin → сохраняем сессию в storageState. Все admin/coach
 * спеки переиспользуют её (test.use storageState), не логинясь повторно. Это
 * держит число логинов на прогон в пределах 2-3 и не триггерит рейт-лимит.
 */
setup('authenticate as admin', async ({ page }) => {
  const admin = getCreds('admin');
  setup.skip(!admin, 'E2E_ADMIN_* не заданы в .env.e2e');
  await loginViaUI(page, admin!);
  await page.context().storageState({ path: ADMIN_STATE });
});

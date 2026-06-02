import { test, expect } from '@playwright/test';
import { getCreds, loginViaUI } from '../fixtures/auth';

const admin = getCreds('admin');

test.describe('Авторизация', () => {
  test('неверные учётные данные → ошибка, остаёмся на /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('e2e-no-such-user@example.com');
    await page.getByTestId('login-password').fill('definitely-wrong-password');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('platform_admin входит и попадает в админку', async ({ page }) => {
    test.skip(!admin, 'E2E_ADMIN_* не заданы в .env.e2e');
    await loginViaUI(page, admin!);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    await expect(page.getByTestId('admin-add-tenant')).toBeVisible();
  });
});

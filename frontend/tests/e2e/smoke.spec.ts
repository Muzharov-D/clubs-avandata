import { test, expect } from '@playwright/test';

/**
 * Smoke — публичные экраны открываются без авторизации и без падений.
 * Безопасно даже против прода (только чтение).
 */
test.describe('Smoke · публичные экраны', () => {
  test('страница входа рендерит форму', async ({ page }) => {
    const resp = await page.goto('/login');
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.getByTestId('login-username')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('лендинг платформы открывается', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status()).toBeLessThan(400);
    // Лендинг AvandataLanding — ждём появления контента в <body>.
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('нет фатальных ошибок страницы в консоли логина', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/login');
    await expect(page.getByTestId('login-submit')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

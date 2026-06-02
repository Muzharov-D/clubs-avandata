import { test, expect, type APIRequestContext } from '@playwright/test';
import { getCreds, loginViaUI, readAccessToken } from '../fixtures/auth';

const admin = getCreds('admin');

/**
 * Teardown тестового клуба. Сначала пробуем жёсткий DELETE (новый эндпоинт),
 * при неудаче (ещё не задеплоен на прод-бэк) — фолбэк на PATCH status=archived,
 * чтобы клуб хотя бы скрылся и не висел активным. Идемпотентно, ошибки гасим.
 */
async function teardownTenant(
  request: APIRequestContext,
  baseURL: string,
  slug: string,
  token: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const del = await request.delete(
      `${baseURL}/api/v1/admin/tenants/${slug}?confirm=${slug}`,
      { headers },
    );
    if (del.ok()) return;
  } catch {
    /* эндпоинт мог быть ещё не задеплоен — уходим в фолбэк */
  }
  await request
    .patch(`${baseURL}/api/v1/admin/tenants/${slug}`, {
      headers,
      data: { status: 'archived' },
    })
    .catch(() => undefined);
}

test.describe('Платформа · admin клубы (write-флоу)', () => {
  test.skip(!admin, 'E2E_ADMIN_* не заданы в .env.e2e');

  let createdSlug: string | null = null;
  let adminToken: string | null = null;

  test.afterEach(async ({ request, baseURL }) => {
    if (createdSlug && adminToken && baseURL) {
      await teardownTenant(request, baseURL, createdSlug, adminToken);
      createdSlug = null;
    }
  });

  test('список клубов рендерится', async ({ page }) => {
    await loginViaUI(page, admin!);
    await page.goto('/admin');
    const grid = page.getByTestId('tenants-grid');
    const empty = page.locator('.admin-empty');
    await expect(grid.or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('создать клуб → появляется в списке → войти как тенант → удалить', async ({ page }) => {
    await loginViaUI(page, admin!);
    adminToken = await readAccessToken(page);
    expect(adminToken, 'access-токен не найден в localStorage').toBeTruthy();

    const slug = `e2e-${Math.random().toString(36).slice(2, 8)}`;

    // 1. Создание
    await page.goto('/admin/tenants/new');
    await page.getByTestId('tenant-name').fill(`E2E Тест ${slug}`);
    await page.getByTestId('tenant-displayname').fill(`E2E ${slug}`);
    await page.getByTestId('tenant-slug').fill(slug);
    await page.getByTestId('tenant-coach-email').fill(`coach-${slug}@e2e.local`);
    await page.getByTestId('tenant-coach-name').fill('E2E Тренер');
    await page.getByTestId('tenant-submit').click();

    // Подтверждение создания — помечаем slug для teardown СРАЗУ.
    await expect(page.getByTestId('created-slug')).toHaveText(slug, { timeout: 20_000 });
    createdSlug = slug;

    // 2. Появился в списке клубов
    await page.goto('/admin');
    const card = page.locator(`[data-testid="tenant-card"][data-slug="${slug}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // 3. Войти в клуб как админ (view-as-tenant) → редирект в кабинет /club
    await card.getByTestId('tenant-enter').click();
    await expect(page).toHaveURL(/\/club/, { timeout: 20_000 });
  });
});

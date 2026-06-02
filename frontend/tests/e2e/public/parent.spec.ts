import { test, expect } from '@playwright/test';
import { PUBLIC_SLUG, PUBLIC_AGE } from '../fixtures/env';

/**
 * Публичный родительский экран /m/{slug}/team/{age} — без авторизации.
 * Либо рендерится команда (data-testid=public-team), либо корректный пустой
 * экран (.pub__empty). Падений быть не должно.
 */
test.describe('Публичный экран родителя', () => {
  test(`/m/${PUBLIC_SLUG}/team/${PUBLIC_AGE} открывается без auth`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const resp = await page.goto(`/m/${PUBLIC_SLUG}/team/${PUBLIC_AGE}`);
    expect(resp?.status()).toBeLessThan(400);

    // Скелетон «Загружаем…» сменяется либо командой, либо пустым экраном.
    const loaded = page.getByTestId('public-team');
    const empty = page.locator('.pub__empty');
    await expect(loaded.or(empty)).toBeVisible({ timeout: 15_000 });

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

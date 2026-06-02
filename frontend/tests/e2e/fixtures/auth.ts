/**
 * Auth-хелперы для e2e: чтение тестовых учёток из .env.e2e + UI-логин.
 *
 * Логинимся через реальную форму (а не API) — это и есть проверяемый флоу.
 * После логина access-токен оседает в localStorage (`avandata.auth.token`),
 * refresh — в HttpOnly-cookie. Если креды роли не заданы — соответствующий
 * describe помечается test.skip, suite остаётся зелёным.
 */
import { type Page, expect } from '@playwright/test';
import './env';

export type Role = 'admin' | 'coach' | 'player';

export interface Creds {
  username: string;
  password: string;
}

const ENV_PREFIX: Record<Role, string> = {
  admin: 'E2E_ADMIN',
  coach: 'E2E_COACH',
  player: 'E2E_PLAYER',
};

/** Учётка роли из env или null, если не задана. */
export function getCreds(role: Role): Creds | null {
  const prefix = ENV_PREFIX[role];
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!username || !password) return null;
  return { username, password };
}

/**
 * Полная навигация с ретраем на net::ERR_ABORTED. У SPA сразу после
 * login-редиректа `page.goto` на внутренний маршрут может быть прерван
 * собственной client-side навигацией приложения (AuthContext.fetchMe →
 * ре-рендер/редирект). Ретраим — это устраняет гонку без хрупких таймаутов.
 */
export async function gotoSafe(page: Page, path: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(path);
      return;
    } catch (e) {
      const aborted = e instanceof Error && /ERR_ABORTED/.test(e.message);
      if (aborted && attempt < 2) {
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        continue;
      }
      throw e;
    }
  }
}

/** Залогиниться через UI-форму и дождаться ухода с /login (редирект по роли). */
export async function loginViaUI(page: Page, creds: Creds): Promise<void> {
  await gotoSafe(page, '/login');
  await page.getByTestId('login-username').fill(creds.username);
  await page.getByTestId('login-password').fill(creds.password);
  await page.getByTestId('login-submit').click();
  // По успеху форма редиректит по роли (admin → /admin, coach → /club).
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
  // Даём SPA доселиться (fetchMe + редирект), чтобы следующий goto не прервался.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** Достать access-токен из localStorage (для teardown-запросов к admin API). */
export async function readAccessToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('avandata.auth.token'));
}

/**
 * Войти в клуб как platform_admin (view-as-tenant): со страницы /admin кликнуть
 * «Войти в клуб» у нужного tenant → редирект в кабинет /club как head_coach.
 * Используется для тренерских флоу без отдельной учётки тренера.
 */
export async function enterTenantAsAdmin(page: Page, slug: string): Promise<void> {
  // После admin-логина мы уже на /admin; идём туда лишь если это не так.
  if (!/\/admin(\/|$|\?)/.test(page.url())) {
    await gotoSafe(page, '/admin');
  }
  const card = page.locator(`[data-testid="tenant-card"][data-slug="${slug}"]`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByTestId('tenant-enter').click();
  await expect(page).toHaveURL(/\/club/, { timeout: 20_000 });
}

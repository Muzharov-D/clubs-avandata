/**
 * Загрузчик .env.e2e — без внешних зависимостей (dotenv не в devDeps фронта).
 *
 * Файл `frontend/tests/e2e/.env.e2e` НЕ коммитится (см. .gitignore). В нём —
 * учётки тестовых пользователей и при желании override базового URL. Загрузка
 * срабатывает как side-effect при импорте этого модуля (его импортируют и
 * playwright.config.ts, и fixtures/auth.ts), поэтому process.env заполнен и в
 * главном процессе, и в каждом worker'е.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(here, '..', '.env.e2e');

function loadE2EEnv(): void {
  if (!existsSync(ENV_PATH)) return;
  const content = readFileSync(ENV_PATH, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Не перетираем реальный process.env (CI задаёт переменные напрямую).
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadE2EEnv();

/** Боевой URL Vercel-деплоя по умолчанию; override через E2E_BASE_URL. */
export const BASE_URL = process.env.E2E_BASE_URL || 'https://clubs-avandata.vercel.app';

/** slug/age публичного родительского экрана для smoke (по умолчанию Легирус). */
export const PUBLIC_SLUG = process.env.E2E_PUBLIC_SLUG || 'legirus';
export const PUBLIC_AGE = process.env.E2E_PUBLIC_AGE || '2010';

/** Клуб, в который admin «входит» для проверки тренерских флоу. */
export const ENTER_SLUG = process.env.E2E_ENTER_SLUG || 'legirus';

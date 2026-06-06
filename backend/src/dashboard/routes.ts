import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { UnauthorizedError, BadRequestError } from '../shared/errors.js';

/**
 * Конструктор кабинета — per-user видимость блоков/графиков по страницам.
 *
 * Паттерн как в callups/trainings: JWT (authenticate) + явная фильтрация по
 * tenant_id И user_id + withTenant (ставит app.tenant_id для RLS). Таблица
 * dashboard_layouts под FORCE RLS (drizzle/0010) — обращения только через withTenant.
 *
 * Контракт с фронтом (services/api.js + DashboardLayoutContext):
 *   GET  /dashboard/layout         → { layout: { "<pageId>": { "<blockId>": false } } }
 *   PUT  /dashboard/layout { layout } → { ok: true }
 * Семантика значения: false = блок скрыт; отсутствие ключа = блок видим (дефолт).
 * Храним per-user одну строку; PUT заменяет весь конфиг (атомарно, одна строка).
 */

// Защита от «раздувания»: конфиг — маленький объект флагов. Ограничиваем и
// размер JSON, и число страниц/блоков, чтобы клиент не записал произвольный мусор.
const MAX_LAYOUT_BYTES = 16_384;
const MAX_PAGES = 64;
const MAX_BLOCKS_PER_PAGE = 256;

/**
 * Нормализует пришедший layout до { [pageId]: { [blockId]: boolean } }.
 * Бросает BadRequestError при структурном нарушении. Лишние/нестроковые ключи и
 * не-булевые значения отбрасываются — наружу попадает только валидная форма.
 */
function normalizeLayout(raw: unknown): Record<string, Record<string, boolean>> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestError('layout должен быть объектом');
  }
  const pages = Object.entries(raw as Record<string, unknown>);
  if (pages.length > MAX_PAGES) throw new BadRequestError('слишком много страниц в layout');

  // null-proto объекты + денилист ключей — никакого prototype-pollution из тела.
  const isUnsafeKey = (k: string) => k === '__proto__' || k === 'constructor' || k === 'prototype';
  const out: Record<string, Record<string, boolean>> = Object.create(null);
  for (const [pageId, blocks] of pages) {
    if (!pageId || isUnsafeKey(pageId) || blocks === null || typeof blocks !== 'object' || Array.isArray(blocks)) {
      throw new BadRequestError(`некорректная страница в layout: ${pageId}`);
    }
    const entries = Object.entries(blocks as Record<string, unknown>);
    if (entries.length > MAX_BLOCKS_PER_PAGE) {
      throw new BadRequestError(`слишком много блоков на странице ${pageId}`);
    }
    const page: Record<string, boolean> = Object.create(null);
    for (const [blockId, value] of entries) {
      if (!blockId || isUnsafeKey(blockId)) continue;
      if (typeof value !== 'boolean') continue; // храним только явные булевы флаги
      page[blockId] = value;
    }
    // Пустую страницу не храним — это «дефолт, всё видимо».
    if (Object.keys(page).length > 0) out[pageId] = page;
  }
  return out;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  function tenantId(req: { user?: { tenantId: string | null } }): string {
    const id = req.user?.tenantId;
    if (!id) throw new UnauthorizedError('tenant context required');
    return id;
  }
  function userId(req: { user?: { sub?: string } }): string {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedError('user context required');
    return id;
  }

  // GET /dashboard/layout — конфиг видимости текущего пользователя.
  // Пусто (новый юзер / игрок) → { layout: {} } = всё видимо по умолчанию.
  app.get('/dashboard/layout', async (req) => {
    const slug = tenantId(req);
    const uid = userId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query<{ layout: Record<string, Record<string, boolean>> }>(
        `SELECT layout FROM dashboard_layouts WHERE tenant_id = $1 AND user_id = $2`,
        [slug, uid],
      );
      return { layout: rows[0]?.layout ?? {} };
    });
  });

  // PUT /dashboard/layout — заменить весь конфиг видимости пользователя.
  // Body: { layout: { "<pageId>": { "<blockId>": false } } }
  app.put<{ Body: { layout?: unknown } }>('/dashboard/layout', async (req) => {
    const slug = tenantId(req);
    const uid = userId(req);

    // Размер режем по СЫРОМУ телу — до O(pages×blocks) обхода в normalizeLayout.
    const rawJson = JSON.stringify(req.body?.layout ?? {});
    if (rawJson.length > MAX_LAYOUT_BYTES) {
      throw new BadRequestError('layout слишком большой');
    }
    const layout = normalizeLayout(req.body?.layout);
    const json = JSON.stringify(layout);

    return withTenant(slug, async (_tx, conn) => {
      await conn.query(
        `INSERT INTO dashboard_layouts (tenant_id, user_id, layout, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (tenant_id, user_id) DO UPDATE
           SET layout = EXCLUDED.layout, updated_at = now()`,
        [slug, uid, json],
      );
      return { ok: true };
    });
  });
}

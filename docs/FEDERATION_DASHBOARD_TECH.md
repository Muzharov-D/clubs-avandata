# Дашборд федерации — технический план реализации (F0 + F1)

> Сопровождает `docs/FEDERATION_DASHBOARD_PLAN.md` (что и зачем). Здесь — **как**:
> слайсы-PR, сигнатуры, пути файлов, наброски SQL и формы ответов. Это план, не
> реализация: код приведён как контракт-эскиз, а не готовый к вставке.
>
> Зафиксировано (Часть VII плана, решено 2026-06-14): федерация = **региональный
> регулятор (ФФСПб)**, роль `federation_admin` (`tenant_id = NULL`, claim
> `federationId`), **read-only**, **region-scoped**. Новые таблицы `federations` и
> `federation_tenants`. Хелпер `withFederation()` — брат `withBypassRLS`, только
> чтение, фильтр по членству. Приватность детей через единый шов `data_consent`.
> MVP-эндпоинты F1: `overview`, `clubs`, `competitions`.

## Принципы, которым следует план (из CLAUDE.md)

- Фича = модуль `backend/src/federation/` + `frontend/src/routes/federation/` +
  schema-файлы `backend/src/db/schema/federations.ts`, `federationTenants.ts`.
- Миграции — idempotent `drizzle/00XX_*.sql` (`CREATE TABLE IF NOT EXISTS`,
  `to_regclass`-guard, как `0007_force_rls_isolation.sql`); прогоняются и из CLI
  (`npm run db:migrate`), и на старте `server.ts` через `runMigrations()`.
- TypeScript strict, без `any` без обоснования. Файлы добавляем поимённо (не
  `git add -A`). Язык UI — русский без англицизмов.
- Изоляция тенантов **тотальна**: каждый кросс-тенантный SELECT несёт явный
  `WHERE tenant_id IN (...)`; RLS — defense-in-depth (на managed-PG, где роль =
  owner с bypass, FORCE инертен — поэтому app-layer фильтр обязателен, см. §F0-2).
- Каждый слайс — отдельный PR со своим тестом; слайсы обратимы и не ломают
  существующий клубный контур.

## Порядок слайсов (обзор)

| # | Слайс | Тип | Главный артефакт | Тест/гейт |
|---|-------|-----|------------------|-----------|
| F0-1 | Schema + миграция таблиц | BE/DB | `federations.ts`, `federationTenants.ts`, `0011_federations.sql` | `verifySchema` + schema-drift |
| F0-2 | RLS на новые таблицы | DB | `0012_federation_rls.sql` | RLS-тест (расширение) |
| F0-3 | `withFederation()` | BE | `tenantContext.ts` | unit на фильтр-членство |
| F0-4 | Роль `federation_admin` (JWT, authorize, users-чек) | BE | `jwt.ts`, `middleware.ts`, `0013_federation_admin_role.sql` | tsc + login-тест |
| F0-5 | Сид ffspb + членство | BE | `seedFederation.ts` | ручной прогон + повтор-идемпотентность |
| F0-6 | RLS-тест: «федерация А не видит регион Б» | Test | `test-rls-isolation.mjs` (+кейс) | CI rls-гейт |
| F0-7 | Каркас кабинета FE (Sidebar, ProtectedRoute) | FE | `routes/federation/*`, `App.tsx` | build |
| F1-1 | `GET /federation/overview` + экран | BE+FE | `federation/routes.ts`, `Overview.tsx` | build + smoke |
| F1-2 | `GET /federation/clubs` + экран | BE+FE | `aggregations.ts`, `Clubs.tsx` | build + smoke |
| F1-3 | `GET /federation/competitions` + экран | BE+FE | `routes.ts`, `Competitions.tsx` | build + smoke |

Логика порядка: сперва **данные недостижимы без членства** (F0-1..F0-3) → потом
**кто-то может войти** (F0-4) → **есть что показать** (F0-5) → **доказали
изоляцию** (F0-6) → **пустой кабинет** (F0-7) → **три экрана** (F1). Каждый
бэкенд-слайс самодостаточен: даже если FE отстаёт, эндпоинт проверяется curl'ом.

---

# F0 — Каркас федерации

## F0-1. Drizzle schema + idempotent миграция

**Файлы:**
`backend/src/db/schema/federations.ts`, `backend/src/db/schema/federationTenants.ts`,
правка `backend/src/db/schema/index.ts` (+2 экспорта),
`backend/drizzle/0011_federations.sql`.

**`federations.ts`** (стиль `tenants.ts` — text-PK slug, jsonb-дефолты через `sql`):

```ts
import { pgTable, text, jsonb, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const federations = pgTable(
  'federations',
  {
    slug: text('slug').primaryKey(),               // 'ffspb', 'mro-szfo'
    name: text('name').notNull(),                  // 'Федерация футбола Санкт-Петербурга'
    region: text('region').notNull(),              // 'Санкт-Петербург'
    parentBody: text('parent_body'),               // 'РФС' | 'МРО Северо-Запад' | null
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`), // {ages,modules}
    brand: jsonb('brand').notNull().default(sql`'{}'::jsonb`),       // white-label как tenants.brand
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [check('federations_status_chk', sql`${t.status} IN ('active','suspended','archived')`)],
);

export type Federation = typeof federations.$inferSelect;
export type FederationInsert = typeof federations.$inferInsert;
```

**`federationTenants.ts`** (членство many-to-many; FK на оба slug с `cascade`,
композитный PK как `matchPlayers.ts`):

```ts
import { pgTable, text, timestamp, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { federations } from './federations.js';
import { tenants } from './tenants.js';

export const federationTenants = pgTable(
  'federation_tenants',
  {
    federationSlug: text('federation_slug')
      .notNull()
      .references(() => federations.slug, { onDelete: 'cascade' }),
    tenantSlug: text('tenant_slug')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    tier: text('tier').notNull().default('listed'),     // 'full' (на платформе) | 'listed' (только в фиде)
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.federationSlug, t.tenantSlug] }),
    index('federation_tenants_fed_idx').on(t.federationSlug, t.tier),  // под фильтр членства
    check('federation_tenants_tier_chk', sql`${t.tier} IN ('full','listed')`),
  ],
);

export type FederationTenant = typeof federationTenants.$inferSelect;
export type FederationTenantInsert = typeof federationTenants.$inferInsert;
```

> Замечание про `tier='listed'`: клуб не на платформе живёт только как имя в
> `standings.tableData` / `matches.*_team_name` — у него нет строки в `tenants`,
> значит FK `tenant_slug → tenants.slug` его удержать не может. Поэтому
> **членство `listed` для клубов вне платформы в F0/F1 НЕ материализуем строкой** —
> «открытый слой» F1-3 строится из `standings` напрямую (см. F1-3, риск дедупа).
> `federation_tenants` в F0/F1 содержит только `full`-клубы (есть в `tenants`).
> `listed` остаётся в схеме как форма для F2+, когда заведём «теневой реестр»
> клубов-нетенантов. Это сознательно сужает F0, сохраняя расширяемость.

**`0011_federations.sql`** (idempotent, в стиле их `*.sql`):

```sql
-- =============================================================================
-- 0011 Federations — региональный регулятор над клубами-тенантами (F0).
-- Две новые таблицы; RLS для них — отдельной миграцией 0012 (как 0003/0007).
-- =============================================================================

CREATE TABLE IF NOT EXISTS federations (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  region       TEXT NOT NULL,
  parent_body  TEXT,
  settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT federations_status_chk CHECK (status IN ('active','suspended','archived'))
);

CREATE TABLE IF NOT EXISTS federation_tenants (
  federation_slug TEXT NOT NULL REFERENCES federations(slug) ON DELETE CASCADE,
  tenant_slug     TEXT NOT NULL REFERENCES tenants(slug)     ON DELETE CASCADE,
  tier            TEXT NOT NULL DEFAULT 'listed',
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (federation_slug, tenant_slug),
  CONSTRAINT federation_tenants_tier_chk CHECK (tier IN ('full','listed'))
);

CREATE INDEX IF NOT EXISTS federation_tenants_fed_idx
  ON federation_tenants (federation_slug, tier);
```

**Тест слайса:** расширить `backend/src/scripts/verifySchema.ts` (или `db:studio`
sanity) — проверить, что `drizzle-kit` не видит drift между schema-файлами и БД
после миграции (это и есть CI schema-drift гейт). Обе таблицы должны
существовать, FK/CHECK на месте.

---

## F0-2. RLS-стратегия для новых таблиц и для cross-tenant чтения

**Файл:** `backend/drizzle/0012_federation_rls.sql`.

Три отдельных вопроса — решаем явно.

### (а) RLS на сами `federations` / `federation_tenants`

Это **не** tenant-scoped таблицы (у них нет `tenant_id`; строка федерации видна
всем её админам). Поэтому политику `tenant_isolation` к ним **не** применяем.
Достаточно того, что доступ к этим таблицам идёт только из `withFederation`/
`withBypassRLS` (никогда из `withTenant`-клиентских роутов). Включаем RLS с
**deny-by-default**-страховкой: видно только при `app.bypass_rls='on'` (админ/
сид/`withFederation` ставит этот флаг — см. F0-3) — клиентский клубный коннект
эти таблицы не прочитает вовсе.

```sql
-- federations / federation_tenants: не tenant-scoped. RLS = fail-closed,
-- читаются только под bypass-флагом (withFederation/withBypassRLS его ставят).
DO $$
DECLARE t TEXT; fed_tables TEXT[] := ARRAY['federations','federation_tenants'];
BEGIN
  FOREACH t IN ARRAY fed_tables LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS federation_bypass_only ON %I', t);
      EXECUTE format($f$
        CREATE POLICY federation_bypass_only ON %I
          USING (current_setting('app.bypass_rls', true) = 'on')
          WITH CHECK (current_setting('app.bypass_rls', true) = 'on')
      $f$, t);
    END IF;
  END LOOP;
END $$;
```

### (б) Cross-tenant чтение клубных данных федерацией — как `withFederation` строит фильтр

Существующая политика `tenant_isolation` (миграция `0007`) на `teams/players/
matches/match_players/standings/...` пускает строку, если
`app.bypass_rls='on'` **ИЛИ** `tenant_id = app.tenant_id`. Федерация видит
**много** тенантов — одного `app.tenant_id` мало. Поэтому:

1. `withFederation` ставит **`app.bypass_rls='on'`** (как `withBypassRLS`) —
   чтобы RLS не резал строки по одному `app.tenant_id`; плюс ставит
   `app.federation_id = <slug>` (информативно, для аудита/логов и потенциальной
   будущей RLS-политики).
2. **Истинная** изоляция федерации — **на уровне запроса**: каждый SELECT в
   `aggregations.ts` несёт обязательный предикат членства

   ```sql
   AND tenant_id IN (
     SELECT tenant_slug FROM federation_tenants
      WHERE federation_slug = $1 AND tier = 'full'
   )
   ```

   Это тот же подход «изоляция на application-уровне, RLS как defense-in-depth»,
   что зафиксирован в `0004_relax_rls.sql` и `data/routes.ts` (там на managed-PG
   owner и так bypass'нут — живёт именно app-layer `WHERE tenant_id`).

**Почему это безопасно:**
- Клуб **вне** федерации не входит в подзапрос членства → не попадает в выборку,
  даже если физически bypass включён. Один шов фильтрации (через
  `federationMembershipFilter()` ниже), который нельзя «забыть по-тихому»: см.
  риск R1 и тест F0-6, который ловит именно забытый фильтр.
- `federation_admin` **никогда** не ходит через `withTenant` (там стоит
  `app.bypass_rls='off'`, и он увидел бы 0 чужих строк) и **никогда** не пишет —
  `withFederation` экспонирует только read-путь.
- Существующий клубный контур не трогаем: политика `tenant_isolation`, поведение
  `withTenant`/`withBypassRLS`, набор FORCE-таблиц — без изменений. Миграция 0012
  только **добавляет** политики на 2 новые таблицы.

### (в) Подзапрос членства как «один шов»

Чтобы фильтр не расползался копипастой по эндпоинтам, выносим его в helper-строку
(SQL-фрагмент) + параметр:

```ts
// backend/src/federation/aggregations.ts
/** SQL-фрагмент для WHERE: ограничивает выборку клубами федерации (tier=full).
 *  Использовать ВЕЗДЕ, где федерация читает tenant-scoped данные. $1 = federationSlug. */
export const FED_MEMBERSHIP_SQL =
  `tenant_id IN (SELECT tenant_slug FROM federation_tenants
                  WHERE federation_slug = $1 AND tier = 'full')`;
```

> Управляемая PG, где FORCE инертен: на Render роль приложения — owner и обходит
> RLS (это прямо описано в `0007`). Значит вся реальная изоляция федерации лежит
> на `FED_MEMBERSHIP_SQL`. Тест F0-6 проверяет фильтр **на непривилегированной
> роли `rls_app`**, где видно и эффект RLS, и эффект app-фильтра — то есть ловит
> регрессию независимо от того, инертен FORCE или нет.

---

## F0-3. Сигнатура `withFederation()` в `tenantContext.ts`

**Файл:** `backend/src/db/tenantContext.ts` (добавить рядом с
`withTenant`/`withBypassRLS`, тем же стилем «connect → set_config → finally
reset»).

```ts
/**
 * Read-only cross-tenant контекст региональной федерации.
 *
 * Ставит app.bypass_rls='on' (чтобы RLS не резал по одному app.tenant_id —
 * федерация видит много клубов) и app.federation_id=<slug> (аудит/логи). РЕАЛЬНАЯ
 * изоляция — на уровне запроса: каждый SELECT обязан нести FED_MEMBERSHIP_SQL
 * (tenant_id IN членство федерации). Запись запрещена соглашением: helper
 * экспонируется только из federation/* read-роутов; federation_admin не имеет
 * write-эндпоинтов. В finally сбрасываем оба флага (переиспользование коннекта).
 *
 * Почему не withBypassRLS напрямую: тот даёт всю платформу; здесь — конкретный
 * регион, и федерационный slug фиксируется в сессии для аудита.
 */
export async function withFederation<T>(
  federationSlug: string,
  fn: (tx: NodePgDatabase<typeof schema>, conn: PoolClient) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query(`SET row_security = on`);
    await conn.query(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await conn.query(`SELECT set_config('app.federation_id', $1, false)`, [federationSlug]);
    const tx = drizzle(conn, { schema });
    return await fn(tx, conn);
  } finally {
    try {
      await conn.query(`SELECT set_config('app.bypass_rls', 'off', false)`);
      await conn.query(`SELECT set_config('app.federation_id', '', false)`);
    } catch { /* ignore */ }
    conn.release();
  }
}
```

**Тест слайса (unit, можно как `.mjs` рядом или vitest, если заведут):** на роли
`rls_app` — два клуба `fedX-*` (member) и `fedY-*` (non-member); прямой SQL c
`FED_MEMBERSHIP_SQL` и параметром `federationSlug` возвращает только member-клуб.
Это «микро-версия» F0-6, привязанная к helper'у.

---

## F0-4. Роль `federation_admin` — JWT, authorize, users-чек

Четыре маленькие правки, **одна миграция**.

**(1) JWT payload — claim `federationId`.** Файл `backend/src/auth/jwt.ts`:

```ts
export interface AccessTokenPayload {
  sub: string;
  tenantId: string | null;
  role: UserRole;
  teamId: string | null;
  playerId: string | null;
  federationId?: string | null;   // NEW: для federation_admin (tenant_id = NULL)
  imp?: string | null;
}
```

В `signAccessToken` он уже пройдёт через spread `...payload`; в
`verifyAccessToken` вернуть его явно: `federationId: body.federationId ?? null`
(как сделано с `imp`).

**(2) `UserRole`.** Файлы `backend/src/db/schema/users.ts` (тип
`UserRole`) и фронт `frontend/src/auth/types.ts` + `frontend/src/contexts/*` —
добавить `'federation_admin'` в объединение.

**(3) `authorize('federation_admin')`** — менять не нужно: `authorize(...roles)`
уже generic (`middleware.ts`). Используем как есть в `federation/routes.ts`.

**(4) users-инвариант + резолвинг scope.** Файл
`backend/drizzle/0013_federation_admin_role.sql` — расширяем CHECK'и `users`:

```sql
-- =============================================================================
-- 0013 federation_admin — region-scoped read-only роль (tenant_id = NULL,
-- привязка к федерации через users.federation_slug). Расширяем role-CHECK и
-- инвариант «нет tenant_id»; добавляем FK на federations.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS federation_slug TEXT
  REFERENCES federations(slug) ON DELETE CASCADE;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_chk;
ALTER TABLE users ADD CONSTRAINT users_role_chk
  CHECK (role IN ('platform_admin','federation_admin','head_coach','team_coach','player'));

-- Инвариант «без тенанта» теперь покрывает обе безтенантные роли.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_admin_no_tenant;
ALTER TABLE users ADD CONSTRAINT users_no_tenant_for_global_roles
  CHECK (
    (role IN ('platform_admin','federation_admin')) = (tenant_id IS NULL)
  );

-- federation_admin обязан иметь federation_slug; остальные — нет.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_federation_scope_chk;
ALTER TABLE users ADD CONSTRAINT users_federation_scope_chk
  CHECK (
    (role = 'federation_admin') = (federation_slug IS NOT NULL)
  );
```

> Зеркало `users.ts` (Drizzle): добавить `federationSlug: text('federation_slug')
> .references(() => federations.slug, { onDelete: 'cascade' })` и переписать два
> `check()` под новые имена/условия, чтобы schema-drift гейт был чист.

**Резолвинг scope (login + /me).** Файл `backend/src/auth/routes.ts`:
- В `POST /login` при `user.role === 'federation_admin'` положить
  `federationId: user.federationSlug` в `signAccessToken` (сейчас там жёстко
  перечислены 4 роли в касте — расширить каст до 5 и пробросить claim). Tenant —
  `null` (инвариант БД это гарантирует).
- В `GET /me` вернуть `federationId` и подгрузить «шапку федерации» (name/region/
  brand) аналогично тому, как сейчас грузится `tenant` для клубных ролей —
  отдельная ветка `if (u.role === 'federation_admin')` с `SELECT ... FROM
  federations WHERE slug = u.federation_slug` (через `withBypassRLS`).
- Login-резолюция тенанта (`tenantSlug`) для федерации не требуется: вход по
  глобально-уникальному email (как `platform_admin`).

**Тест слайса:** seed-федерация (из F0-5) + ручной `federation_admin` →
`POST /login` отдаёт токен с `federationId`, `tenantId=null`; `GET /me` отдаёт
шапку федерации. tsc проходит (claim типизирован).

---

## F0-5. Сид: федерация ffspb + членство существующих клубов

**Файл:** `backend/src/scripts/seedFederation.ts` (стиль `seedAdmin.ts`:
`dotenv/config`, argv, идемпотентность, `pool.end()` в конце). Регистрируем
скрипт в `backend/package.json` → `"seed:federation": "tsx
src/scripts/seedFederation.ts"`.

**Что делает (идемпотентно, через `withBypassRLS`):**
1. `INSERT ... ON CONFLICT (slug) DO UPDATE` федерацию `ffspb` (name «Федерация
   футбола Санкт-Петербурга», region «Санкт-Петербург», parent_body «РФС»).
2. Членство: берёт **все** клубы с `tenants.data_provider = 'ffspb'` (это и есть
   «регион ФФСПб» на платформе) и вставляет в `federation_tenants` c `tier='full'`
   через `ON CONFLICT (federation_slug, tenant_slug) DO NOTHING`.
3. Опционально (флаг `--admin <email> <password>`): создаёт `federation_admin`-
   пользователя (argon2-хеш, `tenant_id=null`, `federation_slug='ffspb'`,
   `id = u-fed-ffspb-{rand}`) — зеркало invite-логики из `admin/routes.ts`, но
   проще: для MVP можно сразу с паролем.

```ts
// эскиз ядра
await withBypassRLS(async (tx) => {
  await tx.insert(federations).values({
    slug: 'ffspb', name: 'Федерация футбола Санкт-Петербурга',
    region: 'Санкт-Петербург', parentBody: 'РФС',
  }).onConflictDoUpdate({ target: federations.slug,
    set: { name: 'Федерация футбола Санкт-Петербурга', region: 'Санкт-Петербург' } });

  const ffspbClubs = await tx.select({ slug: tenants.slug })
    .from(tenants).where(eq(tenants.dataProvider, 'ffspb'));

  for (const c of ffspbClubs) {
    await tx.insert(federationTenants)
      .values({ federationSlug: 'ffspb', tenantSlug: c.slug, tier: 'full' })
      .onConflictDoNothing();
  }
});
```

**Тест слайса:** прогон `npm run seed:federation`, затем повторный прогон —
вторая итерация не плодит дублей (PK-конфликт обработан), число членов = числу
ffspb-клубов. Проверка `SELECT count(*) FROM federation_tenants WHERE
federation_slug='ffspb'`.

---

## F0-6. RLS-тест изоляции: «федерация А не видит клуб региона Б»

**Файл:** `backend/scripts/test-rls-isolation.mjs` (расширяем существующий —
он уже создаёт непривилегированную роль `rls_app`, на которую RLS действует, и
проверяет клубную изоляцию; добавляем федеративный блок тем же стилем).

**Новый кейс (после клубных проверок, до cleanup):**

```js
// ── федерация: членство режет чужой регион ──
// seed: 2 федерации, у каждой свой клуб-член; перекрёстная видимость запрещена.
await admin.query(`DELETE FROM federations WHERE slug IN ('fedx','fedy')`);
await admin.query(`INSERT INTO tenants (slug,name,display_name) VALUES
  ('fedx-club','FX','FX'), ('fedy-club','FY','FY')
  ON CONFLICT (slug) DO NOTHING`);
await admin.query(`INSERT INTO teams (id,tenant_id,name,age_group) VALUES
  ('fedx-t','fedx-club','TX','2012'), ('fedy-t','fedy-club','TY','2012')
  ON CONFLICT (id) DO NOTHING`);
await admin.query(`INSERT INTO federations (slug,name,region) VALUES
  ('fedx','Fed X','Region X'), ('fedy','Fed Y','Region Y')`);
await admin.query(`INSERT INTO federation_tenants (federation_slug,tenant_slug,tier) VALUES
  ('fedx','fedx-club','full'), ('fedy','fedy-club','full')`);

// от имени rls_app под bypass='on' (как withFederation), но с ФИЛЬТРОМ членства:
await c.query(`SELECT set_config('app.bypass_rls','on',false)`);
const fedMembers = async (fed) => (await c.query(
  `SELECT id FROM teams
     WHERE tenant_id IN (SELECT tenant_slug FROM federation_tenants
                          WHERE federation_slug=$1 AND tier='full')
     ORDER BY id`, [fed])).rows.map(r => r.id);

check('федерация X видит только свой клуб', (await fedMembers('fedx')).join() === 'fedx-t');
check('федерация Y не видит клуб региона X',
      !(await fedMembers('fedy')).includes('fedx-t'));

// контроль «забытого фильтра»: без FED_MEMBERSHIP_SQL под bypass виден ЧУЖОЙ клуб →
// доказывает, что именно фильтр (а не RLS) обеспечивает изоляцию федерации.
const leaked = (await c.query(`SELECT id FROM teams WHERE id IN ('fedx-t','fedy-t')`)).rows;
check('без фильтра членства bypass показывает оба (=> фильтр обязателен)', leaked.length === 2);
```

cleanup: `DELETE FROM federations WHERE slug IN ('fedx','fedy')` (каскад снимет
членство; клубы — отдельным `DELETE FROM tenants ...` как в существующем тесте).

**Гейт:** это часть CI rls-теста (`node scripts/test-rls-isolation.mjs` после
`db:migrate`). Падение = регрессия изоляции федерации.

---

## F0-7. Каркас кабинета федерации (FE)

**Файлы:**
`frontend/src/routes/federation/FederationLayout.tsx` (+`.css`),
`frontend/src/routes/federation/Overview.tsx` … `Competitions.tsx` (в F1 —
наполнение; в F0 — заглушки «скоро»),
`frontend/src/routes/federation/SidebarNav.tsx` (8 пунктов ИА из плана, но активны
только 3 первых; остальные — disabled-пункты с подписью «в разработке»),
правки `frontend/src/App.tsx` (новая ветка маршрутов + guard) и
`frontend/src/auth/types.ts`/контекст (роль).

**Маршрутизация** (зеркало admin-ветки в `App.tsx`; guard `FederationAdminOnly`
по образцу `PlatformAdminOnly` — `loading` не редиректит, иначе глубокий линк
роняет на login):

```tsx
<Route path="/federation" element={<FederationAdminOnly><FederationLayout /></FederationAdminOnly>}>
  <Route index element={<Overview />} />            {/* /federation */}
  <Route path="clubs" element={<Clubs />} />
  <Route path="competitions" element={<Competitions />} />
  {/* F2+: talent, development, data-quality, age-effect, benchmark — заглушки */}
</Route>
```

**`RootRoute`** в `App.tsx`: добавить ветку
`if (user.role === 'federation_admin') return <Navigate to="/federation" replace />;`
(рядом с `platform_admin → /admin`).

ИА сайдбара (русский, из плана): Обзор региона · Клубы · Соревнования · Игроки
(талант-пул)* · Развитие* · Целостность данных* · Возрастной эффект* ·
Бенчмаркинг и отчёты*  (* — disabled до F2/F3). Тёмная тема, `tabular-nums`,
бренд федерации через CSS-vars из `/me` (`federation.brand`) тем же
`applyTheme`-механизмом, что и клуб.

**Тест слайса:** `npm run build` (frontend) проходит; вход федерацией приземляет
на `/federation`, виден сайдбар, 3 активных пункта, остальные неактивны. Прямой
переход на `/federation/clubs` не роняет на login (guard учитывает `loading`).

---

# F1 — Обзор + Клубы + Соревнования (MVP)

**Общий модуль:** `backend/src/federation/`:
- `routes.ts` — `GET /api/v1/federation/{overview,clubs,competitions}`; хук
  `authenticate` + `authorize('federation_admin')`; резолвинг `federationId` из
  `req.user`.
- `aggregations.ts` — кросс-клубные SQL (живут отдельно от роутов, как
  `teamStatsAggregate.ts`/`dataQuality.ts`); экспортируют `FED_MEMBERSHIP_SQL`.
- `access.ts` — `federationId(req)` (бросает `UnauthorizedError`, если claim
  пуст), и в будущем тонкая обёртка над `authorize`.

Регистрация в `server.ts`:
`await app.register(federationRoutes, { prefix: '/api/v1/federation' });`

Каркас роутера (зеркало `data/routes.ts`, но через `withFederation`):

```ts
export async function federationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', authorize('federation_admin'));

  function federationId(req: { user?: { federationId?: string | null } }): string {
    const id = req.user?.federationId;
    if (!id) throw new UnauthorizedError('federation context required');
    return id;
  }
  // ... три эндпоинта ниже
}
```

Все три эндпоинта читают через `withFederation(fed, (_tx, conn) => conn.query(...,
[fed, ...]))` и несут `FED_MEMBERSHIP_SQL` (где затрагивают tenant-scoped
таблицы). Для `federations`/`federation_tenants` — обычный SELECT (bypass-флаг
стоит).

## F1-1. `GET /api/v1/federation/overview`

**Назначение (IV-1):** пульс региона одним экраном.

**SQL-агрегаты** (под `withFederation('ffspb')`, `$1='ffspb'`):

- Клубы и охват — из `federation_tenants` ⋈ `tenants`:
  ```sql
  SELECT t.slug, t.display_name AS "displayName", t.brand, t.status, t.plan,
         ft.tier
    FROM federation_tenants ft
    JOIN tenants t ON t.slug = ft.tenant_slug
   WHERE ft.federation_slug = $1
   ORDER BY t.display_name;
  ```
- Счётчики команд/игроков (с долями фото/согласия) — по членам:
  ```sql
  SELECT count(*)::int AS teams FROM teams
   WHERE active = TRUE AND <FED_MEMBERSHIP_SQL>;            -- GROUP BY не нужен (скаляр)
  SELECT count(*)::int                                   AS players,
         count(*) FILTER (WHERE photo_url IS NOT NULL)::int   AS "withPhoto",
         count(*) FILTER (WHERE data_consent)::int            AS "withConsent",
         count(*) FILTER (WHERE birth_date IS NOT NULL)::int  AS "withBirth"
    FROM players WHERE <FED_MEMBERSHIP_SQL>;
  ```
- Матчи за сезон + средний охват данными — `matches`, фильтр по сезону:
  ```sql
  SELECT count(*)::int AS matches,
         round(avg((data_quality->>'score')::numeric), 1) AS "avgQuality"
    FROM matches
   WHERE season = $2 AND <FED_MEMBERSHIP_SQL>;             -- $2 = текущий сезон
  ```
- Активность 7/30 дней (новые игроки/матчи) — `count(*) FILTER (WHERE created_at
  >= now() - interval '7 days')` по `players`/`matches` (у matches —
  `uploaded_at`).
- Разбивка по возрастам — `GROUP BY age_group`:
  ```sql
  SELECT age_group AS "ageGroup", count(*)::int AS teams
    FROM teams WHERE active = TRUE AND <FED_MEMBERSHIP_SQL>
   GROUP BY age_group ORDER BY age_group;
  ```

**Индексы:** членский фильтр бьёт по `tenant_id` — покрыт `teams_tenant_idx`,
`players_tenant_team_idx` (ведущая колонка `tenant_id`), `match_players_tenant_idx`.
Для matches-по-сезону полезен **новый** частичный/композитный
`matches_tenant_season_idx (tenant_id, season)` — добавить в `0011` или
отдельным `0014` (не блокирует F1, но снимает seq-scan на росте). Подзапрос
членства бьёт по `federation_tenants_fed_idx`.

**Форма ответа (JSON):**
```jsonc
{
  "federation": { "slug": "ffspb", "name": "...", "region": "Санкт-Петербург", "brand": {} },
  "coverage": { "clubsTotal": 12, "clubsFull": 5 },
  "kpi": {
    "teams": 48, "players": 720,
    "playersWithPhoto": 640, "playersWithConsent": 511, "playersWithBirth": 700,
    "matchesSeason": 1340, "avgDataQuality": 8.1,
    "newPlayers7d": 12, "newMatches7d": 23, "newPlayers30d": 60, "newMatches30d": 110
  },
  "byAge": [{ "ageGroup": "2012", "teams": 7 }, { "ageGroup": "2013", "teams": 6 }],
  "clubs": [
    { "slug": "...", "displayName": "...", "brand": {}, "status": "active", "plan": "paid", "tier": "full" }
  ]
}
```

**FE (`Overview.tsx`):** TanStack Query ключ `['federation','overview']`,
`queryFn: () => api<OverviewResp>('/federation/overview')`. KPI-плитки
(переиспуем существующие stat-card-паттерны admin/клуба), список клубов с
бренд-логотипами, разбивка по возрастам. Клик по клубу → `/federation/clubs`
(в F1-2 — drill, в F1-1 просто ссылка).

## F1-2. `GET /api/v1/federation/clubs`

**Назначение (IV-2):** реестр + рэнкинг клубов.

**SQL-агрегаты** (в `aggregations.ts`, функция
`clubRegistry(conn, federationSlug)`):

- База реестра — `federation_tenants ⋈ tenants` (как в overview).
- Команд/игроков на клуб — два `GROUP BY tenant_id`:
  ```sql
  SELECT tenant_id AS "slug", count(*)::int AS teams
    FROM teams WHERE active = TRUE AND <FED_MEMBERSHIP_SQL>
   GROUP BY tenant_id;
  SELECT tenant_id AS "slug", count(*)::int AS players
    FROM players WHERE <FED_MEMBERSHIP_SQL> GROUP BY tenant_id;
  ```
- Матчей за сезон + средний рейтинг клуба — из `matches`
  (`team_avg_ratings->>'overall'`), `GROUP BY tenant_id`:
  ```sql
  SELECT tenant_id AS "slug",
         count(*)::int AS "matchesSeason",
         round(avg((team_avg_ratings->>'overall')::numeric), 2) AS "avgRating",
         round(avg((data_quality->>'score')::numeric), 1)       AS "avgQuality"
    FROM matches
   WHERE season = $2 AND <FED_MEMBERSHIP_SQL>
   GROUP BY tenant_id;
  ```
- Полнота паспортизации (доли) — `GROUP BY tenant_id` по `players` с
  `FILTER (WHERE ...)` (фото/согласие/birth/position), как в overview, но не
  агрегатом по всему региону, а по клубу.

Сборка строк реестра — в TS (Map по slug, как `club/summary` в `data/routes.ts`),
чтобы не плодить тяжёлый один-SQL с пятью JOIN+GROUP BY. Это их устоявшийся
паттерн (несколько узких запросов + склейка в коде).

**Индексы:** те же tenant-ведущие; `matches_tenant_season_idx` особенно полезен
здесь (агрегат по сезону на всех клубах).

**Форма ответа:**
```jsonc
{
  "clubs": [
    {
      "slug": "legirus", "displayName": "Легирус", "brand": {}, "status": "active",
      "plan": "paid", "tier": "full",
      "teams": 6, "players": 92, "matchesSeason": 180,
      "avgRating": 6.74, "avgDataQuality": 8.3,
      "passport": { "withPhoto": 0.89, "withConsent": 0.71, "withBirth": 0.97, "withPosition": 0.95 }
    }
  ],
  "season": "2026"
}
```

**FE (`Clubs.tsx`):** ключ `['federation','clubs']`. Таблица-реестр (sticky-
заголовок, `tabular-nums`), колонки из IV-2: Клуб · Команд · Игроков · Охват
данными (заливка по avgDataQuality + число) · Матчей/сезон · Ср. рейтинг · План ·
Статус. Сортировка/фильтр клиентские (`useMemo`, как `AdminTenantsList`). Профиль
клуба (drill) — отдельный экран в F3; в F1 строка ведёт на существующий
`admin/tenants/:slug/enter` (view-as, read-only) только если у федерации есть
право — для MVP кнопку «открыть кабинет» прячем (это F3+).

## F1-3. `GET /api/v1/federation/competitions`

**Назначение (IV-3):** сводный соревновательный контур, «открытый слой».

**Важное упрощение охвата (см. F0-1, риск R2/дедуп):** в F1 «открытый слой»
строим из `standings` клубов-членов (`tier='full'`), а **клубы-нетенанты
показываем как имена внутри `table_data`** (они и так там есть — это весь турнир).
Полноценный «теневой реестр» нетенантов и кросс-клубный дедуп — **F2**.

**SQL-агрегаты:**

- Доступные возрасты у региона:
  ```sql
  SELECT DISTINCT age_group AS "ageGroup" FROM standings
   WHERE <FED_MEMBERSHIP_SQL> ORDER BY age_group;
  ```
- Сводная таблица по выбранному возрасту — последний снимок на клуб-член, как в
  `data/routes.ts /standings`, но по членам, не по одному тенанту:
  ```sql
  SELECT DISTINCT ON (tenant_id) tenant_id AS "slug",
         age_group AS "ageGroup", season, league_name AS "leagueName",
         table_data AS "table", fetched_at AS "lastUpdated"
    FROM standings
   WHERE age_group = $2 AND <FED_MEMBERSHIP_SQL>
   ORDER BY tenant_id, fetched_at DESC;
  ```
  (Несколько клубов-членов одного турнира дадут одинаковую таблицу — на FE
  дедупим по `leagueName`+нормализованному составу; наши клубы подсвечиваем
  брендом через сопоставление имени, как `markOurStandingsRow`.)
- Тур недели / последние результаты — `matches` членов, `ORDER BY match_date
  DESC`, фильтр по сезону; группировка по возрасту на FE.
- Кубки (если есть) — `cup_brackets` по членам, аналогично standings.

**Индексы:** `standings_lookup_idx (tenant_id, age_group, season, fetched_at)` —
уже есть, идеально ложится на `DISTINCT ON (tenant_id) ... ORDER BY ...
fetched_at DESC`. `cup_lookup_idx` — аналогично.

**Форма ответа:**
```jsonc
{
  "ages": ["2012", "2013", "2014"],
  "standings": {
    "2012": {
      "leagueName": "Первенство СПб U12", "season": "2026", "lastUpdated": "…",
      "table": [ { "pos": 1, "team": "…", "pts": 30, "isOur": true } ]
    }
  },
  "recentRound": [
    { "ageGroup": "2012", "home": "…", "away": "…", "scoreHome": 2, "scoreAway": 1, "date": "…", "isOur": true }
  ]
}
```

**FE (`Competitions.tsx`):** ключ `['federation','competitions']` (и/или
`['federation','competitions', ageGroup]` при ленивой подгрузке возраста). Табы по
возрасту, сводная таблица (переиспуем стиль `StandingsModal`/таблиц клуба), наши
клубы подсвечены брендом, «тур недели». Дисциплина/судьи — не в F1 (нет/отложено
по плану).

---

# Риски и как снимаем

| ID | Риск | Снятие |
|----|------|--------|
| **R1** | **Утечка через забытый фильтр** членства (эндпоинт читает tenant-scoped таблицу без `FED_MEMBERSHIP_SQL` → видит чужой регион, т.к. под bypass RLS не режет). | Единый шов `FED_MEMBERSHIP_SQL` (один экспортируемый фрагмент, не копипаста). CI-тест **F0-6** содержит «контроль забытого фильтра»: доказывает, что без фрагмента bypass показывает чужой клуб → значит фрагмент обязателен; ревью-чеклист требует его в каждом tenant-scoped SELECT федерации. Доп. страховка — code-review гейт. |
| **R2** | **Производительность кросс-тенантных агрегатов** (avg рейтинга/охвата по всем клубам региона за сезон — тяжелее клубного). | Сейчас — на лету, с tenant-ведущими индексами (`*_tenant_*` уже есть) + новый `matches_tenant_season_idx`; несколько узких запросов + склейка в TS (паттерн `club/summary`), а не один мега-JOIN. Потом — `federation_snapshots` (ночной пересчёт через `cron/runner.ts`), дашборд читает снимок, кнопка «обновить» (план Ч.III «Производительность», фаза F4). Порог переключения — когда overview/clubs выходит за ~300–500 мс на проде. |
| **R3** | **Дедуп игроков между клубами** (один игрок за 2 клуба по `external_ids` задвоится в талант-пуле и в «переписи»). | **Отложено в F2** — обоснованно: F1 (overview/clubs/competitions) считает клубные агрегаты и «открытый слой», где дедуп игроков не нужен (мы не строим региональный рейтинг игроков до F2). Дедуп — обязателен только для IV-4 талант-пула (F2), где и вводим ключ `ext-{provider}-{nativeId}` как «person id» (он уже формат `players.id`). В F1 счётчик игроков честно считает строки `players` и помечается в UI как «регистраций», не «уникальных людей». |
| **R4** | **Управляемая PG, где FORCE RLS инертен** (роль приложения = owner с bypass → RLS обходится, реальная изоляция только на app-фильтре). | Это уже зафиксированная реальность (`0007`/`0004`): изоляция федерации **проектно** лежит на `FED_MEMBERSHIP_SQL`, RLS — defense-in-depth. Тест F0-6 гоняет проверки на **непривилегированной роли `rls_app`**, где видно оба механизма — ловит регрессию независимо от инертности FORCE на проде. |
| **R5** | **`tier='listed'` без FK-якоря** (клуб-нетенант не имеет строки в `tenants`). | В F0/F1 `federation_tenants` держит только `full`. «Открытый слой» нетенантов F1-3 берёт имена из `standings.table_data` (там весь турнир). Материализация `listed` + теневой реестр — F2 (отдельная таблица `federation_listed_clubs` без FK на tenants, либо nullable-tenant). |
| **R6** | **Рассинхрон schema ↔ БД** (Drizzle-файлы и SQL-миграции разъехались → CI schema-drift падает). | Каждый DB-слайс правит **и** schema-файл, **и** `*.sql`, **и** (где нужно) CHECK-имена в Drizzle. F0-1/F0-4 явно перечисляют обе стороны. Гейт `drizzle-kit` ловит расхождение. |

---

# Definition of Done

## DoD F0 (каркас) — совместимо с CI-гейтом (tsc + build + schema-drift + rls-тест)

- [ ] `0011_federations.sql`, `0012_federation_rls.sql`, `0013_federation_admin_role.sql`
      применяются идемпотентно (повторный `db:migrate` — no-op); таблицы и
      колонка `users.federation_slug` существуют.
- [ ] Schema-файлы `federations.ts`/`federationTenants.ts` + правки `users.ts`,
      `index.ts` синхронны с БД — `drizzle-kit` **не** показывает drift (CI-гейт зелёный).
- [ ] `withFederation()` реализован; экспортирует только read-путь; в `finally`
      сбрасывает `app.bypass_rls` и `app.federation_id`.
- [ ] `federation_admin`: claim `federationId` в `AccessTokenPayload`
      (sign+verify), роль в `UserRole` (BE+FE), CHECK-инварианты users
      обновлены; `POST /login` и `GET /me` отдают federation-контекст; `tsc
      --noEmit` без ошибок, без `any`.
- [ ] `seed:federation` создаёт `ffspb` + членство всех ffspb-клубов (`full`);
      повторный прогон не плодит дублей.
- [ ] `test-rls-isolation.mjs` расширён кейсом «федерация А не видит регион Б» +
      «контроль забытого фильтра»; `node scripts/test-rls-isolation.mjs` зелёный
      на CI-роли.
- [ ] FE: `frontend npm run build` проходит; вход федерацией → `/federation`,
      сайдбар (3 активных пункта), guard не роняет глубокий линк на login.
- [ ] Клубный контур не задет: существующие rls-проверки и клубные роуты
      работают как раньше (никаких правок в `tenant_isolation`/`withTenant`).

## DoD F1 (MVP-эндпоинты)

- [ ] `GET /federation/{overview,clubs,competitions}` зарегистрированы под
      `/api/v1/federation`, защищены `authenticate` + `authorize('federation_admin')`;
      `federationId` резолвится из claim, пустой → 401.
- [ ] Все tenant-scoped SELECT'ы несут `FED_MEMBERSHIP_SQL`; кросс-региональной
      утечки нет (покрыто F0-6 + ручной curl двумя федерациями).
- [ ] `aggregations.ts` отделён от `routes.ts` (стиль `teamStatsAggregate.ts`);
      без `any`; числовые агрегаты округлены (как `round2`/`toFixed` в их коде).
- [ ] Индекс `matches_tenant_season_idx` добавлен (или осознанно отложен с
      замером); существующие `*_tenant_*` и `standings_lookup_idx` используются.
- [ ] Формы ответов соответствуют контракту выше; «охват» честно различает
      `clubsTotal` vs `clubsFull` (не путаем слои, принцип плана).
- [ ] FE: три экрана грузят данные через TanStack Query (ключи
      `['federation','overview'|'clubs'|'competitions']`), переиспуют
      `api/client.ts`; русский UI без англицизмов, тёмная тема, `tabular-nums`,
      бренд федерации через CSS-vars.
- [ ] `frontend npm run build` + `backend tsc` зелёные; schema-drift и rls-тест
      по-прежнему проходят.

---

# Карта затрагиваемых файлов (быстрый индекс)

**Создаём:**
`backend/src/db/schema/federations.ts`, `…/federationTenants.ts`,
`backend/drizzle/0011_federations.sql`, `0012_federation_rls.sql`,
`0013_federation_admin_role.sql` (+ опц. `0014_matches_season_idx.sql`),
`backend/src/federation/routes.ts`, `…/aggregations.ts`, `…/access.ts`,
`backend/src/scripts/seedFederation.ts`,
`frontend/src/routes/federation/FederationLayout.tsx` (+`.css`),
`…/SidebarNav.tsx`, `…/Overview.tsx`, `…/Clubs.tsx`, `…/Competitions.tsx`.

**Правим:**
`backend/src/db/schema/index.ts` (+2 экспорта),
`backend/src/db/schema/users.ts` (колонка + CHECK + `UserRole`),
`backend/src/db/tenantContext.ts` (`withFederation`),
`backend/src/auth/jwt.ts` (claim `federationId`),
`backend/src/auth/routes.ts` (login/me резолвинг scope),
`backend/src/server.ts` (register federationRoutes),
`backend/package.json` (`seed:federation`),
`backend/scripts/test-rls-isolation.mjs` (+федеративный кейс),
`frontend/src/App.tsx` (ветка маршрутов + `RootRoute` + guard),
`frontend/src/auth/types.ts` и legacy `contexts/AuthContext` (роль `federation_admin`).

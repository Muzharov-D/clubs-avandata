# Multi-Tenant Sports Platform — Blueprint

Полная стратегия архитектуры для отдельного нового проекта (рабочее название
далее **«Platform»**, замени на финальное). Легирус остаётся как playground
для R&D-фич, не трогаем.

Документ написан как **карта решений + код-якоря**, по которым LLM-агент в
новом репо сможет восстановить контекст без переоткрытия каждого вопроса.

---

## 0. TL;DR

| Решение | Выбор | Альтернатива (отвергнуто) |
|---|---|---|
| Tenant-модель | **Shared DB + Shared Schema + RLS** | DB-per-tenant (overkill для < 100 клубов) |
| Backend lang | **TypeScript + Node + Fastify** | JS (как в Легирусе) — слабая типизация Legacy |
| ORM | **Drizzle ORM** | Prisma (тяжёлый), raw SQL (как сейчас — много boilerplate) |
| Auth | **JWT (access 15м + refresh 30д), HttpOnly cookie** | Только access как в Легирусе — нет sliding session |
| Frontend | **React + Vite + TanStack Query + TanStack Router** | React Router + ручные fetch (Легирус) |
| Hosting FE | Vercel | Cloudflare Pages |
| Hosting BE | Render / Fly.io | Railway, own VPS |
| DB | Postgres (Neon/Supabase) | Render-PG для dev — ок, для prod — Neon |
| Background | Cron внутри инстанса + BullMQ когда вырастем | Только internal cron (как Легирус) |
| Push | web-push + VAPID (как Легирус) | Firebase (vendor-lock) |
| Email | Resend / Postmark | Mailgun, SES — дороже на старте |

**Roles**: `platform_admin` → `head_coach` → `team_coach` → `player` + `parent` (public).

**Domains**:
- `app.platform.tech` — platform_admin
- `{slug}.platform.tech` — кабинет клуба (coach + player)
- `m.{slug}.platform.tech` — мобилка родителей (опционально per-tenant)

---

## 1. Цели и принципы

1. **Один кодbase — N клубов.** Никаких форков на партнёра.
2. **Изоляция данных на уровне БД** — RLS, а не «положись на ORM».
3. **Provider-абстракция для данных** — FFSPB / ЮФЛ / Manual / новый
   источник = новый класс, реализующий интерфейс. Cron'ы — провайдер-агностики.
4. **Brand-кастомизация без code-changes** — клуб в БД задаёт colors/logo/name,
   фронт читает.
5. **Tenant scoping тотален**: ни одного запроса без `tenantId` в контексте.
   Любой `SELECT` неявно фильтруется по RLS.
6. **Onboarding нового клуба — за час**, не за неделю. Через админ-UI.
7. **Соответствие GDPR/152-ФЗ по умолчанию** — данные игроков (несовершеннолетние!)
   шифруются at-rest, минимизация PII, явное согласие родителей.

---

## 2. Tenant-модель: Shared DB + RLS

### 2.1 Почему именно так

Сравнение вариантов:

| Подход | Изоляция | Cost | Migrations | Backups |
|---|---|---|---|---|
| **DB-per-tenant** | Идеальная | $$$ (N серверов) | N миграций | N бэкапов |
| **Schema-per-tenant** | Хорошая | $ | 1 миграция × N | 1 бэкап |
| **Shared schema + RLS** ✅ | Хорошая | $ | 1 миграция | 1 бэкап |
| Shared schema без RLS | Дырявая | $ | 1 миграция | 1 бэкап |

Для нас (< 100 клубов, средний клуб = 200 игроков, 8 команд) выбор очевиден.

### 2.2 Row-Level Security в Postgres

Каждый запрос к БД выполняется в connection с set-параметром
`app.tenant_id`. Политика RLS на каждой таблице:

```sql
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_tenant_isolation ON teams
  USING (tenant_id = current_setting('app.tenant_id', true)::text);
```

В backend middleware:

```ts
// backend/src/middleware/tenantContext.ts
export async function setTenantContext(client: PoolClient, tenantId: string) {
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
```

**Платформенный admin** обходит RLS через `BYPASSRLS` роль:
```sql
CREATE ROLE platform_admin BYPASSRLS;
GRANT platform_admin TO app_db_user_for_admin_ops;
```

### 2.3 Тенантный slug

`tenants.slug` — короткий человекочитаемый идентификатор (`legirus`, `zenit`,
`spartak-moscow`). Используется в:
- Доменах: `{slug}.platform.tech`
- API: `Host` header → resolveSlug → tenant_id
- Внутренних логах для дебага

Slug **никогда не меняется** после создания (FK refs, кеши, URL).
Display name — отдельно (`tenants.name`).

---

## 3. Роли и доступ

### 3.1 Иерархия

```
platform_admin              ← только в app.platform.tech, видит все клубы
└── head_coach (per-club)   ← видит все команды и игроков клуба, биллинг
    └── team_coach          ← одна команда (+ свои тренировки/созывы)
        └── player          ← только себя + общие командные стат
        
parent (public, no auth)    ← только public-эндпоинты, нет UI ввода
```

### 3.2 Permission matrix

| Действие | platform_admin | head_coach | team_coach | player | parent |
|---|:-:|:-:|:-:|:-:|:-:|
| CRUD клубы | ✅ | — | — | — | — |
| Видеть все клубы | ✅ | — | — | — | — |
| CRUD команды своего клуба | — | ✅ | — | — | — |
| Назначать team_coach | — | ✅ | — | — | — |
| Видеть состав команды клуба | — | ✅ | если своя | если своя | через public |
| Загружать PDF разбор | — | ✅ | ✅ (своя) | — | — |
| Создавать тренировки | — | ✅ | ✅ (своя) | — | — |
| RSVP на тренировку | — | — | — | ✅ (своя) | — |
| Видеть чужую stat | — | ✅ | ✅ (своя) | ❌ строго | командная — да |
| Push subscribe | — | ✅ | ✅ | ✅ | ✅ |
| Биллинг клуба | — | ✅ | — | — | — |

### 3.3 Технически

`users` таблица:
```sql
role TEXT NOT NULL CHECK (role IN
  ('platform_admin','head_coach','team_coach','player'));
```

`parent` — не сущность в `users`. Public-API сам обрабатывает анонимных
посетителей, push-подписки родителей живут в `push_subscriptions` без
`user_id` (или с искусственным `parent-{deviceId}` если нужен дедуп).

### 3.4 Tenant-привязка

```sql
tenant_id TEXT NOT NULL REFERENCES tenants(slug);
team_id   TEXT REFERENCES teams(id);  -- NULL для head_coach (вся клуб)
player_id TEXT REFERENCES players(id); -- только для role='player'
```

**Инварианты** (проверяются триггерами/BEFORE INSERT):
- `role='player'` ⇒ `player_id NOT NULL`
- `role='team_coach'` ⇒ `team_id NOT NULL`
- `role='head_coach'` ⇒ `team_id IS NULL`
- `role='platform_admin'` ⇒ `tenant_id IS NULL` (только этот случай)

---

## 4. Domains & Routing

### 4.1 Domain pattern

```
app.platform.tech            → platform_admin panel
{slug}.platform.tech         → coach + player кабинет клуба
m.{slug}.platform.tech       → public родительский экран этого клуба
{slug}-preview.vercel.app    → preview-деплой для feature-веток
```

Wildcard SSL: `*.platform.tech` + `*.m.platform.tech` (два сертификата) или
один `*.platform.tech` + публичный `parent` под path-ом `m.platform.tech/{slug}`.
Выбор зависит от провайдера DNS. **Рекомендация**: wildcard `*.platform.tech`
+ subdomain `m.` через CNAME отдельно (Vercel умеет).

### 4.2 Host resolution на frontend

```ts
// src/utils/tenant.ts
type TenantContext = {
  slug: string;
  kind: 'admin' | 'club' | 'parent';
};

export function resolveTenantFromHost(host: string): TenantContext {
  const h = host.toLowerCase();
  if (h === 'app.platform.tech') return { slug: '', kind: 'admin' };
  
  const parentMatch = h.match(/^m\.([a-z0-9-]+)\.platform\.tech$/);
  if (parentMatch) return { slug: parentMatch[1], kind: 'parent' };
  
  const clubMatch = h.match(/^([a-z0-9-]+)\.platform\.tech$/);
  if (clubMatch) return { slug: clubMatch[1], kind: 'club' };
  
  // dev / preview fallback
  return { slug: 'demo', kind: 'club' };
}
```

### 4.3 Backend tenant resolution

Middleware на каждый request:

```ts
// backend/src/middleware/resolveTenant.ts
export async function resolveTenant(req, res, next) {
  // Priority: JWT > Host header > X-Tenant header (admin only)
  let tenantSlug = req.user?.tenantId;
  if (!tenantSlug && req.headers.host) {
    const ctx = resolveTenantFromHost(req.headers.host);
    if (ctx.slug) tenantSlug = ctx.slug;
  }
  if (!tenantSlug) return res.status(400).json({ error: 'tenant required' });
  
  const tenant = await db.tenants.findOne({ slug: tenantSlug });
  if (!tenant || tenant.status !== 'active') {
    return res.status(404).json({ error: 'tenant not found or inactive' });
  }
  req.tenant = tenant;
  next();
}
```

### 4.4 Frontend routes

```
{slug}.platform.tech/                   → ClubLanding (выбор роли) или /club если залогинен
{slug}.platform.tech/login              → форма
{slug}.platform.tech/club               → ClubOverview (head_coach view)
{slug}.platform.tech/teams              → список команд клуба
{slug}.platform.tech/teams/:id          → детальная team-страница (team_coach)
{slug}.platform.tech/players/:id        → детальный игрок (свой = player, любой = coach)
{slug}.platform.tech/matches            → матчи (фильтр по команде)
{slug}.platform.tech/match/:id          → детали матча
{slug}.platform.tech/calendar           → расписание + тренировки
{slug}.platform.tech/trainings/:teamId  → CRUD тренировок (team_coach+)

m.{slug}.platform.tech/                 → PublicLanding (выбор команды)
m.{slug}.platform.tech/team/:age        → главная команды для родителя
m.{slug}.platform.tech/team/:age/league → календарь лиги + бомбардиры

app.platform.tech/admin                 → список клубов + Add club
app.platform.tech/admin/clubs/:slug     → детали клуба, биллинг, статус
```

---

## 5. Database Schema (Postgres DDL)

Полная схема в одном файле. Идемпотентно через `IF NOT EXISTS`.

### 5.1 Tenants

```sql
CREATE TABLE tenants (
  slug          TEXT PRIMARY KEY,                    -- 'legirus', 'zenit'
  name          TEXT NOT NULL,                       -- 'ФК Легирус'
  display_name  TEXT NOT NULL,                       -- 'Легирус'
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','archived')),
  brand         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {logo, primary, secondary, accent}
  data_provider TEXT NOT NULL DEFAULT 'manual'       -- 'ffspb' | 'yfl' | 'manual'
    CHECK (data_provider IN ('ffspb','yfl','manual')),
  provider_config JSONB NOT NULL DEFAULT '{}'::jsonb,-- API ключи, tournament_ids, team_ids
  features      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- feature flags: { push: true, ai_summary: false }
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Core entities (с tenant_id + RLS)

```sql
-- Команды
CREATE TABLE teams (
  id            TEXT PRIMARY KEY,                    -- '{tenant}-{age}': 'legirus-2010'
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  name          TEXT NOT NULL,                       -- 'Легирус 2010'
  age_group     TEXT NOT NULL,                       -- '2010'
  age_label     TEXT,                                -- 'U-17'
  year          INT,
  head_coach    TEXT,                                -- ФИО для отображения
  active        BOOLEAN DEFAULT TRUE,
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX teams_tenant ON teams(tenant_id);

-- Игроки
CREATE TABLE players (
  id            TEXT PRIMARY KEY,                    -- 'ext-{provider}-{nativeId}' или 'manual-{uuid}'
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  number        INT,
  position      TEXT,
  birth_date    DATE,
  photo_url     TEXT,
  external_ids  JSONB DEFAULT '{}'::jsonb,           -- { ffspb: 12345, yfl: 67890 }
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX players_tenant_team ON players(tenant_id, team_id);

-- Пользователи
CREATE TABLE users (
  id            TEXT PRIMARY KEY,                    -- uuid
  tenant_id     TEXT REFERENCES tenants(slug) ON DELETE CASCADE,
  email         TEXT,                                -- nullable для импортированных без email
  username      TEXT,                                -- legacy для импортируемых
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL CHECK (role IN
                  ('platform_admin','head_coach','team_coach','player')),
  team_id       TEXT REFERENCES teams(id) ON DELETE SET NULL,
  player_id     TEXT REFERENCES players(id) ON DELETE SET NULL,
  email_verified_at TIMESTAMPTZ,
  invited_by    TEXT REFERENCES users(id),
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, username),
  CHECK ((role = 'platform_admin') = (tenant_id IS NULL))
);
CREATE INDEX users_tenant ON users(tenant_id);

-- Refresh tokens (rotation)
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  user_agent    TEXT,
  ip            INET
);
CREATE INDEX refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
```

### 5.3 Матчи и календарь

```sql
-- SportVisor-разборы (наши)
CREATE TABLE matches (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ext_match_id  TEXT,                                -- из календаря провайдера
  home_team_id  TEXT,
  away_team_id  TEXT,
  home_name     TEXT,
  away_name     TEXT,
  match_date    TIMESTAMPTZ,
  tournament    TEXT DEFAULT 'league',
  score_home    INT,
  score_away    INT,
  pdf_source    TEXT,
  uploaded_by   TEXT REFERENCES users(id),
  team_summary_stats JSONB,
  team_aggregates    JSONB,
  team_avg_ratings   JSONB,
  meta          JSONB DEFAULT '{}'::jsonb,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, ext_match_id)
);

-- Календарь всего турнира (наши + чужие команды нашей подгруппы)
CREATE TABLE calendar (
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  ext_match_id  TEXT NOT NULL,                       -- ID матча в external провайдере
  match_date    TIMESTAMPTZ,
  home_team     TEXT NOT NULL,
  away_team     TEXT NOT NULL,
  home_shield   TEXT,
  away_shield   TEXT,
  ext_home_team_id TEXT,
  ext_away_team_id TEXT,
  venue         TEXT,
  group_name    TEXT,
  round         TEXT,
  tournament    TEXT DEFAULT 'league',
  score_home    INT,
  score_away    INT,
  is_our_match  BOOLEAN DEFAULT FALSE,
  events_data   JSONB,                               -- ход матча (goals/cards/subs)
  events_fetched_at TIMESTAMPTZ,
  lineups_data  JSONB,                               -- составы
  lineups_fetched_at TIMESTAMPTZ,
  coach_comment TEXT,
  PRIMARY KEY (tenant_id, age_group, ext_match_id)
);
CREATE INDEX calendar_tenant_date ON calendar(tenant_id, match_date);

CREATE TABLE calendar_meta (
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT,
  title         TEXT,
  parser_hint   TEXT,
  sources       JSONB DEFAULT '[]'::jsonb,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, age_group)
);
```

### 5.4 Турнирная таблица и кубок

```sql
CREATE TABLE standings (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT,
  league_name   TEXT,
  source_url    TEXT,
  table_data    JSONB NOT NULL,                      -- [{pos, team, played, ..., points}]
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX standings_lookup ON standings(tenant_id, age_group, fetched_at DESC);

CREATE TABLE cup_brackets (
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT,
  cup_name      TEXT,
  source_url    TEXT,
  rounds_data   JSONB NOT NULL,
  parse_hint    TEXT,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, age_group)
);
```

### 5.5 Тренировки и созывы

```sql
CREATE TABLE trainings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  duration_min  INT NOT NULL DEFAULT 90,
  venue_id      TEXT,
  venue_text    TEXT,
  type          TEXT NOT NULL DEFAULT 'training'
    CHECK (type IN ('training','extra','warmup','recovery','meet')),
  notes         TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX trainings_team_date ON trainings(team_id, starts_at);

CREATE TABLE training_attendance (
  training_id   UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- pre-match RSVP игрока
  response_status   TEXT CHECK (response_status IN ('going','not_going')),
  response_note     TEXT,
  response_by       TEXT REFERENCES users(id),
  response_at       TIMESTAMPTZ,
  -- post-match отметка тренера
  presence_status   TEXT CHECK (presence_status IN ('present','late','excused','absent')),
  presence_note     TEXT,
  presence_by       TEXT REFERENCES users(id),
  presence_at       TIMESTAMPTZ,
  PRIMARY KEY (training_id, player_id)
);

CREATE TABLE callups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  match_ext_id  TEXT,                                -- ссылка на calendar.ext_match_id
  opponent      TEXT,
  match_date    TIMESTAMPTZ,
  venue_text    TEXT,
  message       TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE callup_responses (
  callup_id     UUID NOT NULL REFERENCES callups(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT CHECK (status IN ('going','not_going','maybe')),
  note          TEXT,
  responded_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (callup_id, player_id)
);
```

### 5.6 Push notifications

```sql
CREATE TABLE push_subscriptions (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,   -- NULL для родителей
  team_id       TEXT REFERENCES teams(id) ON DELETE CASCADE,
  team_ids      JSONB DEFAULT '[]'::jsonb,                     -- multi-team подписки
  role          TEXT,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  prefs         JSONB DEFAULT '{}'::jsonb,                     -- opt-out: { "events-first": false }
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX push_subs_tenant_team ON push_subscriptions(tenant_id, team_id);

CREATE TABLE notif_log (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  scope         TEXT NOT NULL,                                 -- 'callup-reminder-24h'
  scope_id      TEXT NOT NULL,                                 -- match ext_id
  meta          JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, scope, scope_id)
);

CREATE TABLE notif_recipient_log (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  scope         TEXT NOT NULL,
  scope_id      TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX notif_recipient_lookup
  ON notif_recipient_log(tenant_id, endpoint, sent_at DESC);
```

### 5.7 RLS policies (применить ко всем tenant-scoped таблицам)

```sql
DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'teams','players','users','matches','calendar','calendar_meta',
    'standings','cup_brackets','trainings','callups',
    'push_subscriptions','notif_log','notif_recipient_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true))',
      t, t
    );
  END LOOP;
END $$;

-- training_attendance, callup_responses не имеют tenant_id напрямую — RLS
-- идёт через JOIN к parent-таблице. Альтернатива — денормализовать tenant_id
-- в них тоже (рекомендую, проще для policy).
```

---

## 6. Backend Architecture

### 6.1 Структура

```
backend/
├── src/
│   ├── server.ts                  ← entry, plugin registration
│   ├── env.ts                     ← zod-валидированные ENV
│   ├── db/
│   │   ├── index.ts               ← Drizzle client init
│   │   ├── schema/                ← Drizzle schemas (1 файл на таблицу)
│   │   └── migrations/            ← SQL миграции (drizzle-kit)
│   ├── auth/
│   │   ├── jwt.ts                 ← sign/verify access + refresh
│   │   ├── routes.ts              ← /auth/login /refresh /logout /me
│   │   ├── invitations.ts         ← magic-link приглашения
│   │   └── middleware.ts          ← authenticate, authorize(roles)
│   ├── tenants/
│   │   ├── resolveTenant.ts       ← Host header → tenant
│   │   ├── tenantContext.ts       ← SET app.tenant_id
│   │   └── routes.ts              ← public tenant info
│   ├── providers/                 ← Data providers (см. §8)
│   │   ├── types.ts
│   │   ├── ffspb/
│   │   ├── yfl/
│   │   └── manual/
│   ├── modules/                   ← бизнес-модули
│   │   ├── teams/
│   │   ├── players/
│   │   ├── matches/
│   │   ├── calendar/
│   │   ├── standings/
│   │   ├── trainings/
│   │   ├── callups/
│   │   ├── push/
│   │   └── league-leaders/
│   ├── cron/
│   │   ├── runner.ts              ← регистрация cron jobs
│   │   ├── syncStandings.ts       ← multi-tenant loop
│   │   ├── syncCalendar.ts
│   │   ├── syncMatchEvents.ts
│   │   ├── syncLeagueLeaders.ts
│   │   └── retentionCleanup.ts
│   ├── admin/                     ← platform_admin only
│   │   └── routes.ts
│   └── shared/
│       ├── errors.ts
│       ├── logger.ts              ← pino
│       └── webPush.ts
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

### 6.2 Cron — multi-tenant loop

Анти-паттерн (как в Легирусе): хардкод `'legirus'` в каждом cron'е.

Паттерн (новый):

```ts
// backend/src/cron/syncStandings.ts
import { db } from '../db';
import { getProvider } from '../providers';
import { setTenantContext, withConn } from '../db/tenantContext';

export async function syncStandingsCron() {
  const tenants = await db.tenants.findMany({ status: 'active' });
  for (const t of tenants) {
    if (t.data_provider === 'manual') continue;
    try {
      await withConn(async (conn) => {
        await setTenantContext(conn, t.slug);
        const provider = getProvider(t.data_provider, t.provider_config);
        for (const ageGroup of Object.keys(t.provider_config.tournaments ?? {})) {
          const standings = await provider.fetchStandings(ageGroup);
          await db.standings.insert({ tenantId: t.slug, ageGroup, ...standings });
        }
      });
    } catch (e) {
      log.error({ tenant: t.slug, err: e }, 'sync standings failed');
    }
  }
}
```

Cron schedule (например в `cron/runner.ts`):
```ts
cron.schedule('*/30 * * * *', syncStandingsCron);       // 30 мин
cron.schedule('0 */6 * * *', syncMatchEventsCron);      // 6 час
cron.schedule('0 12 * * *', syncPlayersCron);           // 12 час
cron.schedule('0 3 * * *', retentionCleanupCron);       // ночью
```

### 6.3 API design (REST + Tenant scoping)

Базовый URL: `https://api.platform.tech` (или `https://{slug}.platform.tech/api`).
Все запросы под `/api/v1/`.

```
POST /api/v1/auth/login          { email, password } → { accessToken, refreshToken in cookie }
POST /api/v1/auth/refresh        cookie → new access
POST /api/v1/auth/logout
GET  /api/v1/auth/me             → user + tenant

GET  /api/v1/tenant              public: brand info текущего host
GET  /api/v1/tenant/teams        public: имена возрастных команд (для PublicLanding)

GET  /api/v1/teams               head_coach: все команды клуба
GET  /api/v1/teams/:id           team_coach+ свою, head_coach любую
PATCH /api/v1/teams/:id          head_coach

GET  /api/v1/players?teamId=     coach видит всех, player только себя+командных
GET  /api/v1/players/:id
PATCH /api/v1/players/:id        head_coach

GET  /api/v1/matches?teamId=
GET  /api/v1/matches/:id

POST /api/v1/matches/:id/pdf     загрузка SportVisor

GET  /api/v1/calendar/:age       свои + чужие команды подгруппы
GET  /api/v1/standings/:age
GET  /api/v1/cup/:age
GET  /api/v1/league-leaders/:age?metric=goals

GET  /api/v1/trainings/team/:teamId
POST /api/v1/trainings
PATCH /api/v1/trainings/:id
DELETE /api/v1/trainings/:id
POST /api/v1/trainings/:id/attendance
POST /api/v1/trainings/:id/respond

GET  /api/v1/callups/team/:teamId
POST /api/v1/callups
POST /api/v1/callups/:id/respond

POST /api/v1/push/subscribe
POST /api/v1/push/unsubscribe
PATCH /api/v1/push/preferences

# Public (без auth) — для родительского экрана
GET  /api/v1/public/team/:age/main          сводка для главной родителя
GET  /api/v1/public/team/:age/calendar      календарь
GET  /api/v1/public/team/:age/standings
GET  /api/v1/public/team/:age/league-leaders
POST /api/v1/public/push/subscribe          с anonymous подпиской по team_id

# Platform admin
GET  /api/v1/admin/tenants
POST /api/v1/admin/tenants                  создать клуб
PATCH /api/v1/admin/tenants/:slug
DELETE /api/v1/admin/tenants/:slug          (suspend, не hard-delete)
GET  /api/v1/admin/usage/:slug              метрики использования
```

### 6.4 Tenant scoping — реализация

Все routes регистрируются с цепочкой middleware:
```ts
app.use('/api/v1', resolveTenant);              // public-route → определяем по host
app.use('/api/v1', tenantConnection);           // открываем conn с SET app.tenant_id

// Дальше:
app.post('/api/v1/auth/login', login);          // не требует тенант, login сам выберет

app.use('/api/v1/teams', authenticate, ...);    // требует валидный JWT
```

`tenantConnection` middleware:
```ts
export async function tenantConnection(req, res, next) {
  const conn = await pool.connect();
  await conn.query(`SELECT set_config('app.tenant_id', $1, true)`, [req.tenant.slug]);
  req.dbConn = conn;
  res.on('finish', () => conn.release());
  next();
}
```

В каждом handler'е используем `req.dbConn` вместо общего пула. Drizzle:
```ts
const result = await drizzle(req.dbConn).select().from(teams);
```

---

## 7. Frontend Architecture

### 7.1 Структура

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    ← router setup
│   ├── env.ts                     ← VITE_API_BASE_URL
│   ├── tenant/
│   │   ├── resolveTenant.ts       ← host → tenant context
│   │   ├── TenantProvider.tsx     ← React context, brand, name
│   │   ├── useTenant.ts
│   │   └── applyTheme.ts          ← CSS vars
│   ├── auth/
│   │   ├── AuthProvider.tsx
│   │   ├── useAuth.ts
│   │   ├── ProtectedRoute.tsx
│   │   └── api.ts                 ← login/logout/refresh
│   ├── api/
│   │   ├── client.ts              ← fetch wrapper + refresh interceptor
│   │   └── queries/               ← TanStack Query hooks (1 файл на ресурс)
│   ├── routes/
│   │   ├── club/                  ← coach + player views
│   │   │   ├── ClubOverview.tsx
│   │   │   ├── TeamPage.tsx
│   │   │   ├── PlayerDetail.tsx
│   │   │   ├── MatchDetail.tsx
│   │   │   ├── CalendarPage.tsx
│   │   │   ├── TrainingsPage.tsx
│   │   │   └── ...
│   │   ├── parent/                ← public (m.{slug}.*)
│   │   │   ├── PublicLanding.tsx
│   │   │   ├── PublicTeamSchedule.tsx
│   │   │   └── LeagueFixture.tsx
│   │   ├── admin/                 ← app.platform.tech only
│   │   │   ├── TenantsList.tsx
│   │   │   └── TenantEdit.tsx
│   │   └── auth/
│   │       └── Login.tsx
│   ├── components/                ← переиспользуемые UI (см. чек-лист §13)
│   ├── styles/
│   │   ├── index.css              ← CSS vars (--brand-primary, etc.)
│   │   └── theme.ts               ← TS константы для inline стилей
│   └── utils/
├── public/
│   ├── manifest-template.json     ← подменяется per-tenant runtime
│   └── sw.js
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 7.2 Theming через CSS vars + runtime API

При загрузке frontend дёргает `/api/v1/tenant` (с host header) → получает brand
JSON → применяет vars:

```ts
// src/tenant/applyTheme.ts
export function applyTheme(brand: TenantBrand) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary',       brand.primary       ?? '#dc2626');
  root.style.setProperty('--brand-primary-hover', brand.primaryHover  ?? '#b91c1c');
  root.style.setProperty('--brand-secondary',     brand.secondary     ?? '#991b1b');
  root.style.setProperty('--brand-accent',        brand.accent        ?? '#22c55e');
  root.setAttribute('data-tenant', brand.tenantSlug);

  // Favicon
  if (brand.faviconUrl) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') 
      ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
    link.href = brand.faviconUrl;
  }
  document.title = brand.titleSuffix;
}
```

`TenantProvider`:
```tsx
export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  useEffect(() => {
    fetch('/api/v1/tenant').then(r => r.json()).then(t => {
      setTenant(t);
      applyTheme(t.brand);
    });
  }, []);
  if (!tenant) return <BootSplash />;
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}
```

**Принцип**: НЕТ хардкод-цветов в JSX/CSS компонентов. Всё через `var(--brand-*)`.

### 7.3 Router topology

Используем TanStack Router с file-based routes (или React Router если важна
familiarность). Структура роутов соответствует §4.4.

Авторизация на уровне роута:
```tsx
const protectedRoute = createRoute({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) throw redirect({ to: '/login' });
  },
});
```

### 7.4 Public (parent) bundle

Технически — тот же JS bundle, **другой entry route**. На `m.{slug}.platform.tech`
показывается только `routes/parent/*`. Tenant resolver ставит `kind: 'parent'`,
App.tsx роутит только public-страницы.

Альтернатива: **разделить на 2 SPA** (`app-club` и `app-parent`). Минусы: дубль
компонентов, два билда. Плюсы: меньше JS-бандл родительский. Решение — единый
bundle, code-splitting через `lazy()` для `parent/*` и `club/*` chunks.

---

## 8. Data Providers (плагинная архитектура)

### 8.1 Интерфейс

```ts
// backend/src/providers/types.ts
export interface DataProvider {
  readonly name: 'ffspb' | 'yfl' | 'manual';
  
  fetchStandings(ageGroup: string): Promise<StandingsSnapshot>;
  fetchCalendar(ageGroup: string): Promise<CalendarSnapshot>;
  fetchMatchDetail(extMatchId: string): Promise<MatchDetail | null>;
  fetchTeamPlayers(externalTeamId: string): Promise<Player[]>;
  fetchLeagueLeaders?(ageGroup: string, metric: 'goals'|'assists'): Promise<LeaderRow[]>;
  
  // Опциональные: provider-specific
  fetchCup?(ageGroup: string): Promise<CupBracket>;
}

export type ProviderConfig = {
  apiKey?: string;
  endpoint?: string;
  tournaments: Record<string /*age*/, {
    tournamentId: string;
    teamId?: string;
    [k: string]: any;
  }>;
};

export function getProvider(name: string, config: ProviderConfig): DataProvider {
  switch (name) {
    case 'ffspb': return new FfspbProvider(config);
    case 'yfl':   return new YflProvider(config);
    case 'manual':return new ManualProvider(config);
    default: throw new Error(`Unknown provider: ${name}`);
  }
}
```

### 8.2 FFSPB provider (порт из Легируса)

`stat.ffspb.org` API + HTML-парсинг standings.

- `fetchStandings`: HTML parsing inline-JSON (см. `standingsService.js` Легируса)
- `fetchCalendar`: API `/matches?tournament_id=...`
- `fetchMatchDetail`: API `/matches/{id}` + normalizeEvents
- `fetchTeamPlayers`: API `/players?currentTeam.id=...`
- `fetchLeagueLeaders`: НЕ поддерживается (только assists через `/tournament_top_players?top_by=assists`); агрегация на нашей стороне через `events_data` (см. `leagueLeadersService` в Легирусе — портируется как есть)

Config:
```json
{
  "apiKey": "ffspb-xxx",
  "endpoint": "https://stat.ffspb.org/api",
  "tournaments": {
    "2010": { "tournamentId": "44333", "ourClubMatcher": "Легирус" },
    "2011": { "tournamentId": "44334", "ourClubMatcher": "Легирус" }
  }
}
```

### 8.3 YFL provider (новый, для Зенита и др.)

`yflrussia.ru` (joinsport платформа). HTML-парсинг через cheerio.

URL-паттерны:
- Команда: `/team/{teamId}` — последние матчи, общая стата
- Турнир: `/tournament/{tournamentId}` — таблица + бомбардиры/ассистенты/карточки (33 HTML-таблицы на странице — рассмотрено вживую)
- Матч: `/match/{matchId}` — детали

Config:
```json
{
  "tournaments": {
    "2011": {
      "tournamentId": "1060908",
      "teamId": "1247150",
      "tournamentName": "ЮФЛ U-15"
    }
  }
}
```

Provider:
```ts
class YflProvider implements DataProvider {
  name = 'yfl' as const;
  
  async fetchStandings(age: string) {
    const cfg = this.config.tournaments[age];
    const html = await this.http.get(`/tournament/${cfg.tournamentId}/table`);
    const $ = cheerio.load(html);
    // parsing logic — таблица с pos/team/games/wins/draws/losses/gf/ga/points
    return { tableData: rows, leagueName: cfg.tournamentName, sourceUrl };
  }
  
  async fetchLeagueLeaders(age: string, metric: 'goals' | 'assists') {
    const cfg = this.config.tournaments[age];
    const html = await this.http.get(`/tournament/${cfg.tournamentId}`);
    const $ = cheerio.load(html);
    const tableSelector = metric === 'goals' ? 'TABLE_FOR_SCORERS' : 'TABLE_FOR_ASSISTS';
    return $(tableSelector).find('tr').map(/*...*/).get();
  }
  // ...
}
```

**Преимущество YFL**: уже готовые таблицы бомбардиров на странице — не нужна
агрегация из events.

### 8.4 Manual provider

Для клубов без external источника (молодые любительские клубы).

- `fetchStandings`: пусто, возвращает то что вручную ввёл head_coach через admin UI
- `fetchCalendar`: то же
- `fetchMatchDetail`: то же
- В админке клуба — UI для ввода расписания / результатов / составов

---

## 9. Auth & Security

### 9.1 JWT pattern

**Access token** (15 минут):
```json
{
  "sub": "user-id",
  "tenantId": "zenit",
  "role": "head_coach",
  "teamId": null,
  "playerId": null,
  "iat": ...,
  "exp": ...
}
```

**Refresh token** (30 дней) — opaque random string, хранится в БД с
`token_hash` (sha256). Сохраняется в `HttpOnly; Secure; SameSite=Strict` cookie.

Rotation: каждый `/refresh` выдаёт новый refresh + revokes старый. Reuse-detection:
если приходит уже revoked токен → revoke все refresh tokens этого user_id
(токен украли).

### 9.2 Invitation flow

head_coach создаёт team_coach:
1. POST `/api/v1/teams/:id/coaches/invite { email, fullName }`
2. Backend: вставляет в `users` (password_hash = NULL) + создаёт одноразовый invite token
3. Email с magic-link `https://{slug}.platform.tech/accept-invite?token=...`
4. Coach открывает, видит форму «придумайте пароль» → POST `/api/v1/auth/accept-invite { token, password }`
5. Pwd сохраняется (argon2), email подтверждается, login

### 9.3 Защита от cross-tenant утечки

Защита трёх-уровневая:

1. **Application**: middleware `authorize` проверяет что `req.user.tenantId === req.tenant.slug`.
2. **Database**: RLS блокирует любой SELECT с неправильным `app.tenant_id`.
3. **Audit**: каждый action логируется в `audit_log` с `tenant_id, user_id, action, payload`.

### 9.4 Защита данных несовершеннолетних

- Все `players.birth_date` шифруются (pgcrypto + key в env)
- `players.photo_url` — только URL, фото на S3-совместимом storage с подписанными ссылками (5 мин TTL)
- Public-эндпоинты родителей **никогда не отдают**: email, phone, birth_date, photo full-size
- Согласие родителя на обработку ПД — флажок при первой подписке на push

---

## 10. Public родительский экран

### 10.1 Зачем

Родитель должен:
- Видеть расписание матчей и тренировок ребёнка
- Получать push за 24ч до матча, при публикации состава, после финального свистка
- Видеть таблицу лиги и бомбардиров
- Видеть профиль ребёнка и общую командную статистику

### 10.2 Архитектура

- Hostname: `m.{slug}.platform.tech`
- **БЕЗ auth** — open access по `team_id`
- В URL родитель сам выбирает свою команду (`/team/2010`)
- Push subscriptions сохраняются с anonymous user_id (`parent-{deviceHash}`), привязка к team_id

### 10.3 Опциональный child-binding (Phase 2)

Когда нужен privacy:
1. head_coach генерирует invitation code на конкретного player
2. Родитель открывает `/bind?code=...` на телефоне → код сохраняется в localStorage
3. С этого момента родитель видит конкретного игрока (фото, индивидуальные ratings)
4. Без code — только команда (счёт, бомбардиры, общая позиция)

---

## 11. Onboarding нового клуба

### 11.1 Admin flow

```
platform_admin → app.platform.tech/admin/clubs/new
   ↓
Form:
  - slug:        zenit                           (валидация: lowercase, dash, unique)
  - name:        Зенит
  - displayName: ФК Зенит
  - dataProvider: yfl ▼
  - providerConfig: { tournaments: { ... } }     (JSON редактор + примеры)
  - brand:
      logo URL:      https://...
      primary:       #001489
      secondary:     #00A1E0
      accent:        #FFFFFF
  - plan: free ▼
  - initial head_coach:
      email: coach@zenit.fc
      fullName: Иван Иванов
   ↓
[Создать]
   ↓
Backend:
  1. INSERT INTO tenants (...)
  2. Создаёт subdomain entry (через Vercel API — см. §12.2)
  3. INSERT INTO users (head_coach, password=NULL)
  4. Отправляет invitation email
  5. (если provider != manual) запускает первый sync вне очереди
   ↓
В таблице tenants появилась запись status='active'
Email head_coach: "Платформа готова, перейти по ссылке для установки пароля"
```

### 11.2 Подготовка данных команд клубом

head_coach логинится → /club/teams → "Add team":
- name (например «Зенит U-15»)
- ageGroup ('2011')
- ageLabel ('U-15')

Если data_provider != manual и в `provider_config.tournaments[ageGroup]` указан
`teamId` — backend через провайдер тянет состав → создаёт players автоматически.

### 11.3 Создание team_coach

head_coach → /club/teams/{id}/coaches → invite. Получает email, ставит пароль.

### 11.4 Создание player accounts

Опции:
1. **Bulk import**: CSV (full_name, email, number) → backend создаёт users role=player
   + отправляет invitation emails (или генерирует одноразовые пароли)
2. **Manual**: head_coach создаёт по одному
3. **Auto-link**: для импортированных через FFSPB/YFL players (без email) — поле
   `password_hash` = `NULL`, role = `player`, attach к player_id. Активация:
   head_coach генерирует invite-token, отдаёт игроку устно/в чате

---

## 12. Hosting & DevOps

### 12.1 Stack

| Слой | Сервис |
|---|---|
| Domain | reg.ru / Namecheap |
| DNS | Cloudflare (free) |
| Frontend | Vercel (free → Pro $20/мес для прода) |
| Backend | Render (Web Service, начнём с free → Starter $7) или Fly.io |
| DB | Neon (free 0.5GB → Pro $19) или Supabase free → Pro $25 |
| Object storage (фото игроков) | Cloudflare R2 ($0.015/GB, нет egress) |
| Email | Resend (3k/мес free → Pro $20) |
| Monitoring | Sentry (free 5k events) + Better Stack uptime (free 10 monitors) |
| Logs | Render/Vercel built-in + Logtail для long-term |
| Cron | внутри backend (node-cron), не Render Cron |

### 12.2 Subdomain automation (Vercel API)

При создании tenant backend через Vercel API добавляет domain:
```ts
await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/domains`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  body: JSON.stringify({ name: `${slug}.platform.tech` })
});
```

DNS Cloudflare wildcard `*.platform.tech → CNAME vercel-deploy-url` — оба новых
domain'а резолвятся автоматически, без отдельных DNS записей. Vercel issues SSL
автоматически через Let's Encrypt.

### 12.3 CI/CD

GitHub Actions:
- `main` push → Vercel auto-deploy frontend
- `main` push → Render auto-deploy backend (через webhook)
- PR → Vercel preview + Render preview (Render preview environments)
- Drizzle migrations: `pnpm db:migrate` в Render build step

### 12.4 Environments

| Env | Frontend | Backend | DB |
|---|---|---|---|
| local | `localhost:5173` | `localhost:4000` | Postgres локально или Neon dev branch |
| preview | `pr-XX.preview.platform.tech` | `api-preview.platform.tech` | Neon preview branch (auto via Drizzle preview workflow) |
| prod | `*.platform.tech` | `api.platform.tech` | Neon main branch |

### 12.5 Secrets

| Secret | Где |
|---|---|
| DATABASE_URL | Render env + Vercel env |
| JWT_SECRET | Render env |
| REFRESH_TOKEN_SECRET | Render env |
| VAPID_PUBLIC_KEY / PRIVATE | Render env (public также в Vercel) |
| FFSPB_API_KEY | Render env (platform-level, shared между тенантами) |
| RESEND_API_KEY | Render env |
| VERCEL_TOKEN | Render env (для domain automation) |
| R2_ACCESS_KEY / SECRET | Render env |
| ENCRYPTION_KEY (для birth_date) | Render env |
| SENTRY_DSN | Vercel + Render |

---

## 13. Чек-лист переиспользования из Легируса

Что можно (и нужно) **скопировать как идею** или **порт код 1:1 с правкой
tenant_id**.

### 13.1 Backend сервисы — переносим 1:1 после рефактора

| Файл Легируса | Что взять | Изменения |
|---|---|---|
| `services/standingsService.js` | парсинг inline-JSON FFSPB, retry | tenant_id loop, выделить в FfspbProvider |
| `services/cupService.js` | парсинг bracket | то же |
| `services/calendarService.js` | apiListMatches + HTML fallback | то же |
| `services/playersSyncService.js` | dedup + autoLink логика | то же |
| `services/matchEventsService.js` | normalizeEvents, lineups, sub-checkpoints | то же |
| `services/leagueLeadersService.js` | UNNEST events_data + applyAlias | то же |
| `services/notifCron.js` | windows, push send, dedup, retention | tenant_id loop |
| `services/matchNotifications.js` | quiet hours, payload format | то же |
| `services/pushService.js` | webpush + VAPID | как есть |
| `services/trainingsRepo.js` | RSVP + presence dual | tenant_id |
| `services/callupsRepo.js` | callup CRUD | tenant_id |
| `services/pdfParser.js` | SportVisor PDF → matchData | как есть |
| `services/icsBuilder.js` | match → ICS | как есть |
| `services/weatherService.js` | OpenWeather | как есть |
| `services/standingsHistory.js` | snapshot-diff | tenant_id |

### 13.2 Frontend компоненты — берём почти 1:1

| Компонент | Назначение |
|---|---|
| `MatchDetailSheet` | bottom-sheet деталей матча |
| `MatchStatsBlock` | командная стата home/away |
| `MatchLineupsBlock` | составы |
| `MatchWeather` | погода |
| `LeagueFixture` | календарь лиги + бомбардиры |
| `LeagueMatchPreview` | мини-аналитика обеих команд |
| `OpponentPreview` | для главной родителя |
| `PublicTeamSchedule` | главная родителя |
| `ClubLanding` | выбор роли (3 кнопки) — для parent host |
| `PlayerDetail` | профиль игрока с PizzaChart |
| `FormationField` | формация |
| `Skeleton`, `EmptyState`, `OfflineBanner`, `Toast`, `ErrorBoundary`, `UiIcon` | базовые UI |
| `MatchEventsTimeline` (inline в MatchDetailSheet сейчас) | ход матча |

### 13.3 Утилы

- `utils/legirus.js` → `utils/tenantNorm.ts`: `normalizeTeamName`, `applyAlias`,
  `shieldFor`, `isOurTeam(name, tenant)`
- `utils/players.js`: `shortName`, `shortNameFromPlayer`, `pickBest`
- `utils/dates.js`: `fmtRelative`
- `utils/map.js`: ЯКарты hybrid маршрут

### 13.4 Контракты UX (не трогать!)

Переносим без обсуждения (заработаны кровью в Легирусе):
1. **Имена команд** — мапа алиасов в config, lower + срез юр-префиксов (ФК/ГБУ ДО/...), дефис=пробел. НЕ срезать СШОР/СШ.
2. **Игрок видит только себя** — route guards `CoachOnly` / `OwnPlayerOnly`.
3. **Бейджи «лучший в команде»** — только если реальный top-3.
4. **PizzaChart percentile** — относительно всей команды, не только себя.
5. **Минутный countdown** (не секундный — на мобиле throttle секунд хаотичен).
6. **Browser cache** `private, max-age=30, SWR 120` на `/api/data/*`.
7. **Defer фоновой загрузки** seasonал матчей в MatchDetail (1.5s).
8. **Push квантование** — quiet hours 23:00–08:00, deferred queue.
9. **dedupeOnce** — миграции типа `dedupePlayersOnce`, `autoLinkPlayerUsers`,
   `migratePlayerPhotoUrls` — нужны для миграции старых данных.

### 13.5 БД-таблицы — структура переносится с минимальными изменениями

См. §5 — все основные таблицы соответствуют Легирусовской схеме + `tenant_id`
+ RLS. Миграции 011 (push extensions), 012 (multiteam) — нужны 1:1.

---

## 14. Что НЕ копировать / переделать

### 14.1 Анти-паттерны из Легируса

| Анти-паттерн | Замена |
|---|---|
| Hardcoded `'legirus'` в cron'ах | tenant loop |
| `_config.json` файл для standings | `tenants.provider_config` в БД |
| Path-based hardcoded routing в `isClubHost()` | `resolveTenantFromHost()` с regex |
| Raw SQL queries везде | Drizzle |
| JS (без типов) | TypeScript |
| Ручные fetch + useState + useEffect | TanStack Query (auto refetch, cache, deduping) |
| Хардкод цветов `#dc2626` в CSS | CSS vars |
| `EXPECTED_SW_VERSION` + ручной bump на каждый деплой | Vite PWA plugin с auto versioning |
| Single VAPID для всех (легирус ок) | Per-platform VAPID (всё ещё shared, не per-tenant — vendor-issue) |
| Долгие single-monolith cron'ы в server.ts | Отдельный worker process (Render второй service) |
| Push subscriptions без `tenant_id` (как в начальной схеме Легируса) | сразу с `tenant_id` |
| `matches.team_summary_stats LEFT JOIN на дате` (баг с чужими матчами) | Денормализовать stats в `calendar.our_stats` или отдельный JOIN с `is_our_match = TRUE` |

### 14.2 Технические долги Легируса, которые мы НЕ хотим в Platform

- Дубли legacy + ffspb player ids (миграция dedupePlayersOnce). В новом репо:
  с самого начала единый ID-формат `ext-{provider}-{nativeId}` или `manual-{uuid}`,
  никаких legacy `p\d+-name`.
- File-based JSON fallback в `dataRepo.js` (когда PG нет). В Platform — PG
  обязателен, никаких fallback'ов.
- `players-leaders` в Легирусе агрегирует events_data SQL'ем + JS-фильтр
  подгруппы. В Platform — материализованный view + refresh-cron.
- Поля `coach_comment` прямо в `calendar` (один на матч). В Platform —
  отдельная `match_comments` с историей + author.

---

## 15. Roadmap (фазы)

Каждая фаза — отдельный PR-set, шипить можно независимо. Цель — рабочая
платформа с одним демо-клубом к концу Фазы 5.

### Фаза 0 — Foundation (1 неделя)

- Repo init (TS + Fastify + Drizzle + Vite + React)
- CI/CD (GitHub Actions → Vercel + Render)
- Neon DB + drizzle-kit
- Sentry + pino logging
- DNS Cloudflare + Vercel domain hookup
- `tenants` schema + RLS infra
- `app.platform.tech/admin` skeleton + auth

### Фаза 1 — Auth & Tenant onboarding (1 неделя)

- JWT + refresh rotation
- POST `/admin/tenants` создание клуба
- Invitation flow (head_coach)
- Magic-link email через Resend
- Frontend: tenant resolver + theming

### Фаза 2 — Teams & Players (1 неделя)

- `teams`, `players`, `users` tables
- head_coach CRUD teams
- team_coach invitations
- Player invitations (bulk CSV)
- Frontend: ClubOverview, TeamPage, PlayerDetail (без расширенной stat)

### Фаза 3 — Data providers (2 недели)

- Provider interface
- FfspbProvider (порт Легируса)
- YflProvider (новый, для Зенита)
- ManualProvider (CRUD через admin UI клуба)
- Cron infrastructure (multi-tenant loop)
- Tenant config UI в head_coach view

### Фаза 4 — Matches, Calendar, Standings (1.5 недели)

- `matches`, `calendar`, `standings`, `cup_brackets`
- Sync cron'ы для всех 3 провайдеров
- API endpoints + frontend MatchDetail + Calendar + Standings
- SportVisor PDF upload

### Фаза 5 — Public родительский экран (1 неделя)

- `m.{slug}.*` host routing
- PublicLanding + PublicTeamSchedule + LeagueFixture + LeagueMatchPreview
- Anonymous push subscriptions

### Фаза 6 — Push & Notifications (1 неделя)

- VAPID + webpush
- notif_log dedup
- 24h reminders + lineup-published + events-first
- Preferences UI + quiet hours

### Фаза 7 — Trainings & Callups (0.5 недели)

- `trainings`, `training_attendance`, `callups`, `callup_responses`
- CRUD UI для team_coach
- RSVP UI для player

### Фаза 8 — Match Events & League Leaders (1 неделя)

- Sync events для всех past-матчей подгруппы
- Бомбардиры / ассистенты / карточки (для YFL — готовые таблицы, для FFSPB — агрегация)
- Frontend вкладка «Бомбардиры»

### Фаза 9 — Platform Admin UI (0.5 недели)

- `app.platform.tech/admin` — список tenants, метрики, suspend
- Usage dashboard (active users, matches synced, push sent)

### Фаза 10 — Production rollout (1 неделя)

- Импорт Зенита (первый прод-клиент)
- Импорт Легируса (миграция данных, опционально — можно оставить старый)
- UAT + bug bash
- Public launch

### Фаза 11 — Billing (опционально, потом)

- Stripe integration
- Plans: free (1 команда), starter ($X/мес, до 5 команд), pro
- Платёжный экран в head_coach

### Фаза 12 — AI features (опционально, потом)

- Match summary через Claude API
- Player development progression (рекомендации тренеру)
- Auto-generated team intro tweets

**Итого до прод**: ~10-12 недель одним разработчиком full-time. С агентом —
быстрее на этапах 0/1/3/4 (где много шаблонного кода).

---

## 16. Open questions (для решения перед стартом)

1. **Название платформы**: `youthsports.tech`, `clubdata.app`, `teamview.io`? Влияет на домен.
2. **Юрлицо**: ИП/ООО для биллинга? GDPR-compliance уровень?
3. **Один Vercel project + multiple domains** или **Vercel team + project per environment**? Зависит от tariffication.
4. **Email**: Resend (быстро) или своя SMTP infra?
5. **PG**: Neon (best DX, branching) или Supabase (auth builtin — мы не используем) или Render-managed?
6. **TanStack Router** vs **React Router v7**: v7 теперь имеет file-based routes тоже. Минус Router v7 — менее зрелый, плюс — меньше lock-in.
7. **Form library**: TanStack Form или React Hook Form?
8. **i18n с самого начала** (даже если ru only)? `react-intl` или `next-intl`?
9. **Биллинг**: с самого начала (Stripe) или через 6 месяцев?
10. **Платить за фичи** (push, advanced stats, AI) или **за seats** (per coach)?
11. **Data retention**: сколько хранить старые матчи / тренировки? Сезон → архив → удаление через N лет?
12. **Privacy of player photos**: явное согласие родителей через checkbox при первой подписке, или соглашение в onboarding клуба?

---

## 17. Стартовая команда LLM-агента в новом репо

Скопируй в новый проект как `CLAUDE.md` (читается агентом автоматически):

```markdown
# Platform — Multi-tenant sports backoffice

См. полный blueprint в MULTI_TENANT_BLUEPRINT.md (скопировать из репо Легируса).

## Текущий стек

- Backend: TS + Fastify + Drizzle + Postgres
- Frontend: TS + React + Vite + TanStack Query + TanStack Router
- Auth: JWT (access 15m) + refresh (30d, HttpOnly cookie, rotation)
- Tenant: shared DB + RLS, host-based slug resolution
- Providers: FFSPB, YFL, Manual (pluggable interface)
- Hosting: Vercel (FE) + Render (BE) + Neon (DB) + Cloudflare R2 (фото) + Resend (email)

## Domain pattern

- app.platform.tech            → platform_admin
- {slug}.platform.tech         → coach + player кабинет клуба
- m.{slug}.platform.tech       → public родительский экран

## Roles

platform_admin → head_coach → team_coach → player + parent (anonymous public)

## Стиль работы

- Прямой push в main допустим для мелких фиксов; больших — feature-branch + PR.
- Каждая фича — отдельный модуль `backend/src/modules/<name>` + `frontend/src/routes/<name>` + Drizzle schema файл.
- НИКОГДА не делай query без tenant scoping — RLS защитит, но всё равно явно подставляй tenant_id в WHERE для performance.
- Цвета — ТОЛЬКО через CSS vars `var(--brand-primary)` и т.д. Хардкод hex запрещён в компонентах.
- Тестируй на двух демо-клубах с разными провайдерами параллельно (FFSPB-демо + YFL-демо).

## Что портировать из Легируса

См. MULTI_TENANT_BLUEPRINT.md §13 — детальный чек-лист.

## Чего избегать

См. MULTI_TENANT_BLUEPRINT.md §14.
```

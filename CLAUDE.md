# Clubs · Avandata — Multi-Tenant Sports Platform

SaaS-платформа для футбольных клубов на `clubs.avandata.ru`. Полная стратегия
в `docs/MULTI_TENANT_BLUEPRINT.md` — там карта решений + код-якоря.

## Стек

- **Backend**: TypeScript + Fastify 5 + Drizzle ORM + Postgres
- **Frontend**: TypeScript + React 19 + Vite + TanStack Query + React Router 7
- **Auth**: JWT (access 15m) + refresh (30d, HttpOnly cookie, rotation)
- **Tenant**: shared DB + RLS, `tenantId` из JWT после login
- **Hosting**: Render (BE + PG) + Vercel (FE) + Cloudflare DNS

## Domain / tenancy

Единый домен `clubs.avandata.ru`. Tenant'ы НЕ через subdomain — резолвятся
после login из JWT-claim `tenantId`. Public-родительский экран будет
path-based: `/m/{slug}/...` (без auth, Фаза 5).

## Roles

```
platform_admin → head_coach → team_coach → player
                                       parent (anonymous public, без записи в users)
```

`platform_admin` — единственная role с `tenant_id = NULL`. Все остальные
обязательно scoped в свой клуб.

## Структура

```
backend/
├── src/
│   ├── server.ts             — Fastify entry
│   ├── env.ts                — zod-валидированные ENV
│   ├── db/
│   │   ├── client.ts         — Pool + Drizzle
│   │   ├── tenantContext.ts  — withTenant / withBypassRLS
│   │   ├── schema/           — Drizzle schemas (1 файл на таблицу)
│   │   └── migrate.ts        — runner для drizzle/*.sql
│   ├── auth/                 — jwt + middleware + routes
│   ├── tenants/              — public tenant info routes
│   ├── admin/                — platform_admin routes (BYPASSRLS)
│   ├── modules/              — бизнес-модули (Фаза 2+)
│   ├── cron/                 — multi-tenant loops (Фаза 3+)
│   └── shared/               — errors, logger
└── drizzle/                  — *.sql миграции (idempotent с CREATE IF NOT EXISTS)

frontend/
└── src/
    ├── main.tsx + App.tsx    — entry + router
    ├── api/client.ts         — fetch wrapper с refresh-interceptor
    ├── auth/                 — AuthProvider, useAuth, ProtectedRoute
    ├── tenant/               — TenantProvider, applyTheme (CSS vars)
    ├── routes/               — Login, Home, admin/*
    └── styles/index.css      — CSS vars (--brand-primary и т.д.)
```

## Critical contracts

### Язык интерфейса — русский, без англицизмов (СТРОГО)

Весь текст, который видит пользователь (тренер/игрок/родитель), — на русском.
Латиница и англицизмы в UI **запрещены**. Переводим даже привычные кальки:

- `Performance Index` → **«индекс эффективности»** (или «рейтинг» для overall);
- `Фитнес` → **«Физика»**; `vs` → **«—»**; и т.п.

**Исключение — только общепринятые обозначения** аналитики, у которых нет
русского эквивалента и которые узнаваемы профессионалами: `xG`, `xPTS`, `PPDA`,
`xT`. Их можно оставлять, но в **глубоких** разделах (детальная аналитика), а не
в сводках/блоках для тренера — там даём человеческие формулировки.

Имена брендов/продуктов (`SportVisor`, `Наградион`) — не переводим.

Жаргонные метрики (PPDA, «% длинных») нельзя выносить в обзорные блоки —
тренеру нужен словесный вывод («высокий прессинг», «играем вертикально»), а не
сырое число.

### Цвета — ТОЛЬКО через CSS vars

В компонентах хардкод `#dc2626` запрещён. Все brand-зависимые цвета через
`var(--brand-primary)` / `var(--brand-accent)` и т.д. — клуб задаёт бренд
в `tenants.brand` JSONB, `applyTheme()` записывает в CSS vars при login.

### Tenant scoping тотален

Любой `SELECT` на tenant-scoped таблицу проходит через `withTenant(slug, ...)`
который ставит `app.tenant_id`. RLS-политики страхуют от cross-tenant утечки.

Admin-операции (создать клуб, suspend и т.д.) идут через `withBypassRLS(...)`
— это только в `src/admin/routes.ts` с обязательной `authorize('platform_admin')`.

### ID format

- `players.id` = `ext-{provider}-{nativeId}` (например `ext-ffspb-12345`) или
  `manual-{uuid}` для ручных. Никаких legacy `p\d+-name` как в Легирусе.
- `teams.id` = `{tenant_slug}-{age_group}` (например `legirus-2010`).
- `users.id` = `u-{tenant_slug}-{role-code}-{rand}` (например `u-legirus-hc-a3f9`).

### Auth

- Access token — JWT HS256, 15 мин, payload включает `tenantId, role, teamId, playerId`.
- Refresh — opaque random 48 байт, хранится sha256 в `refresh_tokens`, HttpOnly
  cookie path=`/api/v1/auth`. Каждый `/refresh` ротейтит токен (выдаёт новый,
  revoke старый). Re-use старого → revoke все refresh user'а (украли).

## Стиль работы

- **Прямой push в main** допустим для мелких фиксов; большие фичи —
  feature-branch + PR.
- **НЕ использовать `git add -A`** — добавлять файлы поимённо.
- Каждая фича — отдельный модуль `backend/src/modules/<name>` +
  `frontend/src/routes/<name>` + Drizzle schema файл.
- TypeScript strict mode везде. `any` запрещён без `// eslint-disable` и
  обоснования.

## Что портировать из Легируса (репо `github.com/Muzharov-D/legirus-screen`)

См. `docs/MULTI_TENANT_BLUEPRINT.md` §13 — детальный чек-лист.

## Чего избегать

См. `docs/MULTI_TENANT_BLUEPRINT.md` §14 — анти-паттерны Легируса.

## Local development

```bash
# Backend
cd backend
cp .env.example .env       # заполнить DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET
npm install
npm run db:migrate         # применить drizzle/*.sql
npm run dev                # http://localhost:4000

# Frontend (в другом терминале)
cd frontend
npm install
npm run dev                # http://localhost:5173, proxies /api → :4000
```

Минимум для запуска (`.env`):
- `DATABASE_URL=postgresql://...` — Render-PG external URL
- `JWT_SECRET` и `REFRESH_TOKEN_SECRET` — `openssl rand -base64 32`

## Phase 0 status (на 2026-05-27)

Сделано:
- Repo init + git
- Backend skeleton: Fastify, Drizzle, tenants + users + refresh_tokens schema, RLS
- Auth: login/refresh/logout/me с argon2 + JWT + rotation
- Admin routes: `/admin/tenants` (list, create, patch)
- Frontend: Vite + React 19 + TanStack Query + React Router 7
- Login page + Home + admin layout + create-tenant form

Дальше — Фаза 1: настроить Render PG + Vercel + Cloudflare DNS, выдать
первому platform_admin доступ, через UI создать первый клуб (тест-Легирус).

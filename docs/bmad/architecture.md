---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-06-15'
project_name: 'Дашборд федерации региона (Clubs · Avandata)'
user_name: 'Дмитрий'
date: '2026-06-15'
inputDocuments:
  - docs/bmad/PRD.md
  - docs/bmad/ux-design-specification.md
  - docs/FEDERATION_DASHBOARD_TECH.md
  - CLAUDE.md
  - docs/MULTI_TENANT_BLUEPRINT.md
  - backend/src/db/schema
---

# Architecture Decision Document — Дашборд федерации региона (Clubs · Avandata)

**Author:** Дмитрий · **Date:** 2026-06-15

> Brownfield: документ оформляет и углубляет уже принятые решения (стек унаследован из проекта, версии не переоткрываются). Единый источник истины для реализации каркаса федерации.

---

## Анализ контекста проекта

### Обзор требований

**Функциональные (из PRD, 27 FR):** доступ и контекст федерации (FR1–3), обзор региона (FR4–6), реестр и профиль клубов (FR7–10), соревнования (FR11–13), целостность данных и согласия (FR14–17), талант-пул и нормировка (FR18–20, Фаза 2), возрастной эффект/развитие (FR21–22), экспорт/бенчмаркинг (FR23–24), администрирование федерации (FR25–27).

**Нефункциональные:** кросс-тенантная изоляция (гейт релиза), гейт согласия детей (152-ФЗ), p95 агрегатов < 1.5 с, WCAG AA, read-only, аудит.

**Масштаб и сложность:** ВЫСОКАЯ. Драйверы: мульти-тенантная кросс-агрегация, персональные данные несовершеннолетних, ответственность за корректность решений регулятора, потенциальная мульти-федерация. Домен: full-stack web (SaaS B2B). Оценочно компонентов: ~6 backend (schema×2, access, aggregations, routes, seed) + ~8 frontend-маршрутов + 5 новых UI-компонентов.

### Технические ограничения и зависимости

- **Managed Postgres (Render): роль приложения = owner → обходит RLS.** Следствие: изоляция держится на app-фильтре, RLS — defense-in-depth (это уже модель проекта, `0007_force_rls_isolation.sql`).
- Brownfield: расширяем существующий монорепо без слома клубного контура.
- Интерфейс на русском без англицизмов; цвета только через CSS-токены (контракт).
- Источники: ffspb (открытый слой) уже подключён; SportVisor (глубокий слой) уже в конвейере.

### Сквозные концерны

Изоляция членства · гейт согласия (один шов) · честный охват (раздельные счётчики слоёв) · аудит действий федерации · деградация блоков без данных.

## Базис (стартер)

Нового стартера нет — **расширяем существующий репозиторий**. Backend: `backend/src` (Fastify entry `server.ts`, Drizzle, `db/tenantContext.ts` с `withTenant`/`withBypassRLS`). Frontend: `frontend/src` (Vite, React Router 7, TanStack Query, `api/client.ts`, `auth/AuthProvider`, `tenant/TenantProvider`). Федерация — новый модуль по конвенции «фича = модуль».

## Ключевые архитектурные решения

### Приоритеты

- **Критические (блокируют реализацию):** схема `federations`/`federation_tenants`; `withFederation()`; роль `federation_admin`; единый шов фильтра членства `FED_MEMBERSHIP_SQL`; тест изоляции.
- **Важные:** форма API с раздельными счётчиками слоёв; гейт согласия в `aggregations`; индексы под кросс-тенантные агрегаты.
- **Отложенные:** дедуп игроков (Фаза 2); снапшоты агрегатов (Фаза 4); шов под действия федерации (Vision).

### Данные

- Новые таблицы: `federations` (slug PK, name, region, parent_body, settings JSONB, brand JSONB), `federation_tenants` (federation_slug FK, tenant_slug FK, tier `full`|`listed`, joined_at; PK составной).
- **Слои данных = существующее `tenants.plan`** (`free` финансирует федерация / `paid` клуб). Никакого нового механизма.
- Валидация ввода — Zod (как в проекте). Миграции — idempotent SQL (`CREATE TABLE IF NOT EXISTS`), стиль `drizzle/*.sql`.
- **Индексы:** `federation_tenants (federation_slug, tier)` для подзапроса членства; переиспользуем `match_players_tenant_idx`, `players_tenant_team_idx`; добавляем `matches_tenant_season_idx` под обзорные агрегаты.

### Аутентификация и безопасность

- **Роль `federation_admin`** (`tenant_id = NULL`, claim `federationId` в JWT) — зеркало того, как `platform_admin` живёт без тенанта. JWT HS256 15 мин + refresh-ротация (как в проекте).
- **`withFederation(federationSlug, fn)`** в `tenantContext.ts` — брат `withBypassRLS`: ставит `app.bypass_rls='on'` (федерация видит много клубов, один `app.tenant_id` не подходит), а реальная изоляция — **на уровне запроса** единым фрагментом:
  ```sql
  FED_MEMBERSHIP_SQL = tenant_id IN (
    SELECT tenant_slug FROM federation_tenants
    WHERE federation_slug = $1 AND tier = 'full'
  )
  ```
  встраивается в КАЖДЫЙ tenant-scoped SELECT федерации. RLS — defense-in-depth.
- **Read-only — соглашением:** helper экспонирует только read-путь; у роли нет write-эндпоинтов.
- **Гейт согласия** централизован в `aggregations.ts`: обезличенные агрегаты всегда; именные данные ребёнка — только при `players.data_consent = true`. Проверка в одном шве, не в каждом экране.
- **Аудит:** действия федерации логируются (claim `imp`/контекст, как в admin view-as).

### API и коммуникация

- REST под `/api/v1/federation/*` (Fastify, `addHook authenticate + authorize('federation_admin')`).
- MVP-эндпоинты: `GET /federation/overview`, `GET /federation/clubs`, `GET /federation/competitions`.
- **Форма ответа честного охвата:** раздельные счётчики (`{ total, onPlatform, listed }`), НЕ смешанный агрегат — иначе UI-контракт `CoverageStat` ломается.
- Ошибки — формат проекта (`{message, code}` через `shared/errors`).

### Frontend

- `frontend/src/routes/federation/*` (Overview, Clubs, Competitions в MVP; остальные — заглушки «Скоро»).
- TanStack Query: ключи `['federation', slug, resource, params]`; переиспользуем `api/client.ts` с refresh-интерсептором.
- Бренд федерации через `applyTheme()` (CSS-vars из `federations.brand`).

### Инфраструктура и развёртывание

- Render (BE+PG) + Vercel (FE) — без изменений. Миграции в build step.
- **CI-гейт** проекта (`tsc` + build + schema-drift + RLS-тест) расширяется кейсом «федерация А не видит регион Б».
- Снапшоты агрегатов — через `cron/runner.ts` (Фаза 4), не в MVP.

### Влияние решений (последовательность)

F0-1 схема → F0-2 RLS новых таблиц → F0-3 `withFederation` → F0-4 роль `federation_admin` → F0-5 сид ФФСПб → F0-6 тест изоляции → F0-7 каркас FE → F1-1/2/3 эндпоинты+экраны. Каждый слайс = отдельный PR + тест.

## Паттерны реализации и правила консистентности

### Именование
- **БД:** snake_case (таблицы/колонки), как в проекте; FK `*_slug`/`*_id`; индексы `*_idx`.
- **TS/JSON:** camelCase; даты — ISO-строки.
- **Эндпоинты:** `/api/v1/federation/<resource>` (множественное для коллекций).
- **ID:** `federations.slug` (`ffspb`); пользователь федерации `u-fed-{slug}-{rand}` (по аналогии с `u-{tenant}-hc-{rand}`).

### Структура
Фича = модуль: `backend/src/federation/` (+ schema-файлы) + `frontend/src/routes/federation/`. Тесты — рядом/в `scripts/` как в проекте (`test-rls-isolation.mjs`).

### Формат
Ответы — прямые объекты (как `data/routes.ts`), без обёртки; счётчики слоёв раздельно. `null` для отсутствующих метрик listed-клубов (UI рендерит «—»).

### Коммуникация
Только чтение от федерации; состояние клиента — TanStack Query (кэш+рефетч), без глобального стора.

### Процесс
- **Единый шов фильтра членства** — `FED_MEMBERSHIP_SQL` импортируется, не дублируется.
- **Единый шов согласия** — централизован в `aggregations`.
- **Деградация** — блок не рендерим без данных.

### Enforcement
**Все агенты ОБЯЗАНЫ:** проходить тест изоляции (CI); использовать `FED_MEMBERSHIP_SQL` в каждом федеративном SELECT; не вводить write-путь для федерации; TS strict без `any`; цвета через токены; именованный `git add` (не `-A`).

## Структура проекта и границы

### Дерево (новое)
```
backend/src/
├── federation/
│   ├── routes.ts          — GET /federation/{overview,clubs,competitions} (read-only)
│   ├── aggregations.ts    — кросс-клубные запросы + FED_MEMBERSHIP_SQL + гейт согласия
│   └── access.ts          — authorize('federation_admin') + резолвинг scope
├── db/schema/
│   ├── federations.ts
│   └── federationTenants.ts
└── scripts/seedFederation.ts
backend/drizzle/
├── 00XX_federations.sql            — таблицы (idempotent)
└── 00XX_federation_rls.sql         — RLS новых таблиц (fail-closed, bypass-only)
frontend/src/routes/federation/
├── Overview.tsx · Clubs.tsx · Competitions.tsx   — MVP
└── Talent.tsx · Development.tsx · AgeEffect.tsx · DataQuality.tsx · Benchmark.tsx — заглушки «Скоро»
frontend/src/components/
└── CoverageStat (проп у StatTile) · RegionActivityFeed · ClubRegistryTable/Row · PassportCompletenessBars
```

### Границы
- **API:** `/federation/*` — единственная внешняя поверхность федерации; read-only.
- **Данные:** доступ только через `withFederation` + `FED_MEMBERSHIP_SQL`; клуб вне региона недостижим.
- **Auth:** `federation_admin` не пересекается с tenant-ролями; `platform_admin` управляет членством.

### Маппинг требований → структура
- FR1–6 (доступ, обзор) → `access.ts` + `routes.ts:overview` + `Overview.tsx`.
- FR7–10 (клубы) → `aggregations.ts:clubs` + `Clubs.tsx` + `ClubRegistryTable`.
- FR11–13 (соревнования) → `routes.ts:competitions` (из `standings`/`calendar`) + `Competitions.tsx`.
- FR14–17 (целостность/согласия) → `aggregations.ts` (гейт согласия) + профиль клуба.
- FR25–27 (админ федерации) → `admin/routes.ts` (расширение) + `seedFederation.ts`.

### Точки интеграции
- **ffspb** → открытый слой (`standings`, `calendar`, `matches.*TeamName`) — все клубы турнира.
- **SportVisor** → глубокий слой (`match_players`) — `paid`-клубы + согласие.
- **Существующая платформа** → `tenants.plan`, `players.data_consent`, `withBypassRLS`/`withTenant`.

## Результаты валидации архитектуры

### Когерентность ✅
Решения совместимы: стек унаследован и проверен в проде; `withFederation` повторяет проверенный паттерн `withBypassRLS`; слои на `tenants.plan` не вводят нового механизма; паттерны (snake_case БД / camelCase TS, модуль-фича) — те же, что в проекте.

### Покрытие требований ✅
27 FR имеют архитектурную опору (маппинг выше); NFR покрыты: изоляция (шов+тест), согласие (шов), p95 (индексы→снапшоты), WCAG AA (наследуется из дизайн-системы), аудит, read-only.

### Готовность к реализации ✅
Решения задокументированы с конкретными файлами/сигнатурами; паттерны и шов фильтра однозначны; структура полная.

### Анализ пробелов
- **Критических нет.**
- **Важные (отложены сознательно):** дедуп игрока между клубами (`externalIds`) — предпосылка талант-пула, Фаза 2; счётчик «игроки» в MVP = записи реестра.
- **Nice-to-have:** снапшоты агрегатов (Фаза 4); теневой реестр `listed`-клубов-нетенантов (имена берём из `standings.table_data`, Фаза 2); шов под действия федерации (Vision).

### Чек-лист
- [x] Контекст проанализирован, сложность оценена
- [x] Критические решения задокументированы (стек унаследован)
- [x] Паттерны именования/структуры/формата определены
- [x] Полная структура каталогов и границы
- [x] FR→структура маппинг
- [x] Гейты безопасности (изоляция, согласие) специфицированы

### Оценка готовности
**Статус:** ГОТОВО К РЕАЛИЗАЦИИ. **Уверенность:** высокая (brownfield, проверенные паттерны). **Сильные стороны:** переиспользование зрелой платформы; изоляция единым швом + CI-тест; слои на существующем поле. **На будущее:** снапшоты, дедуп, мульти-федерация-иерархия.

### Передача в реализацию
**Гайд для агентов:** следовать решениям точно; использовать `FED_MEMBERSHIP_SQL` в каждом федеративном SELECT; не вводить write-путь федерации; проходить тест изоляции до мержа.
**Первый слайс:** F0-1 — schema `federations.ts`/`federationTenants.ts` + idempotent миграция.

---

*Архитектура собрана по методологии BMAD (Winston). Звено 3 цепочки PM → UX → Архитектор. Единый источник истины; детальные слайсы — `docs/FEDERATION_DASHBOARD_TECH.md`.*

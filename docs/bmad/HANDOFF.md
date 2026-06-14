# Дашборд федерации — отчёт за ночь (для утренней проверки)

**Дата:** 2026-06-15 · автономный заход. Всё на `main`, каждый слайс через build-гейт.

## TL;DR

Реализован и запушен **F0 (каркас доступа) + F1 (MVP, 4 экрана)** дашборда федерации
региона. Региональный регулятор (`federation_admin`) логинится, видит ТОЛЬКО клубы
своего региона (изоляция доказана CI-тестом), read-only. Четыре рабочих экрана:
Обзор · Клубы · Соревнования · Целостность данных. F2/F3 (талант-пул, возрастной
эффект и т.д.) — навигационные заглушки «Скоро» (нужны данные/дедуп, см. ниже).

## Как проверить локально (5 минут)

```bash
# backend/.env: DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET
cd backend
npm install
npm run db:migrate                 # применит 0011 (федерации), 0012 (роль)
npm run seed:federation            # федерация ffspb + членство всех ffspb-клубов
npm run seed:federation-admin -- fed@ffspb.ru "ФФСПб" secret123 ffspb
npm run dev                        # http://localhost:4000

# в другом терминале
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Войти на `/login` → `fed@ffspb.ru` / `secret123` → попадаете в `/federation`.

> Если в БД нет клубов с `dataProvider='ffspb'` — членство будет пустым (Обзор
> покажет 0 клубов). Тогда добавьте членов через admin-API
> (`POST /api/v1/admin/federations/ffspb/members` с `{tenantSlug}`) или поправьте
> провайдер у клубов.

## Что сделано (коммиты на `main`)

**Эпик 0 — каркас доступа (F0):**
- `4c4efe1` — схема `federations` + `federation_tenants` + RLS fail-closed (0.1–0.2)
- `9449c57` — `withFederation()` + `FED_MEMBERSHIP_SQL` — шов изоляции (0.3)
- `085916d` — роль `federation_admin` + `users.federation_slug` + claim в JWT + контекст в `/me` (0.4)
- `fa6df9a` — admin-роуты: создать федерацию + членство (0.5)
- `8b1c15b` — сид ФФСПб (0.6)
- `59136bf` — тест изоляции региона + контроль «забытого фильтра» — гейт релиза (0.7)
- `0507341` — кабинет федерации FE: layout, guard, навигация (0.8)

**F1 — MVP, 4 экрана:**
- `9895849` — Эпик 1 Обзор региона (KPI + честный охват `free`/`paid`)
- `5c0e03a` — Эпик 2 Клубы (реестр: команды/игроки/охват/тариф-слой)
- `0f71727` — Эпик 3 Соревнования (сводные таблицы по возрастам, открытый слой)
- `7e94ede` — Эпик 4 Целостность данных (полнота паспортизации + согласия, обезличенно)

Эндпоинты (все read-only, через `withFederation`): `GET /api/v1/federation/{overview,clubs,competitions,data-quality}`.

## Безопасность и приватность (ключевое)

- **Изоляция региона** — на app-фильтре членства (`FED_MEMBERSHIP_SQL`), т.к. на
  managed-PG owner-роль обходит RLS. RLS новых таблиц — defense-in-depth.
  Доказано CI-тестом (`test-rls-isolation.mjs`): федерация А не видит регион Б +
  контроль, что без фрагмента запрос течёт.
- **Гейт согласия (FR17)** в F1 соблюдён **by design**: нет ни одного эндпоинта,
  отдающего именные/детальные данные ребёнка. Только обезличенные агрегаты и %.
- **Read-only** — у роли федерации нет write-путей; `withFederation` отдаёт только
  read-путь.

## CI

Каждый пуш → `.github/workflows/ci.yml`: backend build → migrate → schema-drift →
**rls-isolation (вкл. федеративный кейс)** → frontend build. Локально все сборки
зелёные; миграции идемпотентны, на чистой CI-БД проходят.

## Что отложено (F2/F3) и почему

| Модуль | Фаза | Причина |
|---|---|---|
| Талант-пул региона (рейтинг игроков, нормировка) | F2 | Нужен дедуп игрока между клубами (`externalIds`) — иначе пул завышен дублями; и нормировка против регионального пула |
| Профиль игрока (с согласием) | F2 | Per-player PII — требует реализации гейта согласия на уровне выдачи имён |
| Возрастной эффект (RAE) | F2 | Данные (`birthDate`) есть, но это козырь F2 по плану; экран строится на дедупленном пуле |
| Продуктивность клубов, бенчмаркинг, экспорт | F3 | Нужна история сезонов / дополнительная агрегация |

Все они видны в навигации как «Скоро» (F2/F3) — честная дорожная карта, не тупик.

## Известные ограничения / TODO

- **Счётчик «игроков»** = строки реестра (без кросс-клубного дедупа) — предпосылка F2.
- **Охват данными** клуба считается как средний `matches.data_quality->>'score'`
  (защитно: если поля нет — `—`). Уточнить формулу при желании.
- Федеративные экраны используют **инлайн-стили на токенах** (быстрый каркас), а
  не общие компоненты `StatTile`/`RatingBeeswarm` из дизайн-системы — можно
  отрефакторить на них (UX-спека предлагала `CoverageStat` как проп `StatTile`).
- **Мульти-федерация** — модель готова (шов), иерархия РФС→МРО→регион не строится.
- `tier='listed'` (клубы не на платформе) в F1 не материализуется — их имена идут
  из `standings.table_data` (открытый слой Соревнований).

## Где что лежит

```
backend/src/federation/        — routes.ts (эндпоинты), aggregations.ts (запросы), membership.ts (FED_MEMBERSHIP_SQL)
backend/src/db/schema/         — federations.ts, federationTenants.ts; users.ts (роль+federation_slug)
backend/src/db/tenantContext.ts — withFederation()
backend/drizzle/               — 0011_federations.sql, 0012_federation_admin_role.sql
backend/scripts/test-rls-isolation.mjs — гейт изоляции (расширен)
backend/src/scripts/           — seedFederation.ts, seedFederationAdmin.ts
frontend/src/routes/federation/ — FederationLayout + Overview/Clubs/Competitions/DataQuality
```

Планы (источник истины): `docs/bmad/{PRD,ux-design-specification,architecture,epics}.md`.

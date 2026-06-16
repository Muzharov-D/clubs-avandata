# Кабинет федерации — снимок состояния (handoff)

Дата: 2026-06-16 · Репо: `github.com/Muzharov-D/clubs-avandata` (ветка `main`, последний коммит `edde750`)
Деплой: Render `clubs-avandata-api` (backend) + Vercel `clubs-avandata.vercel.app` (frontend)
Проверка: вход `fed@ffspb.ru` / `secret123` (роль `federation_admin`). После деплоя — **Ctrl+Shift+R**.

## Что это
Кабинет **региональной федерации** (роль `federation_admin`, read-only) поверх клубов-тенантов.
Федерация = ФФСПб; член сейчас **один клуб — `legirus`** (17 игроков, 5 матчей).
Изоляция региона — **app-фильтр членства** `FED_MEMBERSHIP_SQL` + `withFederation()` (НЕ RLS: на managed-PG owner обходит RLS).

## ПРАВИЛО ДОСТУПА (ключевое, решение владельца «2»)
Федерация видит:
- **37 базовых метрик матчей** (`FREE_AGG_FIELDS` в `frontend/src/components/analytics/TeamAggregatesGrid.tsx`): удары/в створ/голы, дриблинг, отборы/перехваты/прессинг/контрпрессинг/выносы/блоки, фолы/карточки/угловые/офсайды, прогрессивные пасы;
- **весь рейтинговый слой** — индексы 0–10 (overall/attack/defence/passing/fitness/creativity), Сборная региона, перцентили, радары;
- **полный открытый FFSPB** — таблицы, календарь, бомбардиры/ассистенты.
НЕ видит платные stats (ассисты, ключевые/точные пасы, кроссы, касания в штрафной, подборы, владение, физика/дистанция) — **вырезаны СЕРВЕРНО** в `backend/src/federation/aggregations.ts` (не только скрыты в UI).

## Экраны — `frontend/src/routes/federation/`
- **Открытия региона** (index, `Discoveries.tsx`) — 4 находки-вердикта: ⏳ возрастная утечка (RAE), ⚖️ победа≠развитие, 🔦 невидимая середина, 🧬 ДНК региона.
- **Сводка** (`Overview.tsx`, `/summary`) — KPI + профиль качества (радар) + целостность данных + мини-реестр клубов.
- **Клубы**, **Соревнования**, **Бомбардиры** (`Scorers.tsx`, открытый FFSPB), **Целостность данных**, **Бенчмаркинг**, **Игроки** (`Talent.tsx`), **Лидерборды** (`Leaderboards.tsx`), **Сборная региона** (`BestXI.tsx`, поле 1-4-3-3), **Профиль игрока** (`PlayerProfile.tsx`, дриллдаун), **Развитие** (`Development.tsx` + матрица «победа×развитие» `FedScatter`), **Возрастной эффект** (`AgeEffect.tsx`).
- Дизайн-система: `federation.css` (только токены `styles/index.css`), компоненты `FedRadar.tsx`, `FedScatter.tsx`, общий `components/StatTile.tsx`, цвета `fedColors.ts`.

## Backend — `backend/src/federation/`
- `aggregations.ts` — все агрегаты (Overview, RegionProfile, Clubs, Competitions, DataQuality, AgeEffect, TalentPool, PlayerProfile, BestXI, WinDevelop, Scorers, Productivity, Benchmark). Гейт «37 базовых + рейтинг» применён.
- `routes.ts` — `GET /api/v1/federation/{overview, region-profile, clubs, competitions, data-quality, age-effect, talent, players/:id, best-xi, win-develop, scorers, development, benchmark}`.

## Данные на проде (проверено через API)
- `legirus`: рейтинги реальны (overall/attack/defence/fitness; **passing/creativity пусты** в данных). Сборная XI наполнена (НАП Дютиль 8.42, ЗАЩ Закусилов 7.86 …). `data_consent=true` → имена видны.
- `standings` синканы (есть «Вторая лига»). **`events_data` пуст → бомбардиры пока 0** (наполнится events-кроном).
- На 1 клубе все «региональные» сравнения тонкие — каркас рассчитан на рост числа клубов.

## Интеграции внешних API
- **FFSPB** (`services/ffspbApi.ts`) — ЧТЕНИЕ открытых данных, **работает** (`X-AUTH-TOKEN` = `FFSPB_API_KEY`, endpoint `stat.ffspb.org/api`). Кроны: `standings`+`calendar` (30 мин) и **НОВОЕ `events`** (`services/matchEventsService.ts`, 6 ч — наполнит бомбардиров). Включается `START_CRONS=true` + `FFSPB_API_KEY`. Форма события: `eventType`-int → нормализуется в массив `{kind,team:'host'|'guest',playerName,assistName,minute}`; голы = `kind∈(goal,penalty)`, own_goal не в актив.
- **bigbro.ai** (`services/bigbroApi.ts` + `modules/video/routes.ts`) — заказ обработки видео матчей. **СПИТ в дальнем бэклоге.** Включается `BIGBRO_USERNAME`/`BIGBRO_PASSWORD` в env Render; фронт не сделан; createOrder — только по явной кнопке (исходящее действие). Источник API-доки: `legirus-screen` не содержит — дал владелец.
- Референс портирования: публичный репо `github.com/Muzharov-D/legirus-screen` (`docs/FFSPB_API_GUIDE.md`, `backend/services/*`), частично вендорен в `docs/legirus-reference/`.

## Открытые пункты / следующее
1. **Бомбардиры**: ждут events-крон (или разовый синк — прод-запись + вызовы FFSPB, только по ОК владельца).
2. **Больше клубов в регион** — главный множитель телескопа. Масс-залив автоблокирован; нужен идемпотентный сид клубов с `dataProvider='ffspb'` + ОК владельца.
3. Бэклог «монополии данных»: рейтинг с поправкой на соперника (ELO по графу матчей), карта переходов + индекс производства академий (нужен дедуп игроков `externalIds`), воронка удержания по когортам + кривые развития (нужны сезоны/история), «талант под угрозой», паспорт таланта региона.
4. bigbro фронт (камеры → заказ → iframe) — когда вернёмся из бэклога.

## Команды
- Типы/сборка: `npm --prefix backend run typecheck`; `npm --prefix frontend run build`. (Билд бэка `tsconfig.build.json` исключает скрипты с предсуществующими ошибками — это не наши.)
- Деплой: push в `main` → Render+Vercel авто. Проверка прод-API — login + `GET /api/v1/federation/*` с Bearer.
- **Граница:** auto-классификатор жёстко блокирует прямые прод-БД операции и само-изменение прав доступа. Прод-записи (consent/сиды/разовый синк) выполняет **владелец** командой; я их не обхожу.

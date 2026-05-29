# HANDOFF → Opus 4.8

Дата сборки: 2026-05-29. HEAD: `be58a9f` (batch 49). Branch: `main`. Запущен demo-readiness sprint, юзер уехал на показ через несколько часов.

---

## 1. TL;DR — где мы сейчас

**Стек запущен и работает:**
- Frontend: https://clubs-avandata.vercel.app (auto-deploy с main)
- Backend: https://clubs-avandata-api.onrender.com (Docker, Node 22 + Python для парсеров)
- DB: Render Postgres `clubs-avandata-db` (Frankfurt, Free)
- 2 тенанта: `zenit-fk` (ФК Зенит, navy `#001489`) и `zenit-sshor` (СШОР Зенит, sky `#87CEEB`), оба U-15 (born 2011)
- 1 разобранный матч на zenit-fk загружен через PDF (СШОР Зенит 0:4 Зенит, тур 10, дата 2026-05-16)
- Реальная YFL таблица 16 команд из https://yflrussia.ru/tournament/1060908

**Демо-флоу для тренера:**
1. https://clubs-avandata.vercel.app/login
2. `zenit-fk@avandata.ru / demo123456` → `/club` (или `zenit-sshor@avandata.ru / demo123456`)
3. Кликнуть в матч → `/matches/<id>` — посмотреть детали, формацию, тепловые карты
4. Игрок → `/players/<id>` — pizza chart профиля
5. Platform admin: `Muzharov26@gmail.com / testtest` → `/admin`

**Последний push** включает фиксы расстановки в формации (раньше все 11 в кучу) + фильтр пустых тепловых карт (legacy crops <20KB не лифтятся). Жди Vercel ~2 мин + Render ~5 мин для эффекта.

---

## 2. Что было сделано за overnight sprint (batches 24-49)

Юзер ушёл спать в `83cd3d7` сказав "Я нашёл примерно 200 косяков, пока не исправишь — не сдам". Сделано 25 коммитов:

### Critical bugs
- **batch 38** — `isOurClub()` tenant-aware вместо `isLegirus()`. Раньше для Зенита в 7+ компонентах опонент считался "своей командой" (HeroNextMatch / OpponentPreview / MyCallups / MatchDetailSheet / StandingsModal / streak / Calendar month-view). Фикс: `setClubHints([tenant.displayName, tenant.name])` из AuthContext + новый `isOurClub(name)` с edge-case СШОР vs ФК.
- **batch 46** — `MatchesDashboard.goalsFor/Against/cleanSheets` всегда возвращали 0, потому что использовали несуществующее `m.homeTeamId`. API отдаёт `m.home/m.away/scoreHome/scoreAway`. Фикс — сравнение по имени.
- **batch 47** — `MatchList` показывал «Команда vs Соперник» для всех матчей по той же причине.
- **batch 45** — `/analytics` средний рейтинг команды показывал 750 вместо 7.5 (был `*100` вместо `.toFixed(1)`).
- **batch 36** — `applyTheme` наконец-то вызывается на смену тенанта. До этого CSS-переменные `--brand-primary` и favicon не применялись.
- **batch 48** — Formation: все 11 игроков сваливались в линию полузащиты если PDF parser не вернул `positionSlot`. Новый `lineFor()` пробует positionSlot → position (GK/CB/CDM) → positionFull → regex → fallback на схему 1-4-3-3.
- **batch 48** — Crop: `_team_bbox` возвращает `None` если на странице нет image >= 180×120. Раньше fallback'ил на захардкоженный bbox → пустые карточки с осями.
- **batch 49** — Server-side фильтр legacy крошек: dataUrl < 20KB не лифтятся в `teamAggregates[slug].mapImage`. Чинит существующие матчи без переuploads.

### Polish (нули → «—», тримы U-15, дедупы)
- **batch 37** — Дедуп по русскому лейблу в AggregateCard (больше нет двух «Перехваты»). `total: 'Передачи'` → `total: 'Всего'`.
- **batch 39** — `match.awayTeam.name` тоже trim от U-15/2011, использует `shieldFor` (с tenant logo если задан).
- **batch 40** — `shieldFor()` больше не подставляет чужой Легирус-лого в карточку Зенита если `tenant.brand.logoUrl` не задан.
- **batch 41** — `PlayersLeaders.overall` (топ игрок) только из играшних с rating>0. `maxBy()` возвращает null если max=0.
- **batch 42** — `RatingPill` / `RatingCard` для value≤0 рендерят «—» вместо «0.0».
- **batch 43** — `MatchesDashboard.topRated` фильтрует 0-рейтинги; hero выводит имя tenant команды; «Игроков на поле: 11» убрали (константа).
- **batch 44** — `FormationField` рейтинг 0 → «—»; `ratingColor(0)` → серый (#888) вместо красного.
- **batch 45** — `bestPlayer/topN/leadersByLine` фильтр overall > 0; в `/analytics` лого инициал берётся из home team name, не «З» хардкод.

Подробный список всех 25 коммитов: `git -C "C:\Users\dmuzharov\Documents\Claude\Projects\Clubs Avandata" log --oneline 83cd3d7..HEAD`.

---

## 3. Что НЕ дотянул / известные косяки

### Косметика, не блокирующее
- **Лого Зенитов** — только цвета в seed, нет `brand.logoUrl` → в шилдах инициалы «З» / «С». Можно загрузить PNG-лого и через admin PATCH `/api/v1/admin/tenants/zenit-fk` обновить brand.
- **Legacy public routes** `LeagueFixture` / `PublicTeamSchedule` / `ClubLanding` / `PublicLanding` ещё на `isLegirus(...)` напрямую. Не в demo flow для Зенита, но обновить надо при подключении публичного экрана для нового тенанта.
- **Hero «32+ игроков, 22+ матча»** на `AvandataLanding` — захардкожено. Когда тенантов больше — пересчитать.
- **AvandataLanding "Сейчас в продакшене"** — захардкоженные 2 бейджа ФК Зенит / СШОР Зенит.

### Архитектурное
- **CORS хардкод в коде** (`backend/src/server.ts`) — production origins список зашит в код вместо ENV. Сделано потому что юзер не хотел лезть в Render dashboard. Когда добавится новый клуб — добавить хост в `PROD_ORIGINS` или вернуть `CORS_ORIGIN` через ENV.
- **Vercel proxy 30s timeout** — PDF upload идёт напрямую на Render через `VITE_API_DIRECT_URL=https://clubs-avandata-api.onrender.com`. Если этот URL изменится — обновить в `frontend/src/services/api.js` (DIRECT_API_BASE fallback).
- **Render Free** — backend засыпает после 15 мин неактивности. Первый запрос холодный (~30 сек). Для demo разбудить за 5 минут до показа: `curl https://clubs-avandata-api.onrender.com/health`.

### Безопасность (КРИТИЧНО)
- **Production secrets leaked в чате** ранее: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`. После demo обязательно ротировать через Render dashboard. Это в TODO юзера, мной не сделано.

### Возможные косяки PDF parser, не проверены
- "Технический брак 73" — выглядит подозрительно высоко. Это `sumScalar('technicalMistake', 'attack')` — сумма "технических ошибок" всех игроков. Может быть валидно.
- xG / xA для U-15 → 0 во всех матчах (SportVisor U-15 не считает). Pizza chart фильтрует такие метрики.

---

## 4. Infrastructure

| Что | Где |
|---|---|
| Repo | https://github.com/Muzharov-D/clubs-avandata (приватный) |
| Local | `C:\Users\dmuzharov\Documents\Claude\Projects\Clubs Avandata` |
| Frontend deploy | Vercel project `clubs-avandata`, root `frontend/`, auto-deploy from main |
| Backend deploy | Render service `clubs-avandata-api`, Docker, `backend/Dockerfile` (Node 22 + Python 3.11 + pdfplumber/openpyxl) |
| Backend ENV vars | `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, опц. `START_CRONS`, `FFSPB_API_KEY` |
| Frontend ENV vars | `VITE_API_DIRECT_URL=https://clubs-avandata-api.onrender.com` (для direct upload, в `frontend/.env.production` или Vercel dashboard) |
| DB | Render Postgres `clubs-avandata-db`, Frankfurt, Free tier |
| Vercel rewrite | `frontend/vercel.json`: `/api/* → onrender.com/api/*` (для legacy paths, новые v1 идут через rewrite или direct) |

### Локальный запуск

```bash
# Backend
cd backend
cp .env.example .env       # DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET
npm install
npm run db:migrate         # применить drizzle/*.sql
npm run dev                # :4000

# Frontend
cd frontend
npm install
npm run dev                # :5173, proxy /api → :4000
```

JWT/REFRESH secrets — `openssl rand -base64 32`.

### Полезные команды

```bash
# Build verification
cd frontend && npx tsc --noEmit && npx vite build  # должно проходить чисто

# Seed Zenit tenants (idempotent)
cd backend && npx tsx src/scripts/seedZenit.ts

# Seed real YFL standings 11 туров
cd backend && npx tsx src/scripts/seedRealYflTable.ts

# Post-upload enrichment (photos by Cyrillic surname + 4 real goals)
cd backend && npx tsx src/scripts/applyPhotosAndEnrich.ts

# Wake Render
curl https://clubs-avandata-api.onrender.com/health
```

---

## 5. Workflow rules (НЕ нарушать)

1. **Push в `main` напрямую разрешён** — юзер сказал явно. Без PR. См. `~/.claude/projects/.../memory/workflow_push_to_main.md`.
2. **НЕ использовать `git add -A` / `git add .`** — добавлять файлы поимённо, чтобы случайно не закоммитить `.env` или scratch.
3. **Не пропускать hooks** (`--no-verify`, `--no-gpg-sign`) без явного запроса юзера.
4. **TypeScript strict** — `any` запрещён без `// eslint-disable` и обоснования.
5. **Цвета — только через CSS vars** (`var(--brand-primary)` и т.д.), хардкод hex в компонентах запрещён.
6. **Caches: НЕ дёргать prod БД через MCP без явного разрешения** — `mcp__supabase` блокируется auto-classifier на raw read-only probes; для production reads нужен explicit user approval naming the prod target.
7. **Production DB writes через `npx tsx scripts/...`** — это разрешено, скрипты идемпотентны (UPSERT/ON CONFLICT).
8. **Co-Authored-By** в каждом коммите: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (или 4.8 после переезда).

---

## 6. Где смотреть в первую очередь

### Архитектура и контракты
- `CLAUDE.md` — entry для агента, краткий стек/правила
- `docs/MULTI_TENANT_BLUEPRINT.md` — полная стратегия (~1500 строк)
- `~/.claude/projects/C--Users-dmuzharov.../memory/project_clubs_avandata_state.md` — состояние проекта (memory)

### Файлы которые меняли последний sprint
- `frontend/src/contexts/AuthContext.jsx` — applyTheme + setClubHints + setOurLogo
- `frontend/src/utils/legirus.js` — isLegirus / isOurClub / setClubHints / setOurLogo / shieldFor / normalizeTeamName (центральный source of truth)
- `frontend/src/pages/ClubDashboard.tsx` — главный экран /club, multi-tenant aware, normalizeTeamName + isOurName + AggregateCard с дедупом
- `frontend/src/pages/MatchDetail.jsx` — /matches/:id, FormationField + MatchTimeline + DonutComparisonCard + maps секция
- `frontend/src/pages/MatchesDashboard.jsx` — /matches, hero + season stats + topRated карусель
- `frontend/src/components/FormationField.jsx` — расстановка 11 игроков на поле (последний фикс batch 48)
- `frontend/src/components/PlayerPhoto.jsx` — placeholder-ID skip + initials fallback
- `frontend/src/components/MatchTimeline.jsx` + .css — хроника матча (созданы batch 23)
- `frontend/src/components/PdfUploadDialog.jsx` — drag&drop + a11y модал
- `backend/src/upload/routes.ts` — главный pipeline (~700 строк): parse_zenit_full → build_match → crop_all_b64 → parse_events → derivedAggregates → teamAvgRatings → match_players insert
- `backend/parsers/crop_all_b64.py` — извлечение всех heatmaps в base64 (последний фикс batch 48)
- `backend/parsers/parse_events.py` — chronicle parser (события матча)
- `backend/parsers/parse_zenit_full.py` — основной rich PDF parser
- `backend/parsers/build_match.py` — page 1 (общее) + splits парсер
- `backend/src/data/legirusAdapter.ts` — конверсия rich PDF stats → Legirus-shape (attack1/2/3/4/5, defence1/2/3, fitness)
- `backend/src/data/routes.ts` — /api/v1/data/* endpoints + лифт meta.teamMaps в teamAggregates (последний фикс batch 49)
- `backend/src/scripts/seedZenit.ts` — seed двух tenant'ов + 16 игроков + календарь
- `backend/src/scripts/seedRealYflTable.ts` — реальная таблица YFL
- `backend/src/scripts/applyPhotosAndEnrich.ts` — post-upload enrichment

### Backend схема (Drizzle)
- `backend/src/db/schema/` — 16 таблиц, все с `tenant_id` + RLS
- `backend/drizzle/0002_legirus_schema.sql` — консолидированная миграция

---

## 7. Gotchas / ловушки

1. **`tenant.brand.logoUrl` для Zenit'ов НЕ задан** — `shieldFor()` возвращает empty → инициалы. Если задаёшь, делай UPDATE через `npx tsx` скрипт.
2. **`ext_match_id` префикс `sv-`** — `parse_zenit_full.py` уже добавляет `sv-`, в `routes.ts` НЕ добавлять второй раз. Фикс был в batch 35.
3. **CORS для нового домена** — добавить в `backend/src/server.ts` PROD_ORIGINS массив (хардкод!).
4. **PDF upload идёт МИМО Vercel** — `DIRECT_API_BASE = 'https://clubs-avandata-api.onrender.com'` в `services/api.js`. Vercel rewrite убил бы upload >30 сек.
5. **isLegirus vs isOurClub** — `isLegirus('Легирус')` остался как backward-compat для legacy кода и для tenant=legirus. Новый код использует `isOurClub()`.
6. **`isOurClub` edge case** — СШОР Зенит vs ФК Зенит: подсказка с «сшор» не матчит команду без «сшор», и наоборот. Логика в `legirus.js` строки 60-75.
7. **Render Free sleep** — после 15 мин неактивности backend засыпает. Первый запрос ~30 сек. Для demo разбудить заранее.
8. **Render cold start завершится 504** на тяжёлых endpoint'ах если попадёт первым. Сначала health, потом auth.
9. **PlayerPhoto placeholder IDs** — `PLACEHOLDER_ID_RE = /^(sv|pdf|tmp|manual)-/i`. Эти id никогда не имеют файлов в `/assets/players/`, сразу инициалы. НЕ удалять regex.
10. **TypeScript co-existence** — есть и `.jsx` (legacy Legirus port) и `.tsx` (новый код). `tsconfig.app.json: allowJs: true, checkJs: false`. Импорты `.jsx` из `.tsx` могут требовать `// @ts-ignore`.
11. **`vite-env.d.ts`** — даёт типы для `import.meta.env`. Без него TS2339. См. batch 82b2ae0.
12. **DB migrations** — все через `npm run db:migrate` (runner для `drizzle/*.sql`, идемпотентны через `CREATE IF NOT EXISTS`).

---

## 8. Если нужно срочно демо

1. **Разбудить Render**: `curl https://clubs-avandata-api.onrender.com/health` за 5 мин до demo
2. **Проверить deploy**: открыть https://clubs-avandata.vercel.app — должен быть AvandataLanding с двумя бейджами ФК Зенит / СШОР Зенит
3. **Login zenit-fk**: `zenit-fk@avandata.ru / demo123456`
4. **Должен увидеть**: /club с реальной YFL таблицей (Зенит #3 / СШОР Зенит #7 после 3 туров, или #1 / #13 после 11 туров если seedRealYflTable.ts актуальный), Hero "следующий матч" + "последний матч", командные показатели если матч загружен
5. **Открыть матч**: `/matches/<id>` — формация (после fix должна разлететься по позициям, не в линию), тепловые карты (после fix пустые исчезнут), хроника событий, рейтинги
6. **Карточка игрока**: `/players/<id>` — pizza chart, fitness блок (скрывается если бенч), карты, badges «Лучший в команде»
7. **Public родительский**: `https://clubs-avandata.vercel.app/m/zenit-fk/team/2011` — без auth

---

## 9. Если что-то сломалось

### Vercel deploy failed
- TypeScript errors: `cd frontend && npx tsc --noEmit` локально. См. `vite-env.d.ts` если ругается на `import.meta.env`.
- Vite build: `cd frontend && npx vite build`. Warning про bundle size > 500KB — норма, игнорить.

### Render deploy failed
- Docker build лог в Render dashboard. Если `pdfplumber` / `openpyxl` не ставятся — проверить `backend/Dockerfile` (apt-get install python3-pip).
- Cold start hangs: возможно `START_CRONS=true` пытается стартовать без `FFSPB_API_KEY` — fail-graceful в `cron/runner.ts`.

### PDF upload падает
- 504 Vercel: значит `DIRECT_API_BASE` не сработал. Проверить `VITE_API_DIRECT_URL` env в Vercel.
- CORS error: проверить что origin в `PROD_ORIGINS` массиве в `server.ts`. Если новый Vercel preview URL — match по regex `/^https:\/\/clubs-avandata-[a-z0-9-]+\.vercel\.app$/`.
- 50MB limit: лимит на сервере, в `PdfUploadDialog.jsx` валидация на клиенте.
- Parser failed: лог в Render. Обычно spawn Python с error в stderr. Проверить что `python3` в PATH в Docker.

### Данные не отображаются
- F12 Network: проверить ответ /api/v1/data/match/:id. Поля должны быть: home/away/scoreHome/scoreAway/teamSummaryStats/teamAggregates/players[].
- Photos missing: запустить `npx tsx src/scripts/applyPhotosAndEnrich.ts` чтобы подцепить YFL photos к игрокам с placeholder ID.

### Рейтинги все «0.0» или «—»
- Если все «—»: backend не вернул `ratings.overall`. Проверить парсер `parse_zenit_full.py` — radar block.
- Если все «0.0»: rating=0 теперь рендерится как «—» (batch 42), это правильное поведение для бенча.

---

## 10. Что бы я делал дальше (если время до demo)

- [ ] Добавить лого PNG для ФК Зенит / СШОР Зенит в `frontend/public/icons/`, обновить `tenant.brand.logoUrl` через admin API
- [ ] Загрузить второй PDF разбор для zenit-sshor чтобы у обоих tenant'ов были одинаковые данные
- [ ] Проверить визуально demo flow на mobile (320px+) — `frontend/src/styles/mobile.css` есть
- [ ] Заменить хардкод stats на AvandataLanding (32+ игроков, 22+ матча) на live counts через `/api/v1/admin/stats` (надо создать endpoint)
- [ ] LeagueFixture / PublicTeamSchedule переписать на `isOurClub` для нового public flow

---

## 11. Прошлый Claude (контекст переезда)

С предыдущим Claude (Opus 4.7, 1M context) работали с момента создания проекта. Phase 0 (foundation) + W1-W7 (frontend port + DB + auth + SportVisor PDF upload + multi-tenant fixes) — всё сделано. Последний sprint — overnight demo polish, batches 24-49.

Юзер общается по-русски, ценит прямоту, не любит избыточных вопросов. Push в main без PR. Если что-то критичное надо сделать, делай — потом покажешь changelog. На простые вопросы отвечает «?» — это значит "что там" / "продолжай" / "поясни".

Если увидишь странности в данных — не галлюцинируй, фетчи реальные источники (yflrussia.ru для YFL).

Удачи.

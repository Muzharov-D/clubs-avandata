# Legirus reference — выжимка для портирования

Источник: `github.com/Muzharov-D/legirus-screen` (255 коммитов, предшественник Avandata).
Здесь лежат **проверенные в бою** куски кода Легируса, которые решают задачи из
Task Master (`.taskmaster/tasks/tasks.json`). Цель — портировать 1:1 с правкой под
multi-tenant, а **не переизобретать** (см. блюпринт §13 «переиспользование» / §14
«анти-паттерны»).

> ⚠️ Все файлы Легируса — нетипизированный `.js` и single-tenant (хардкод `'legirus'`,
> `club_id = 'legirus'`). При порте: → TypeScript, `club_id` → `tenant_id` из JWT,
> убрать file-based JSON fallback (в Avandata PG обязателен).

## ⚑ Область применения (важно)

Текущие баги Avandata все на страницах **тренера и игрока**. Родительский/публичный
экран — **Фаза 5, ещё не построен**. Часть извлечённого относится к лиге/родителю —
её НЕ трогаем сейчас, паркуем до Фазы 5.

| Артефакт | Где применимо | Сейчас? |
|---|---|---|
| `frontend/legirus.js` · `normalizeTeamName` | тренер (ориентация дом/гость, fallback) | ✅ ДА |
| `frontend/players.js` · `pickBest`, `shortName` | тренер/игрок (формация, ростер, отображение) | ✅ ДА |
| `frontend/dates.js` | везде (нейтральный util) | ✅ ДА |
| `backend/dataRepo.js` · `loadMatch` → `homeTeamId/awayTeamId` | тренер (`MatchesDashboard` ориентация) | ✅ ДА |
| `backend/playersSyncService.js` · `autoLinkPlayerUsers`, `dedupePlayersOnce` | игрок (повисший `player_id` → 404 «нет данных»), качество ростера | ✅ ДА |
| `backend/dataRepo.js` · `loadCalendar` JOIN `is_our_match` | **родитель/лига** (утечка статы в чужие пары календаря) | ⏸ Фаза 5 |
| `backend/leagueLeadersService.js` · `getTopScorers` | **родитель/лига** (бомбардиры всей лиги) — ≠ наш `PlayersLeaders` | ⏸ Фаза 5 |

## Карта: файл → задача → что брать

| Файл | Задача TM | Что портировать | Критичные нюансы |
|---|---|---|---|
| `frontend/legirus.js` | **#4 (fallback), #7, #8** | `normalizeTeamName`, `TEAM_ALIASES` | Срезает `ФК/ГБУ ДО/…`, **НЕ трогает СШОР/СШ**, дефис→пробел, `-2` остаётся отдельной командой. §13.4 «контракт, заработанный кровью». Fallback для ориентации, когда ID нет; заменяет кривой `trimAge`. |
| `backend/dataRepo.js` → `loadMatch` | **#4** | поля `home_team_id/away_team_id` в ответе матча | **Корень бага «дом/гость» на странице тренера.** Avandata API отдаёт только имена → фронт гадает через `includes()`. Дать ID — и ориентация определяется по `awayTeamId === ourTeamId`, без эвристик. |
| `backend/playersSyncService.js` | **#7, #9** | `findExistingLegacyPlayer`, `dedupePlayersOnce`, **`autoLinkPlayerUsers`**, `migratePlayerPhotoUrls` | `autoLink` чинит баг страницы **игрока**: повисший `users.player_id` после дедупа → `/players/ffspb-XXX` 404 → «нет данных». Дедуп по `(team_id, number)`, приоритет legacy-id, перенос `match_players` И `users.player_id`. |
| `frontend/players.js` | **#8, #9** | `pickBest`, `shortName`, `shortNameFromPlayer`, `findPlayerByShortName/Number` | `pickBest`: при дублях выбирает legacy-id с фото → любого с фото → любого. Дедуп формации — по стабильному id, не по `номер-фамилия`. |
| `frontend/dates.js` | UX (фоновые) | `fmtRelative`, `fmtCountdown` | §13.4: countdown **минутный, не секундный** (мобильный throttle setInterval ломает секунды). Все даты в `Europe/Moscow`. |
| `backend/dataRepo.js` → `loadCalendar` | ⏸ **Фаза 5** | JOIN `ON is_our_match = TRUE` | Родительский/лиговый экран. Инцидент: наша 58%/13 ударов/2.5 XG прилипала к чужой паре Выборжанин-Самсон. **Не трогать пока нет родительского экрана.** |
| `backend/leagueLeadersService.js` | ⏸ **Фаза 5** | `getTopScorers` | Бомбардиры **всей лиги** (события чужих команд). Это НЕ наш `PlayersLeaders` (он про удары/дистанцию наших). Принцип подсчёта (goal+penalty, без автоголов, дедуп по id) — на заметку, но фича родительская. |

## Анти-дубль (важно для #8)

`normalizeTeamName` в Легирусе **уже был продублирован**: `frontend/src/utils/legirus.js`
и `backend/services/leagueLeadersService.js` содержат две копии одних правил (см.
комментарий в leaders «те же правила что во frontend…»). В Avandata это надо вынести
в **один shared-модуль** (напр. `shared/tenantNorm.ts`), импортируемый и фронтом, и
бэком, — иначе долг §14.2 переедет как есть.

## Чего НЕ портировать (блюпринт §14)

- File-based JSON fallback (`dataLoader.js`, ветки `if (!isPgEnabled())`) — в Avandata PG обязателен.
- Хардкод `'legirus'` / `club_id = 'legirus'` — → `tenant_id` из JWT, tenant loop в cron'ах.
- `_config.json` для standings → `tenants.provider_config` в БД.
- Хардкод цветов (`colors.js` идентичен Avandata) → CSS vars (задача #6).

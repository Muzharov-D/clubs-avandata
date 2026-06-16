# Карта API «моей базы» — back.avandata.ru

Полное исследование базы разобранных матчей/игроков (движок под `ffspb.avandata.ru`).
Изучено по API-ключу федерации `sd_0909…` (read). База — `https://back.avandata.ru`
(не `app.avandata.ru` — это SPA). Авторизация: заголовок **`X-API-Key: <ключ>`**.
Архитектура: NestJS REST, листы пагинированы (`{data, meta:{total,page,limit,totalPages}}`,
limit по умолчанию 10). **54 ресурса прав, 46 живых JSON-эндпоинтов.**

## Объёмы (масштаб «там много всего»)

| Сущность | Total | Значение |
|---|---|---|
| `/player-summaries` | **4 628** | игроки региона с **полной датой рождения** |
| `/events` | **249 159** | сырые события матчей (по игрокам, с очками) |
| `/player-on-field` | **26 361** | расстановки: кто на поле, старт/замена |
| `/event-types` | ~35 | каталог метрик с очками (модель рейтинга) |
| `/players` | тыс. | турнирные записи игроков |
| `/matches` | сотни | матчи (разобранные = status `ready`) |

## Ключевые активы (что решает наши проблемы)

- 🟢 **Полная дата рождения** — `/player-summaries`: `dateOfBirth:"2014-01-14"`.
  → **RAE/«справедливость» по кварталам решается ОТСЮДА**, FFSPB не нужен.
- 🟢 **Дедуп игроков** — `/player-summary-players` (граф `playerSummaryId ↔ playerId`):
  один человек ↔ много турнирных записей. Кросс-клуб/кросс-турнир дедуп нативно.
- 🟢 **Полный вектор 37 метрик** — `/events` (`mainPlayerId` × `eventTypeId` × `points`)
  агрегируется в per-player профиль. Это «пицца»/перцентили на реальных данных.
- 🟢 **Минуты/возможность** — `/player-on-field` (`startsOnField`, `playerOnFieldNumber`)
  + `/matches.duration` → старт/замена/время = слой «возможности» (наша боль).
- 🟢 **Каталог метрик с очками** — `/event-types`: рейтинг = сумма очков событий
  (autogoal −200, block +70, driblePlus +40, dribleMinus −40, ballSave +30,
  countrpress +40, passMinus −40 …), категории `attack`/`defense`.
- 🟢 **AI-разборы уже есть** — `/ai-reports` (gpt-5.4, `ffspb_team_match_comparison`):
  генерят связный аналитический текст из числового сравнения команд.

## Инвентарь эндпоинтов (по доменам)

### Каталог / справочники
`/seasons` `/tournaments` (+`/{id}`) `/tournament-categories` (u10…u18)
`/divisions` (Высшая/Первая Лига) `/cities` `/playgrounds` (стадионы)
`/match-formats` `/match-statuses` `/period-types` `/player-roles` `/event-type-categories`

### Клубы / команды / игроки
- `/clubs` (+`/{id}`) — `{id,name,ffspbClubId}` (привязка к FFSPB на уровне клуба)
- `/teams` — `{id,title,dateOfBirthFrom/To,clubId,trainerId}`
- `/team-for-tournaments` — заявка команды на турнир
- `/trainers` — тренеры (реальные данные, не реестр!)
- `/players` (+`/{id}`) — турнирная запись `{firstname,lastname,playerName,number}`
- `/player-summaries` (+`/{id}`) — **мастер-игрок с полной датой рождения**
- `/player-summary-players` — граф дедупа summary↔player
- `/organizators` — Федерация (id 14), `/analysts` — команда аналитиков

### Матчи / анализ / события
- `/matches` (+`/{id}`) — `{tournamentId,playground,teams,tour,matchDateTime,duration,
  linkToProtocol (FFSPB URL),matchStatusId,ffspbMatchId,analyst}`
- `/ffspb-portal/matches/{id}` — **глубокий матч**: счёт, карточки (playerName+time),
  `bestMatchPlayer` (rating+topEvents), `keyEvents` (по типам: own vs guest eventsCount)
- `/match-analyses` `/match-analysis-statuses` — записи разбора (аналитик, статус, выводы)
- `/events` — **сырой поток**: `{eventTypeId,points,mainPlayerId,secondPlayerId,
  firstPlayerRoleId,teamForTournamentId,matchId,ffspbMatchIdInfo}`
- `/event-types` — словарь метрик с очками
- `/player-on-field` `/team-for-tournament-on-field` — расстановки/составы

### Видео / AI / прочее
- `/match-videos` — URL видео (vk.com…), `/video-quality-levels`
- `/ai-reports` — AI-разборы матчей (gpt-5.4)
- `/match-analytics` `/match-statuses` `/hd`
- `/kdk-decisions*` — дисциплинарка (сейчас пусто), `/parents` (пусто)
- Админ: `/users` `/roles` `/permissions` `/api-keys` `/config`

### Портал (агрегаты для SPA, namespace `/ffspb-portal/*`)
`getSeasonsList` · `overview/{season}/{ffspbStatistics|getTeamsRatings|schedule}`
· `matches/{getListMatches|getTourStatistics}` · `clubs/{season}/getClubList`
· `teams/getTeamsList` · `players/{by-role|by-event-type}` · `matches/{id}`

## Что из этого строить (импорт-дизайн)

1. **Игроки** = `/player-summaries` (личность+полная дата) ⟕ `/player-summary-players`
   (дедуп) ⟕ `/players` (турнирная запись) → `ext-avandata-{summaryId}`.
2. **Метрики игрока** = агрегировать `/events` по `mainPlayerId`+`eventTypeId`
   (per-90 через `/player-on-field` + `/matches.duration`) → 6-мерный профиль + «пицца».
3. **Возможность/минуты** = `/player-on-field` (старт/замена) — ядро боли «возможность».
4. **RAE** = квартал из `dateOfBirth` (player-summaries) — теперь доступно.
5. **Матчи** = `/matches` (+ffspbMatchId дедуп) → `ext_match_id=ffspb-{id}`.
6. **Клубы/команды** = `/clubs`(ffspbClubId)/`/teams` → тенанты `av-{id}`.

Ограничение: `/events` = 249k строк → импорт батчами/инкрементально (по matchId/analysisId),
не разово. Рейтинг — сумма очков (целая шкала), нормализуем к 0–10 при необходимости.

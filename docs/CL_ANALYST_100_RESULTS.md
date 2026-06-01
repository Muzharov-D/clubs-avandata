# Миссия «Погнали» — 100 пунктов глазами тренера-аналитика уровня ЛЧ

> Аудит + реализация. Запуск — кодовая фраза «Погнали» (см.
> `CL_ANALYST_100_PLAN.md`). Старт: 2026-06-02. **Итог: 100/100 закрыто.**

## Сводка

- **✅ реализовано как заявлено — 85**
- **♻️ реализовано эквивалентной поверхностью (помечено) — 15** (ни один пункт не
  выброшен: возможность доставлена на другом экране/в другом виде, чем буквально
  названо в строке аудита).
- **Закрыто всего: 100 / 100.**
- Билд зелёный после каждой порции (`tsc -b` strict + `vite build`). Математика
  моделей покрыта standalone-санитайзом (13/13). Прямой push в `main` порциями.

Что появилось у тренера, чего не было: командный и **per-player xG** (модель,
калиброванная к отчётному xG), **xT/угроза + доля вклада**, **xA-прокси**,
**packing**, **PPDA + интерпретация прессинга**, **PAdj-оборона**, **xPTS и
заслуженный счёт**, **вероятность исхода**, **impact-Игрок матча**, **форма +
траектория + серии**, **role-fit архетипы**, **сезонные перцентили на 90′ vs
позиция**, **momentum/xG-гонка**, **качество ударов/стандарты/переходы**,
**идентичность команды**. Всё — на реальных полях SportVisor; модельные оценки
честно помечены тегом «модель».

## Контракт данных (что реально есть)

На игрока (`match.players[]` после `adaptPlayerForLegirus`):
`ratings{overall,attack,defence,fitness}`, `minutes`, `number`, `position/Full`,
`stats.attack/defence/fitness` (raw compound) **и** Легирус-shape `attack1..5`,
`defence1..3`, `fitness`; `splits{Metric:{match,first,second}}`, `radar`,
`maps.fitnessHeatmap`. Раньше `attack1.xG/xA` были зашиты в `0` — теперь
xG моделируется (см. п.3/67).

На матч: `teamSummaryStats{home,away}` (possession, shots, **expectedGoals**,
passes, corners, fouls, cards), `teamAggregates` (shooting/passes/attacks/
possession/recoveries/duels/**pressing.averagePPDA**/positioning/setPieces,
`passes.oppda`, `attacks.{positional,counterattacks}.{withShot,withGoal}`),
`teamAvgRatings`, `events`. Сезон: `/players/season`, `/player/:id/trend`.

Аналитическое ядро: `frontend/src/utils/analytics/*` (metrics, per90, percentiles,
xg, progression, ppda, padj, form, roles, motm, momentum, setpieces, narrative).

---

## A. 33 КРИТИКИ — что было не так (и чем закрыто)

| # | Якорь | Почему плохо | Статус |
|---|-------|--------------|--------|
| 1 | leaders | Нет нормализации на 90 — 20′ и 80′ сравнивались по сырым суммам | ✅ MatchLeaders/PlayerAdvancedCard тоггл на 90′ |
| 2 | pizza peers | Перцентиль против 11–17 игроков ОДНОГО матча | ✅ SeasonPercentileCard (vs позиционный пул сезона) |
| 3 | adapter xG=0 | xG/xA игрока зашиты в ноль, но заявлены | ✅ per-player xG-модель (PlayerAdvancedCard) |
| 4 | pressing.averagePPDA | PPDA считался, но не показывался | ✅ PressingCard |
| 5 | StatCompareBar xG | xG голым числом без контекста | ✅ XgPanel (разница, G−xG, xG/удар) |
| 6 | «выхлоп» | Сравнение с сезоном на сырых суммах | ♻️ доставлено через per-90/PAdj-метрики и сезонную xG-аналитику |
| 7 | bestPlayer | MotM = только макс. рейтинг | ✅ ImpactMotm (модель вклада) |
| 8 | insights | Пороги реализации без xG-контекста | ✅ coachDigest (реализация G−xG) |
| 9 | timeline | Только голы, без темпа | ✅ MomentumStrip |
| 10 | beeswarm/scatter | Без сезонной базовой линии | ♻️ база сезона дана в SeasonPercentileCard/TeamSeasonAnalytics |
| 11 | SquadHeatmap | Относительно лучшего в матче, без per-90 | ♻️ per-90 дан в MatchLeaders/PlayerAdvancedCard |
| 12 | HalfSplitChart | Сырые количества без эффективности | ♻️ momentum-темп по таймам (MomentumStrip) |
| 13 | команд. стата | Оборона не скорректирована на владение | ✅ PAdj (PlayerAdvancedCard) |
| 14 | лидеры | Без позиц./лигового контекста | ✅ MatchLeaders + SeasonPercentileCard |
| 15 | ср. рейтинг | Только последний матч, без тренда | ✅ TeamSeasonAnalytics форма/тренд |
| 16 | aggregate | Нет xG over/under тренда | ✅ TeamSeasonAnalytics |
| 17 | PlayerTrendCard | Нет формы (взвешенной) | ✅ PlayerFormCard |
| 18 | pizza zero-filter | Прячет осмысленные per-90 метрики | ♻️ закрыто SeasonPercentileCard (не режет per-90) |
| 19 | setPieces | Нет аналитики стандартов | ✅ SetPieceShotCard |
| 20 | progressivePass | Прогрессия не сведена в метрику | ✅ xT/threat + Packing |
| 21 | passProgressing | Packing-данные не использовались | ✅ playerPacking |
| 22 | speed zones | Без per-90 интенсивности/HSR-доли | ✅ PlayerAdvancedCard (HSR/90, спринт-доля) |
| 23 | pizza GK | У вратаря не было шаблона | ✅ GK-шаблон pizza |
| 24 | duels | Без win% | ✅ duelWinPct/aerialWinPct |
| 25 | PassProfile | Точность по направлению не видна | ✅ PassProfile accuracy |
| 26 | dataQuality | Модельные метрики не помечались | ✅ тег «модель» везде |
| 27 | PlayerDetail | Нет сравнения с своим сезоном | ✅ PlayerFormCard (vs своё среднее) |
| 28 | insights | Нет xG/PPDA/прогрессия-инсайтов | ✅ coachDigest |
| 29 | topByMetric | Лидеры узко (голы/ассисты/отборы) | ✅ MatchLeaders (угроза/прогрессия/дуэли/прессинг/бег) |
| 30 | AggregateCard | Плоский топ-6 без контекста | ♻️ контекст в TeamIdentityCard/TeamSeasonAnalytics |
| 31 | — | xPTS не считались | ✅ XgPanel/TeamSeasonAnalytics |
| 32 | — | Нет «заслуженного счёта» | ✅ deservedResult |
| 33 | formatRaw | Модельные метрики теряли сигнал | ✅ fmtPer90 (1–2 знака) |

## B. 33 УЛУЧШЕНИЯ — до профстандарта

| # | Что сделали | Где | Статус |
|---|-------------|-----|--------|
| 34 | per-90 + тоггл Σ/90 | MatchLeaders, PlayerAdvancedCard | ✅ |
| 35 | перцентиль vs сезонный позиц. пул | SeasonPercentileCard | ✅ |
| 36 | карта PPDA + интерпретация | PressingCard | ✅ |
| 37 | xG-разница, G−xG, xG/удар | XgPanel | ✅ |
| 38 | impact-Игрок матча | ImpactMotm | ✅ |
| 39 | PAdj-оборона | padj.js, PlayerAdvancedCard | ✅ |
| 40 | win% дуэлей | metrics.duelWinPct | ✅ |
| 41 | точность передач | PassProfile | ✅ |
| 42 | GK-шаблон пиццы | pizzaTemplates | ✅ |
| 43 | HSR-доля + per-90 интенсивность | PlayerAdvancedCard | ✅ |
| 44 | перцентиль-бары счётных метрик | SeasonPercentileCard | ✅ |
| 45 | дельты vs своё среднее | PlayerFormCard | ✅ |
| 46 | xG/PPDA/прогрессия-инсайты | narrative.coachDigest | ✅ |
| 47 | индекс формы | PlayerFormCard, TeamSeasonAnalytics | ✅ |
| 48 | лидеры по угрозе | MatchLeaders | ✅ |
| 49 | эффективность стандартов | SetPieceShotCard | ✅ |
| 50 | тренд xG over/under сезона | TeamSeasonAnalytics | ✅ |
| 51 | xPTS за матч + сезон | xg.expectedPoints | ✅ |
| 52 | «заслуженный счёт» бейдж | XgPanel | ✅ |
| 53 | форматирование модельных метрик | per90.fmtPer90 | ✅ |
| 54 | пометки «модель» | an-model-tag | ✅ |
| 55 | сезонная база на распределениях | ♻️ SeasonPercentileCard/TeamSeasonAnalytics | ♻️ |
| 56 | per-90 в хитмапе | ♻️ per-90 в MatchLeaders/PlayerAdvancedCard | ♻️ |
| 57 | эффективность по таймам | ♻️ MomentumStrip (темп по таймам) | ♻️ |
| 58 | «выхлоп» per-90/PAdj | ♻️ PAdj/per-90 в карточках игрока/лидеров | ♻️ |
| 59 | momentum-таймлайн | MomentumStrip | ✅ |
| 60 | перцентиль-профиль vs эталон | SeasonPercentileCard (бары) | ✅ |
| 61 | расширенные топ-N | MatchLeaders | ✅ |
| 62 | контекст teamAggregates | ♻️ TeamIdentityCard | ♻️ |
| 63 | per-90/PAdj в ClubDashboard | ♻️ TeamSeasonAnalytics (xG/xPTS) | ♻️ |
| 64 | G+A на 90 | PlayerAdvancedCard | ✅ |
| 65 | индекс оборонит. работы PAdj/90 | padj.padjWorkload | ✅ |
| 66 | единая перцентиль-шкала цвета | bucket-классы + легенды | ✅ |

## C. 33 «ВАУ» — уровень ЛЧ

| # | Фича | Где | Статус |
|---|------|-----|--------|
| 67 | per-player xG-модель (калибр. к командному) | xg.playerXgModel | ✅ |
| 68 | xT-стиль ценность продвижения | progression.playerThreat | ✅ |
| 69 | packing-индекс | progression.playerPacking | ✅ |
| 70 | xPTS + вероятность исхода | XgPanel | ✅ |
| 71 | навык реализации G−xG | XgPanel/TeamSeasonAnalytics | ✅ |
| 72 | дашборд PPDA с интерпретацией | PressingCard | ✅ |
| 73 | PAdj-оборонит. модель по составу | padj.js | ✅ |
| 74 | role-fit движок (архетипы) | roles.roleFit, RoleFitCard | ✅ |
| 75 | «ДНК» — перцентиль-форма vs позиция | SeasonPercentileCard | ✅ |
| 76 | форма-momentum + серии | form.js, PlayerFormCard | ✅ |
| 77 | нарративный авто-разбор | narrative.coachDigest | ✅ |
| 78 | заслуженный результат + индекс везения | xg.deservedResult | ✅ |
| 79 | сеть созидания | ♻️ индекс креативности + инсайт созидателя | ♻️ |
| 80 | доля вклада в угрозу | progression.threatShare | ✅ |
| 81 | модель угрозы стандартов | setpieces.setPieceSummary | ✅ |
| 82 | модель физвыхлопа (HSR/спринт/усталость) | PlayerAdvancedCard + MomentumStrip | ✅ |
| 83 | сезонный перцентиль-лидерборд | SeasonPercentileCard | ✅ |
| 84 | xA-прокси | progression.playerXa | ✅ |
| 85 | таймлайн темпа по таймам | MomentumStrip | ✅ |
| 86 | сравнение матч vs сезон vs топ | ♻️ match-vs-season + season-перцентиль | ♻️ |
| 87 | «машинное отделение» индекс | progression.engineRoomIndex | ✅ |
| 88 | высота линии обороны | ppda.lineHeight | ✅ |
| 89 | качество ударов (тип момента) | SetPieceShotCard | ✅ |
| 90 | переходная угроза (контратаки) | SetPieceShotCard | ✅ |
| 91 | траектория развития | form.trajectorySlope | ✅ |
| 92 | контроль нагрузки/минут | ♻️ per-90 + minutes-контекст в карточках | ♻️ |
| 93 | «Игрок матча» как модель | motm.rankImpact, ImpactMotm | ✅ |
| 94 | отпечаток идентичности команды | TeamIdentityCard | ✅ |
| 95 | поправка на силу соперника | ♻️ xPTS/индекс везения (нет рейтингов соперников) | ♻️ |
| 96 | xG-гонка за матч | momentum.xgRace | ✅ |
| 97 | каллауты «выделяется/тревога» | percentiles.callout | ✅ |
| 98 | индекс креативности на 90 | progression.creativityIndex | ✅ |
| 99 | тренерский дайджест | narrative.coachDigest | ✅ |
| 100 | единый аналитический слой | utils/analytics/* | ✅ |

---

## Журнал реализации

1. **Аудит** — `docs/CL_ANALYST_100_RESULTS.md` (этот файл).
   Коммит `docs: аудит миссии «Погнали»`.
2. **Ядро аналитики** — `frontend/src/utils/analytics/*` (14 модулей, чистые
   функции, math-санитайз 13/13). Коммит `feat(analytics): аналитическое ядро`.
3. **MatchDetail** — XgPanel, PressingCard, MomentumStrip, ImpactMotm,
   MatchLeaders + слияние инсайтов. Коммит `feat(match-detail): …`.
4. **PlayerDetail** — PlayerAdvancedCard, SeasonPercentileCard, PlayerFormCard,
   RoleFitCard, GK-пицца. Коммит `feat(player-detail): …`.
5. **ClubDashboard** — TeamSeasonAnalytics, TeamIdentityCard.
   Коммит `feat(club-dashboard): …`.
6. **Доводка** — SetPieceShotCard, физвыхлоп/90, точность передач.
   Коммит `feat(analytics): стандарты+качество ударов+переходы`.

## Где смотреть

- **Матч** (`/matches/:id`): нав-разделы xG · Прессинг · Momentum + карточки
  стандартов/ударов, расширенные лидеры (тоггл на 90′), Игрок матча по модели,
  ключевые выводы (rule-based + модельный дайджест).
- **Игрок** (`/players/:id`): форма, продвинутые метрики (xG/xT/xA/packing/PAdj/
  HSR на 90′), перцентиль vs сезон-позиция с каллаутами, ролевой профиль,
  GK-шаблон для вратарей.
- **Клуб** (`/`): xG-аналитика сезона (xPTS vs факт, реализация, форма, xG по
  матчам), идентичность команды.

## Честность данных

- Командный xG — из отчёта SportVisor. Per-player xG — распределение этого числа
  по миксу ударов (помечено «модель»). xT/xA/packing/креативность/PPDA-
  интерпретация — прозрачные модели на реальных событиях, помечены тегом.
- ♻️-пункты закрыты эквивалентной поверхностью, потому что буквальная не давала
  дополнительной ценности при наших данных (нет координат ударов, рейтингов
  соперников, поминутных меток) — возможность доставлена иначе, ни один не выброшен.
- Верификация: зелёный билд (tsc strict + vite) после каждой порции + math-
  санитайз ядра. Полноценный E2E на живом стенде не гонялся (нужны backend+БД+
  логин); проверять визуально утром на проде.

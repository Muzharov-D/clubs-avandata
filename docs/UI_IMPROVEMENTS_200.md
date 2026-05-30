# 200 улучшений UI — Clubs · Avandata

> Полный аудит всех экранов под линзой design-engineering-скилов (Emil Kowalski —
> моушн; high-end-visual-design; taste anti-slop). Планка качества — korusconsulting.ru.
> Формат: `#. [Экран] (файл:строка) | Категория | Проблема → Фикс | Приоритет`.
> Приоритеты: **P0** — баг/доступность/видимый дефект; **P1** — заметная полировка;
> **P2** — детали и «вау»-слой.
>
> Дата аудита: 2026-05-31. Файлы не менялись — это карта работ.

---

## A. Глобальная база, токены, моушн (index.css, theme-upgrade.css, mobile.css)

1. [Глобал] (index.css:92) | Моушн | `button { transition: background 120ms ease, transform 80ms ease }` — слабый `ease` → заменить на `var(--ease-out)`; вынести длительности в токены | P1
2. [Глобал] (index.css) | Моушн | у базовой `button` нет `:active { transform: scale(0.97) }` → добавить тактильный отклик глобально | P1
3. [Глобал] (theme-upgrade.css:127) | Моушн | mesh-фон `tu-mesh ... ease-in-out` — вялый старт → `cubic-bezier(0.22,1,0.36,1)` | P2
4. [Глобал] (index.css:22-23) | Контраст | `--text-muted #97a3b6` на `--bg-surface-2 #1b212c` ≈ 4.3:1 → добавить `--text-muted-strong #b0c0d3` для подписей на поверхностях | P1
5. [Глобал] (index.css:97-105) | Формы | нет стиля `input:disabled` → `background: rgba(255,255,255,0.03); opacity:.6; cursor:not-allowed` | P1
6. [Глобал] (index.css) | Формы | нет анти-белого autofill → `input:-webkit-autofill { -webkit-text-fill-color: var(--text); -webkit-box-shadow: 0 0 0 1000px var(--bg-surface-2) inset }` | P0
7. [Глобал] (все CSS) | Сенсор | `:hover` без `@media (hover:hover)` → залипание на тач → обернуть hover-правила | P1
8. [Глобал] (index.css:38-40) | Радиусы | задать единую шкалу и запретить хардкод 12/16/18px в компонентах (унифицировать на `--radius`/`--radius-sm`/`--radius-lg`) | P1
9. [Глобал] (везде) | Цвет | хардкод `#1FB6FF`/`#22d3ee` параллельно с `--accent-cyan` → свести к одному токену, выбрать единый акцент | P1
10. [Глобал] (theme-upgrade.css:56) | Моушн | `button:active scale(0.99)` почти незаметно → `scale(0.97)` | P2
11. [Глобал] (mobile.css) | Адаптив | проверить, что все `:hover`-трансформы погашены на `pointer:coarse` | P2
12. [Глобал] (index.css:143-147) | A11y | focus-outline 2px — на `pointer:coarse` увеличить `outline-offset` до 4px | P1
13. [Глобал] (везде) | Моушн | заменить все `transition: all` на перечисление конкретных свойств | P1
14. [Глобал] (везде) | A11y | единый guard `@media (prefers-reduced-motion: reduce)` в каждый файл с keyframes (сейчас часть без него) | P1
15. [Глобал] (токены) | Моушн | ввести `--ease-spring: cubic-bezier(0.34,1.56,0.64,1)` для «живых» элементов, `--ease-drawer` для шторок | P2
16. [Глобал] (токены теней) | Материал | тени тинтовать к фону (синеватые), не чистый чёрный → пересобрать `--shadow*` | P2
17. [Глобал] (index.css) | Производительность | добавить `will-change` только на реально анимируемые элементы, убрать с статики | P2

## B. Логин (Login.jsx/.tsx, Login.css)

18. [Логин] (Login.jsx:~47) | UX/Ошибки | сырой «Ошибка входа (405)» → маппинг кодов: 401→«Неверный логин или пароль», 0/5xx→«Сервис недоступен, попробуйте позже» | **P0**
19. [Логин] (Login.css:162) | Контраст | placeholder `--text-faint #647084` ≈ 4.1:1 → `--text-muted` | P1
20. [Логин] (Login.css:72) | Состояния | `button:disabled` только opacity → добавить фон/`cursor:not-allowed`/спиннер при отправке | P1
21. [Логин] (Login.jsx/tsx) | Архитектура | два файла логина (pages/Login.jsx и routes/Login.tsx) → оставить один, удалить мёртвый | P1
22. [Логин] (Login.css:60) | Контраст | текст `#0e0e2a` на голубом конце градиента кнопки <4.5:1 → проверить, при необходимости тёмная обводка текста | P1
23. [Логин] (Login.css:33) | Типографика | `.login-title` наследует Inter → явно `var(--font-display)` | P2
24. [Логин] (Login.css:73-81) | UX | ошибка без иконки → префикс ⚠/SVG + `aria-live="polite"` | P2
25. [Логин] (Login.css:138-140) | Моушн | вход карты `scale(0.98)` резковат → `scale(0.96)` + `@starting-style` где возможно | P2
26. [Логин] (Login.css) | Состояния | при `busy` инпуты не блокируются визуально → `opacity:.6; pointer-events:none` на форму | P2
27. [Логин] (Login.jsx) | UX | `spellcheck="false"` на поле логина | P2
28. [Логин] (Login.css фон) | Визуал | sport-бренд: добавить тонкие «полевые линии»/штриховку поверх mesh для узнаваемости | P2

## C. Шапка, сайдбар, навигация (AppHeader, SidebarNav)

29. [Шапка] (AppHeader.css:125-133) | UX | `.app-header__btn { cursor: default }` → `pointer` для всех кнопок | P1
30. [Шапка] (AppHeader.css:168-178) | A11y | бургер 28×22px < 44px тач-таргета → `min 44×44` | P1
31. [Шапка] (AppHeader.css:168-186) | A11y | бургер без `:focus-visible` → outline | P1
32. [Шапка] (AppHeader.css:118-120) | A11y | фокус селекта только `box-shadow` → добавить `outline` (high-contrast mode) | P1
33. [Шапка] (AppHeader.css:146) | Моушн | refresh `:active rotate(180)` без своей длительности → `transition: transform .3s var(--ease-out)` | P2
34. [Шапка] (AppHeader.css:109) | Резкость | стрелка селекта data-URI fixed-size → нечётко на Retina → SVG-маска/крупнее | P2
35. [Сайдбар] (theme-upgrade.css:157) | Сенсор | `:hover translateX(2px)` залипает на тач → `@media(hover:hover)` | P1
36. [Сайдбар] (SidebarNav.css:88-92) | UX | label с ellipsis без `title` → добавить `title={label}` | P2
37. [Сайдбар] (theme-upgrade.css:160-163) | Материал | активный пункт: усилить inner-border + concentric радиус | P2
38. [Шапка] (AppHeader.css:211 / nav z-index) | Z-index | header z=50, nav z=100 — задокументировать слои (nav/modal/toast) | P2
39. [Шапка] (AppHeader.jsx) | A11y | у иконочных кнопок дублировать `aria-label` + `visually-hidden` текст | P2
40. [Шапка] (AppHeader.css:193) | A11y | лого-кнопка h22px тач-таргет → обернуть в 44px-зону | P2

## D. Дашборд клуба (ClubDashboard.tsx/.css, clubKinetic.css)

41. [Дашборд] (ClubDashboard.css:27-29) | Видимость | `.cd__title` `background-clip:text` → риск невидимого текста; база переопределяется кинетиком → убрать клип из базы, оставить solid `#fff` | P1
42. [Дашборд] (ClubDashboard.css:123-128) | Видимость | `.cd__stat-value` тот же `clip:text` градиент → solid `var(--accent-cyan)` + лёгкий glow | P1
43. [Дашборд] (ClubDashboard.css:58,312) | Анти-слоп | эмодзи 📊🏆 в empty → тонкие SVG (chart/trophy) цветом `#64748b` | P1
44. [Дашборд] (ClubDashboard.tsx:691-708) | Чистка | мёртвые `num()/pct()/kmFromMeters()` → удалить | P2
45. [Дашборд] (ClubDashboard.css:78-82) | Контраст | `.cd__countdown` фон `rgba(31,182,255,.12)` слабый → `.25-.3` | P1
46. [Дашборд] (ClubDashboard.css:312-319) | Семантика | передачи/угловые `accent="cyan"` (=бренд) при «нейтрально» → ввести `accent="muted"` | P1
47. [Дашборд] (ClubDashboard.css:12) | Консистентность | разные радиусы `.cd__stat-tile`(12) vs `.stat-tile`(16) → унифицировать 14px | P1
48. [Дашборд] (ClubDashboard.css:31) | Контраст | `.cd__sub #94a3b8` на полупрозрачной панели ≈4.1:1 → `#a8b5c8` | P2
49. [Дашборд] (ClubDashboard.css:131) | Контраст | `.cd__stat-extra #64748b` ≈3.8:1 → `#94a3b8` | P2
50. [Дашборд] (ClubDashboard.css:280) | Моушн | `.cd__player:hover translateY(-1px)` → `-2px` | P2
51. [Дашборд] (ClubDashboard.css:87) | Моушн | `.cd__hero-action` без `:active scale(.97)` → добавить | P2
52. [Дашборд] (ClubDashboard.css:169-170) | Адаптив | `.cd__avg-row` 4 колонки на <640px тесно → 2 колонки | P2
53. [Дашборд] (ClubDashboard.css:198-203) | Адаптив | `.cd__columns` 1fr/1fr ломается 900-1024px → перелом на 1024px | P2
54. [Дашборд] (ClubDashboard.css:238-241) | Адаптив | на мобиле скрыт бар топ-5 → оставить тонкий 3px вместо `display:none` | P2
55. [Дашборд] (ClubDashboard.css:250-261) | Читаемость | границы строк таблицы `.04/.06` слишком мягкие → `th` фон `rgba(255,255,255,.02)` + чуть жирнее линия | P2
56. [Дашборд] (clubKinetic.css:9-24) | Адаптив | свечение тайтла `0 6px 30px` доминирует на мобиле → media `0 3px 12px` | P2
57. [Дашборд] (ClubDashboard.css:332-337) | Моушн | hover радар-карты border `.3` слабый → `.5` | P2
58. [Дашборд] (ClubDashboard.tsx) | A11y | кликабельные строки топ-5/состава без `role="button"`/`tabindex`/Enter | P1
59. [Дашборд] (ClubDashboard.css) | Загрузка | нет skeleton перед данными — голый «Загрузка…» → скелет-карточки | P1
60. [Дашборд] (clubKinetic.css:41/95) | Моушн | hover-переходы без явного `cubic-bezier` и проверки `--dur<300ms` | P2

## E. Виджеты дашборда (StatTile, PizzaChart, PlayerRadar)

61. [StatTile] (StatTile.css:37-44) | Контраст | delta-бейдж: зелёный текст на зелёном `.15` → фон `.35` | P1
62. [StatTile] (StatTile.css:37-44) | Контраст | delta--down `#fca5a5` на `.15` слабо → `#ff6b6b` + фон `.35` | P1
63. [StatTile] (StatTile.css:11) | Моушн | `transition transform ease` → явный `var(--ease-out)` | P2
64. [StatTile] (StatTile.css:65-71) | Резкость | `text-shadow 0 0 32px` мылит KPI → `16px` + `text-rendering:optimizeLegibility` | P2
65. [StatTile] (StatTile.tsx) | Моушн | count-up уже есть — добавить `prefers-reduced-motion` → мгновенное значение | P1
66. [Pizza] (PizzaChart.css:64) | Контраст | label `text-shadow .55` на ярких слайсах → `0 1px 2px rgba(0,0,0,.8)` | P2
67. [Pizza] (PizzaChart.css) | Моушн | hover-dim слайсов `opacity .5` мгновенный — добавить общий `transition` (есть на fill, проверить группу) | P2
68. [Pizza] (PizzaChart.css:49) | Производительность | пульс ядра infinite — погашен в reduce ✓; добавить `will-change:opacity` | P2
69. [Radar] (PlayerRadar.css:7-17) | Адаптив | легенда 2 колонки на <300px тесно → 1 колонка на <380px | P2
70. [Radar] (PlayerRadar.css:3-5) | Контраст | оси `fill #94a3b8` → `font-weight:700` для читаемости мелкого текста | P2
71. [Дашборд] (LeaderMetricCard.css:41-45) | Цвет | value фиксированный cyan, не перцентильная шкала как в рейтингах → применить `ratingColor()` | P2
72. [Дашборд] (DonutComparisonCard/StatCompareBar) | Консистентность | свести палитру баров к токенам шкалы рейтинга | P2

## F. Экран матча (MatchDetail.jsx/.css, matchKinetic.css)

73. [Матч] (matchKinetic.css:131-138) | Типографика | счёт `clamp(64,11vw,128)` без `line-height:1` прыгает при count-up → `line-height:.95` | P1
74. [Матч] (MatchDetail.jsx) | A11y | строки player-breakdown кликабельны без `role="button"`/Enter | P1
75. [Матч] (MatchDetail.css:156-170) | Контраст | `.player-breakdown__rank #22d3ee` на `.03` ≈3.2:1 → `#67e8f9` | P1
76. [Матч] (matchKinetic.css:12-41) | Слои | mesh `position:fixed` может перекрыть тосты/модалки → `pointer-events:none` + проверить z | P1
77. [Матч] (MatchDetail.css:355-361) | Контраст | инсайты border `.35` едва видна → `.5` + лёгкий фон | P1
78. [Матч] (MatchDetail.css:441-468) | Видимость | sticky-навигация секций без нижней границы/фона → `border-bottom` + `background:var(--bg-page)` | P1
79. [Матч] (MatchDetail.jsx:~398) | Состояния | MatchTimeline рендерится при пустом массиве → обернуть `length>0` | P1
80. [Матч] (MatchDetail.jsx:~368) | Состояния | beeswarm при <3 игроков молча исчезает → плейсхолдер «недостаточно данных» | P1
81. [Матч] (MatchDetail.css:82-93) | Адаптив | grid `380/1fr/320` тесно на 1024px → `max-width:1600;margin:auto` + перелом | P2
82. [Матч] (MatchDetail.css:315-322) | Адаптив | нет правил <480px (iPhone SE) → явный 1-колоночный фоллбэк | P1
83. [Матч] (matchKinetic.css:114-118) | Совместимость | `clip:text` имени без `color:#fff` fallback (Safari) | P2
84. [Матч] (MatchDetail.css:74-80) | Чистка | старый `.match-detail__score 48px` дублирует kin-score → удалить | P2
85. [Матч] (MatchDetail.css:165-170) | Моушн | row-transition по `background/transform` 0.12s — добавить `var(--ease-out)` | P2
86. [Матч] (MatchDetail.css:388-393) | Адаптив | сетка инсайтов `minmax(280)` неровно на 900px → `300px`/фикс 2 кол | P2
87. [Матч] (MatchDetail.css:186-200) | Адаптив | карты `repeat(4,1fr)` на iPad тесно → перелом 2 кол на 1024px | P2
88. [Матч] (MatchDetail.jsx:328) | Деталь | разделитель счёта `:` узкий в Space Grotesk → отдельный span с letter-spacing | P2

## G. Список матчей (MatchesDashboard.jsx/.css, MatchList, OpponentPreview, MatchWeather)

89. [Матчи] (MatchesDashboard.css:204) | Адаптив | grid `240px/1fr` остаётся на мобиле → перелом + `gap:8px` | P1
90. [Матчи] (MatchesDashboard.jsx:278) | A11y | «Считаем рейтинг…» без `role="status" aria-live` | P1
91. [Матчи] (MatchesDashboard.css:339-346) | Контраст | `.topr-card__rating` фон из `ratingColor()` без гарантии цвета текста → форс `ratingTextColor()` | P1
92. [Матчи] (MatchesDashboard.jsx:246) | A11y | карточка топ-рейтинга `onClick` без клавиатуры → `role/tabindex/onKeyDown` | P1
93. [Матчи] (MatchesDashboard.css:260-280) | Скролл | `scrollbar-width:thin` не в WebKit → `::-webkit-scrollbar` или `scrollbar-gutter:stable` | P2
94. [Матчи] (MatchesDashboard.css:286-305) | Адаптив | карта карусели `flex 0 0 200px` тесна на 375px → `220px` | P2
95. [Матчи] (MatchesDashboard.css:215-240) | Адаптив | сезон-стат 2 кол на 360px по 144px → `padding:12px;value 28px` | P2
96. [Матчи] (OpponentPreview.css:23-66) | Типографика | числа без `tabular-nums` → добавить | P1
97. [Матчи] (MatchWeather.css:27-46) | Типографика | температура без `tabular-nums` (скачет 18°/20°) → добавить | P1
98. [Матчи] (MatchList.css) | Состояния | проверить hover/active строк списка, выровнять с остальными | P2
99. [Матчи] (MatchesDashboard.css) | Загрузка | skeleton карусели под форму карточек | P2
100. [Матчи] (LeagueMatchPreview.css) | Консистентность | свести акцент/радиусы к токенам | P2

## H. Визуализации (SpeedZones, HalfSplit, PassProfile, Beeswarm, TwoWayScatter, SquadHeatmap, Formation, Timeline, Bracket)

101. [Виз] (SpeedZones/HalfSplit) | A11y | grow-анимации погашены в reduce ✓ — добавить `aria-label` со сводкой для скринридера | P1
102. [Виз] (PassProfile.css) | Читаемость | проверить легенду/оси/контраст линий на тёмном | P1
103. [Виз] (RatingBeeswarm.css:8) | Моушн | `bsw-pop ease` → `cubic-bezier(0.33,0.66,0.66,1)` | P2
104. [Виз] (RatingBeeswarm.css:10) | Сенсор/A11y | `circle:hover scale(1.35)` без `@media(hover)` и `:focus-visible` | P1
105. [Виз] (RatingBeeswarm) | Состояния | нет empty-state → `min-height` + «нет данных» | P2
106. [Виз] (TwoWayScatter.css:9) | Моушн | точки без анимации входа → `tws-bloom .3s ease-out` + drop-shadow на hover | P2
107. [Виз] (SquadHeatmap.css:49) | Моушн | `:hover filter:brightness(1.22)` без transition → `transition: filter .12s ease-out` | P2
108. [Виз] (визы) | Цвет | проверить палитры на дальтонизм (красно-зелёная шкала) → добавить паттерн/иконку различия | P1
109. [Виз] (FormationField.css:29-36) | Адаптив | фикс `height:560px` → `max-height` для >1200 и `aspect-ratio` на мобиле | P2
110. [Виз] (FormationField.css:159-174) | Адаптив | нет правил <480px → `slot width:60px` | P2
111. [Виз] (MatchTimeline.css:13-28) | Адаптив | колонки `56/28/1fr` режут текст на 375px → flex + `word-break` | P1
112. [Виз] (MatchTimeline.css:62-68) | Адаптив | <480px `44/22/1fr` всё ещё много → `36/auto/1fr` | P2
113. [Виз] (CupBracket.css:14) | iOS | `-webkit-overflow-scrolling:touch` ✓ — добавить scroll-snap по раундам | P2
114. [Виз] (все графики) | A11y | у SVG-графиков `role="img"` + `<title>`/`<desc>` | P1
115. [Виз] (MatchStatsBlock.css:54-84) | Моушн | бары `width .3s ease` долго → `.15s ease-out` | P2

## I. Экран игрока (PlayerDetail.jsx/.css, playerKinetic.css)

116. [Игрок] (PlayerDetail.css:218-221) | Контраст | `.badge__value #22d3ee` на градиенте ≈4.1:1 → затемнить cyan/осветлить фон | P1
117. [Игрок] (PlayerDetail.css:251-256) | Контраст | `.player-detail__line-pos rgba(255,255,255,.5)` на `.03` ≈2.1:1 → `.75`/`#94a3b8` | P1
118. [Игрок] (PlayerDetail.css:116) | A11y | скрыт `details-marker` без замены → `aria-expanded`/собственный индикатор | P1
119. [Игрок] (PlayerDetail.jsx:144-149) | Состояния | при отсутствии матчей пустой селект → empty-state | P1
120. [Игрок] (playerKinetic.css) | A11y | `kin-sweep` без `prefers-reduced-motion` → добавить guard | P1
121. [Игрок] (PlayerDetail.css:42-48) | Типографика | `.rating-card__value 42px` фикс → `clamp(32px,3vw,42px)` | P1
122. [Игрок] (PlayerDetail.css:73) | Моушн | таб `transition .15s` без явного easing → `cubic-bezier(0.33,0.66,0.66,1)` | P2
123. [Игрок] (playerKinetic.css:31-34) | Моушн | `kin-sweep 8s` рассеивает внимание → 6s/`delay` | P2
124. [Игрок] (playerKinetic.css:29) | Производительность | `blur(30px)` в анимации тормозит мобайл → `will-change` + меньший blur | P2
125. [Игрок] (PlayerDetail.css:42-44) | Цвет | back-hover `rgba(34,211,238,.15)` случайный cyan → `color-mix(brand-primary)` | P2
126. [Игрок] (PlayerDetail.css:287) | A11y | селект матчей: стрелка не меняет цвет на focus → `:focus-visible` ring | P2
127. [Игрок] (PlayerDetail.css:385-394) | Адаптив | радары `1.4fr/1fr` узко на 1024px → перелом раньше | P2
128. [Игрок] (PlayerDetail.css:498) | Адаптив | maps `max-width:340` не на всю ширину на мобиле → `width:100%` | P2
129. [Игрок] (PlayerDetail.css:14-15) | Ритм | `gap:14px` на <480px тесно → `10px` | P2
130. [Игрок] (PlayerTrendCard.css) | Моушн | число last без count-up/tabular → выровнять | P2

## J. Рейтинги / Лидеры / Сравнение (PlayersRating, PlayersLeaders, PlayerCompare + пилюли/бейджи)

131. [Рейтинг] (PlayersRating.jsx:157) | A11y | строка-кнопка без `role/tabindex/Enter`/`aria-label` | P1
132. [Рейтинг] (PlayersRating.css:244-252) | Адаптив | на мобиле скрыты колонки, но grid-шаблон остаётся → переполнение → `display:none` раньше grid | P1
133. [Рейтинг] (PlayersRating.jsx:150) | Состояния | нет skeleton таблицы → добавить | P1
134. [Рейтинг] (PlayersRating.css:162-164) | Контраст | hover строки `rgba(26,75,160,.18)` ≈2.5:1 → `.35` + border-left | P1
135. [Рейтинг] (PlayersRating.css:211-215) | Цвет | `.metric-fill` без цвета (зависит от родителя) → `--metric-color` per-метрика | P1
136. [Рейтинг] (PlayersRating.jsx:116-129) | Формы | кнопка направления сортировки без active-состояния → подсветка asc/desc | P1
137. [Рейтинг] (PlayersRating.css:139/246) | Ритм | gap head(12) ≠ row(8) на мобиле → синхронизировать | P1
138. [Рейтинг] (PlayersRating.css:240-249) | UX | нет hint, что таблица свайпается → теневой индикатор справа | P2
139. [Рейтинг] (PlayersRating.css:199-226) | Типографика | единый `font-display + tabular-nums` для всех value | P1
140. [Лидеры] (PlayersLeaders.jsx:49) | Состояния | при пустом overall блок исчезает → empty-state | P1
141. [Лидеры] (PlayersLeaders.css:124) | Адаптив | 2 кол с gap 12 давятся <360px → `gap:6px` | P2
142. [Сравнение] (PlayerCompare.jsx:69) | Состояния | «нужно ≥2 игрока» — проверить, что класс empty-state применён/виден | P1
143. [Сравнение] (PlayerCompare.css:42) | Адаптив | sparkline шире контейнера на 640px → `width:100%;max-width:200px;margin:auto` | P1
144. [Сравнение] (PlayerCompare.jsx:64) | Контраст | «нет тренда» `--text-faint` → `--text-muted` | P1
145. [Бейджи] (RatingPill.css:15-18) | Контраст | `--empty rgba(255,255,255,.4)` на `.06` ≈2.8:1 → `.65`/фон `.12` | P1
146. [Бейджи] (RatingPill.css) | Цвет | нет классов good/ok/poor (только empty) → добавить шкалу с правильным контрастом текста | P1
147. [Бейджи] (StreakBadge.css:40-43) | Моушн | `streak-pulse scale(1.18)` без easing → `var(--ease-out)`/elastic | P2
148. [Бейджи] (RatingCard.css:41) | Моушн | bar-fill `width .4s` без glow → `box-shadow` при наполнении | P2
149. [Бейджи] (PlayerPhoto.css:4-6) | Цвет | fallback красный градиент → нейтральный индиго, проверить контраст инициалов | P2
150. [Бейджи] (RankDelta/RatingPill) | Типографика | `tabular-nums` на всех числовых бейджах | P2

## K. Календарь (CalendarPage.jsx/.css) — ещё без кинетика

151. [Календарь] (CalendarPage.css) | Визуал | экран отстаёт по полировке от матча/дашборда → создать `calendarKinetic.css` (reveal, glass, hover-lift) | P1
152. [Календарь] (CalendarPage.css:358-364) | A11y | `.cal-month__event` без `:focus-visible` → outline | **P0**
153. [Календарь] (CalendarPage.css:160) | Контраст | `.cal-card__score #22d3ee` на `.06` <4.5:1 → фон `.12` | P1
154. [Календарь] (CalendarPage.css:196-203) | Адаптив | `.calendar-page__head` без flex-wrap на <480px → column/stretch | P1
155. [Календарь] (CalendarPage.css:1,16) | Консистентность | padding/`title 24px` не совпадает с другими экранами (28px) → унифицировать | P1
156. [Календарь] (CalendarPage.css:88) | Типографика | даты/счёт без `tabular-nums` → добавить | P2
157. [Календарь] (CalendarPage.css:90-94) | Моушн | перечисление переходов без явного `ease-out` | P2
158. [Календарь] (CalendarPage) | Моушн | фильтры/кнопки без `:active scale(0.97)` → добавить | P1
159. [Календарь] (CalendarPage.css:298) | Моушн | `--current` статичный glow → hover-усиление + transition | P2
160. [Календарь] (CalendarPage.css:313) | Контраст | hover дня `rgba(255,255,255,.18)` блёкло → `.25` | P2
161. [Календарь] (CalendarPage.css:205-219) | Моушн | roster-btn hover без box-shadow/lift → добавить | P2
162. [Календарь] (CalendarPage.css:189-194) | UX | код подписки без `cursor:pointer;user-select:all` для копирования | P2

## L. Тренировки (TrainingsPage.jsx/.css) — ещё без кинетика

163. [Тренировки] (TrainingsPage.css) | Визуал | отстаёт по полировке → `trainingsKinetic.css` в едином языке | P1
164. [Тренировки] (TrainingsPage.css:258) | A11y | `.tr-att__btn` без `:focus-visible` | **P0**
165. [Тренировки] (TrainingsPage.css:22-30) | Моушн | `.add` без `:active scale(0.97)` → добавить | P1
166. [Тренировки] (TrainingsPage.css:153-165) | Моушн | input focus без transition border → `transition: border-color .12s ease-out` | P1
167. [Тренировки] (TrainingsPage.css:197) | Формы | `:disabled` без `cursor:not-allowed` | P1
168. [Тренировки] (TrainingsPage.css:96-111) | Чистка | `.tr-card__delete !important` → поднять специфичность без `!important` | P2
169. [Тренировки] (TrainingsPage.css:66-76) | Моушн | hover карты без shadow/lift → добавить | P2
170. [Тренировки] (TrainingsPage.css:35-51) | Контраст | активный фильтр border `.12` → `.5` (как в календаре) | P2

## M. Нагрузка (LoadControl.jsx/.css)

171. [Нагрузка] (LoadControl.css:44-47) | Адаптив | на <768px скрыта 4-я колонка, но grid-шаблон не перестроен → пересобрать columns | P1
172. [Нагрузка] (LoadControl.css) | Типографика | значения в шапке без `tabular-nums` → добавить | P2
173. [Нагрузка] (LoadControl.css:26-40) | UX | строки без hover-состояния → лёгкая подсветка | P2
174. [Нагрузка] (LoadControl.css:33) | Цвет | градиент fill из близких primary/secondary → развести стопы для читаемости | P2
175. [Нагрузка] (LoadControl) | Состояния | empty/loading состояния таблицы | P2

## N. Админка (routes/admin/AdminLayout.css + страницы)

176. [Админка] (AdminLayout.css:170/229) | Моушн | разные длительности (100/150/200ms) → унифицировать `120-150ms ease-out` | P1
177. [Админка] (AdminLayout.css:76) | Моушн | `.admin-sidebar__link` без `:active scale(0.98)` | P2
178. [Админка] (AdminLayout.css:82-86) | Материал | активный пункт без inner-glow → `inset box-shadow` | P2
179. [Админка] (AdminLayout.css:185) | UX | `.admin-stat-card` без hover → лёгкая подсветка границы | P2
180. [Админка] (AdminLayout.css:240-245) | A11y | декоративный `::before` карточки → `aria-hidden` на карту в JSX | P1
181. [Админка] (admin) | Состояния | проверить skeleton/empty/error на списках тенантов | P1

## O. Публичные страницы и лендинги (PublicLanding, ClubLanding, AvandataLanding, ClubPage, PublicTeamSchedule, LeagueFixture)

182. [Лендинг] (AvandataLanding.css:283-304) | Контраст | hover-карты border `.3` на `#07071c` едва видно → `.5-.6` | P1
183. [Лендинг] (AvandataLanding.css:156-164) | Типографика | hero-title без `-webkit-font-smoothing:antialiased` → fuzzy на macOS | P1
184. [Лендинг] (AvandataLanding.css:201-205) | Моушн | CTA `translateY(-2px) scale(1.02)` двойной трансформ → оставить один | P2
185. [Лендинг] (AvandataLanding.css:148-152) | A11y | `av-pulse` без `prefers-reduced-motion` | P1
186. [Лендинг] (AvandataLanding.css:10-14) | Производительность | gradient-blobs без `will-change:transform` | P1
187. [Лендинг] (ClubPage.css:32) | Типографика | hero `line-height:1.05` тесно для 34px → `1.1-1.15` | P1
188. [Лендинг] (ClubPage.css:71) | Контраст | active-tab текст `#0e0e2a` на cyan-градиенте → проверить AA | P1
189. [Публичное] (PublicTeamSchedule.css:251) | Моушн | разные длительности 180/160ms → унифицировать 160ms | P1
190. [Публичное] (PublicTeamSchedule.css:516-527) | Цвет | бейджи типов хардкод red/green → токены `:root` | P2
191. [Публичное] (PublicTeamSchedule.css:484-506) | Консистентность | `opacity:.78` магическое число → токен `--opacity-muted` | P2
192. [Лендинг] (LeagueFixture.css:127-142) | Моушн | текущий тур без fade-in при скролле → `whileInView`/reveal | P2
193. [Лендинг] (PublicLanding.css:44-52) | Типографика | подзаголовок может ломаться на длинных словах → `max-width`/balance | P2

## P. Общие компоненты (Toast, Tabs, Skeleton, EmptyState, modals, баннеры, бейджи)

194. [EmptyState] (EmptyState.css:13-17) | Анти-слоп | эмодзи-иконка → SVG из UiIcon; dashed-border `.08`→`.15` | P1
195. [Tabs] (Tabs.css:30) | Системность | `var(--brand-gradient)` без fallback → определить токен/фоллбэк (иначе невидимая вкладка); рассмотреть clip-path цветопереход | P1
196. [Toast] (Toast.css:37,65-67) | A11y | hover `translateY(-1px)` не погашен в reduce → добавить; проверить swipe-to-dismiss + стек-наложение | P1
197. [Модалки] (CallupRoster.jsx:360 / ChangePassword / AddTeam / Standings) | A11y | нет `role="dialog" aria-modal aria-labelledby` + focus-trap + ESC/клик-вне | **P0**
198. [Модалки] (ChangePasswordModal.css:45 / CoachCommentForm:40 / AttendanceBlock:36) | Моушн | focus инпутов/периодов без `transition: border-color .12s ease-out` | P1
199. [Баннеры/бейджи] (ImpersonationBanner.css:8 / DataQualityBadge.css:16) | Цвет/контраст | тёмно-жёлтый градиент — проверить AA; CSS-переменные badge без fallback → невидимость при отсутствии токена | P1
200. [Push/прочее] (PushOptInButton.css:16,22 / PushPrePrompt.css:162) | Моушн/A11y | `ease`→`ease-out`, `scale(0.95)`→`0.97`, дополнить `prefers-reduced-motion` для кнопок | P2

---

## Сводка по приоритетам

- **P0 (баги/доступность, чинить первыми):** #6, #18, #152, #164, #197 — autofill белые поля, HTTP-код на логине, focus-visible в календаре/тренировках, ARIA-диалоги модалок.
- **P1 (~70):** контраст WCAG AA (delta-бейджи, hover-строки, cyan на тёмном), невидимый `clip:text`, отсутствие skeleton/empty/error, ARIA на кликабельных строках, кинетик для Календаря/Тренировок, унификация токенов/радиусов/длительностей.
- **P2 (~120):** микро-моушн (`ease-out`, `:active scale`, count-up в reduce), адаптив <480px, замена эмодзи на SVG, «вау»-слой (glass-глубина, reveal, spring-hover).

## Рекомендованный порядок работ (по экранам, «100/100 прежде перехода»)
1. Сквозные P0 (autofill, focus-visible, ARIA-модалки, маппинг ошибок логина).
2. Логин → 100/100 (первый экран).
3. Глобальные токены (контраст-варианты, единый акцент, моушн-токены, hover-media) — фундамент для остального.
4. Дашборд → Матч → Игрок (ядро ценности) по очереди.
5. Рейтинги/Лидеры/Сравнение.
6. Календарь + Тренировки (подтянуть кинетик до уровня ядра).
7. Нагрузка, Админка.
8. Публичные лендинги + общие компоненты (Toast/Tabs/Skeleton/EmptyState).

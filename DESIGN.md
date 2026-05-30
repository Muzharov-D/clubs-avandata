# Design System — Clubs · Avandata

Тёмная спортивная аналитика. Всё на CSS-переменных (`frontend/src/styles/index.css`).
Register: **product** (дашборды/инструмент). Пицца игрока (`PizzaChart`) —
защищённый компонент, не менять без явного запроса.

## Tokens (`:root` в `styles/index.css`)

### Бренд (white-label — переопределяется из `tenants.brand`)
- `--brand-primary` `#2563eb` · `--brand-primary-hover` `#1d4ed8` · `--brand-secondary` `#1e40af`
- `--brand-accent` `#22c55e`
- `--brand-gradient` `linear-gradient(135deg,#1a4ba0,#2c66c7)` — акцентный градиент (чипы/активные табы)
- `--accent-cyan` `#22d3ee` — счётные метрики, маркеры, «вторая половина»
- `--ink-on-bright` `#06283d` — тёмный текст на ярких заливках (cyan/жёлтый)

### Поверхности и текст
- `--bg-page` `#0f1115` · `--bg-surface` `#16191f` · `--bg-surface-2` `#1c2028` · `--border` `#2a2f38`
- `--text` `#f1f5fb` · `--text-muted` `#94a3b8` · `--text-faint` `#64748b`
- статусы: `--danger` `#ef4444` · `--success` `#22c55e` · `--warning` `#f59e0b`

### Шкала рейтинга (семантическая, НЕ бренд)
`--rating-excellent` `#2e7d32` → `--rating-good` `#7cb342` → `--rating-ok` `#fbc02d`
→ `--rating-weak` `#fb8c00` → `--rating-poor` `#d32f2f` · `--rating-none` `#888`
(+ `--rating-text-dark/-light`). Доступ через `utils/colors.js` (`ratingColor`).

### Прочее
- радиусы `--radius` 12 / `--radius-sm` 8 · тень `--shadow`
- шрифт `--font` (system-ui stack, один семейство — product-register)
- мотика: 150–500ms, ease-out (`cubic-bezier(.22,1,.36,1)`), без bounce; entrance
  через `transform`/`opacity` (не width/height); всегда
  `@media (prefers-reduced-motion: reduce)`.

## Components
- **Оценки 0–10**: `RatingPill`, `RatingCard`, `PlayerRadar` (Performance Index),
  `PizzaChart` (перцентили — НЕ трогать).
- **Сравнение/счёт**: `StatCompareBar`, `DonutComparisonCard`, `Sparkline` (тренды).
- **Спорт-виз (Opta/StatsBomb-стиль, on-brand SVG/flex)**: `HalfSplitChart`
  (момент по таймам), `SpeedZones` (зоны интенсивности), `RatingBeeswarm`
  (распределение рейтингов), `PassProfile` (направление/длина пасов),
  `SquadHeatmap` (игрок×метрика), `TwoWayScatter` (роли атака/оборона),
  `FormationField` (состав), `DataQualityBadge` (достоверность).
- **Структура**: `.card`, `.page-section-title`, `SidebarNav`, `AppHeader`,
  `ImpersonationBanner`, `EmptyState`, `Skeleton`, `Toast`.

## Patterns
- Карточка (`.card`) как базовый контейнер; вложенных карточек избегаем.
- Таблицы: sticky-заголовок/имя, горизонтальный скролл на мобайле; цветовая
  заливка ячеек для скана (`SquadHeatmap`).
- Цвет статуса всегда дублируется символом/числом (дальтоник-френдли).
- Необратимое — через подтверждение; экспорт CSV / печать PDF.
- Деградация: блок не показываем, если данных нет (а не пустой/мусорный).

## Voice
Русский, краткий, тренерский. Глагол+объект в кнопках («Сохранить», «Войти в
клуб»). Числа — `tabular-nums`. Без маркетинговых клише и em-dash.

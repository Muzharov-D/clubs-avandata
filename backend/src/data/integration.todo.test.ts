import { test } from 'node:test';

/**
 * Integration-тир (требует РЕАЛЬНОЙ тест-БД: DATABASE_URL на пустую Postgres +
 * фабрики tenant/team/player/match). Помечен todo — каркас сценариев из test-design.
 * Логику уже покрывает юнит-слой без БД:
 *   - формула минут → participationMath.test.ts
 *   - агрегат карты потерь → lossMapMath.test.ts
 *   - правила авторизации (R-002/R-004) → auth/scope.test.ts
 *   - парсер онбординга → onboardParse.test.ts
 * Эти todo реализуются, когда появится тест-БД (отдельный заход по инфре).
 */
const DB = { todo: 'требует тест-БД (DATABASE_URL) + фабрики' };

// R-003 — изоляция тенантов
test('onboard/participation/loss-map не читают и не пишут данные чужого tenant', DB, () => {});
test('/club/loss-map клуба A не содержит игроков клуба B', DB, () => {});

// R-002 — team_coach scoping (E2E поверх predicate-юнитов)
test('team_coach: 403/NotFound при правке матча/тренировки/состава ЧУЖОЙ команды', DB, () => {});
test('head_coach правит любую команду клуба; спортдиректор — 403 на запись', DB, () => {});

// R-004 — гейт клубной аналитики
test('/club/loss-map: игрок и team_coach → 403; head_coach/директор → 200', DB, () => {});

// R-006 — идемпотентность
test('onboardClub дважды → то же состояние (UPSERT, без дублей)', DB, () => {});

// R-008 — participation FK + сохранность SportVisor
test('participation пишет match_players только для игроков ростера; не трогает SportVisor ratings', DB, () => {});
test('loss-map считает только по FFSPB-матчам (meta.lengthMin), игнорирует SportVisor-загрузки', DB, () => {});

// R-007 — частичный сбой онбординга
test('onboardClub: сбой одной команды не валит остальные (per-team try/catch)', DB, () => {});

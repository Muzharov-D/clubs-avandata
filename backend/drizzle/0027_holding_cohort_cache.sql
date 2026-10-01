-- =============================================================================
-- 0027 Кэш показателей когорт (события всех команд года рождения, минуты игроков).
--
-- Сборка когорты — сотни страниц событий AvanData, 3–5 минут на год. Без кэша после
-- каждого деплоя/перезапуска кабинет холдинга минутами показывал «считаем…». Теперь
-- последняя сборка лежит здесь: при старте поднимается мгновенно (пусть и слегка
-- устаревшая), свежая пересобирается фоном. Одна строка на (сезон, год рождения).
-- Доступ только через bypass-контекст. Идемпотентно (migrate.ts на деплое).
-- =============================================================================

CREATE TABLE IF NOT EXISTS holding_cohort_cache (
  season      integer NOT NULL,
  birth_year  integer NOT NULL,
  payload     jsonb NOT NULL,
  built_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, birth_year)
);

ALTER TABLE holding_cohort_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_cohort_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS holding_bypass_only ON holding_cohort_cache;
CREATE POLICY holding_bypass_only ON holding_cohort_cache
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- Последние профиль и аналитика холдинга: после деплоя брифинг открывается сразу
-- из сохранённого состояния, свежее собирается фоном. kind: profile | analytics.
CREATE TABLE IF NOT EXISTS holding_profile_cache (
  holding_slug text NOT NULL,
  season       integer NOT NULL,
  kind         text NOT NULL,
  payload      jsonb NOT NULL,
  built_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (holding_slug, season, kind)
);
ALTER TABLE holding_profile_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_profile_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS holding_bypass_only ON holding_profile_cache;
CREATE POLICY holding_bypass_only ON holding_profile_cache
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

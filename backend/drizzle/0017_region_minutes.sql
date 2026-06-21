-- =============================================================================
-- 0017 Карта возможностей региона — region_minutes.
--
-- region_minutes — месячные срезы ИГРОВОГО ВРЕМЕНИ Первенства (когорты 2009–2016)
-- по протоколам FFSPB: кто не выходит ни разу / погребён на лавке + двойной штраф
-- поздно-рождённых (регион-wide, НЕ tenant-scoped). INSERT-only история; эндпоинт
-- minutes отдаёт ПОСЛЕДНИЙ ряд. payload jsonb — оценённые игроки, не выходят/погребённые,
-- медиана времени, распределение по бакетам, медиана+погребённые по кварталам.
--
-- Пишет офлайн-скрипт `npm run sync:region-minutes` (~раз в месяц; живой обход
-- деталей матчей FFSPB тяжёлый и недоступен с Render). Доступ только через
-- bypass-контекст (withBypassRLS). RLS fail-closed (bypass-only) — как region_census.
-- Идемпотентно: авто-применяется migrate.ts на деплое (в транзакции).
-- =============================================================================

CREATE TABLE IF NOT EXISTS region_minutes (
  id              bigserial PRIMARY KEY,
  federation_slug text NOT NULL,
  season          integer NOT NULL,
  payload         jsonb NOT NULL,
  captured_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS region_minutes_lookup_idx
  ON region_minutes (federation_slug, season, captured_at);

-- RLS fail-closed (bypass-only): строки видны только при app.bypass_rls='on'.
ALTER TABLE region_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE region_minutes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS region_minutes_bypass_only ON region_minutes;
CREATE POLICY region_minutes_bypass_only ON region_minutes
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

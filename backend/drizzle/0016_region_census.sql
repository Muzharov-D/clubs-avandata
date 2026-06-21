-- =============================================================================
-- 0016 Перепись региона по «пирамиде лиг» FFSPB — region_census.
--
-- region_census — месячные срезы ВСЕХ лиг региона (Высшая…Четвёртая + прочие),
-- НЕ только клубов-членов (регион-wide, НЕ tenant-scoped). INSERT-only история;
-- эндпоинт region-map отдаёт ПОСЛЕДНИЙ ряд. payload jsonb — per-league агрегаты
-- (команды/клубы/игроки/Q1%/Q4%/перекос) + региональные тоталы.
--
-- Пишет офлайн-скрипт `npm run sync:region-census` (~раз в месяц; живой FFSPB
-- тяжёлый и недоступен с Render). Доступ только через bypass-контекст
-- (withBypassRLS). RLS fail-closed (bypass-only) — как federation_snapshots.
-- Идемпотентно: авто-применяется migrate.ts на деплое (в транзакции).
-- =============================================================================

CREATE TABLE IF NOT EXISTS region_census (
  id              bigserial PRIMARY KEY,
  federation_slug text NOT NULL,
  season          integer NOT NULL,
  payload         jsonb NOT NULL,
  captured_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS region_census_lookup_idx
  ON region_census (federation_slug, season, captured_at);

-- RLS fail-closed (bypass-only): строки видны только при app.bypass_rls='on'.
ALTER TABLE region_census ENABLE ROW LEVEL SECURITY;
ALTER TABLE region_census FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS region_census_bypass_only ON region_census;
CREATE POLICY region_census_bypass_only ON region_census
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

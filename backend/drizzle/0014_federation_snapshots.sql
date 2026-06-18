-- =============================================================================
-- 0014 Снимки состояния когорт федерации — основа «недельного радара» (Фаза B).
--
-- federation_snapshots — недельные срезы Первенства (регион-wide, НЕ tenant-scoped).
-- INSERT-only история; diff последних двух снимков → «За неделю» (Фаза C). payload
-- jsonb — компактная таблица всех дивизионов когорты + рейтинг по клубу.
--
-- Доступ только через bypass-контекст (withBypassRLS): крон пишет, федерация читает.
-- RLS fail-closed (bypass-only) — как federations/federation_tenants. Идемпотентно:
-- авто-применяется migrate.ts на деплое (в транзакции).
-- =============================================================================

CREATE TABLE IF NOT EXISTS federation_snapshots (
  id          bigserial PRIMARY KEY,
  season      integer NOT NULL,
  birth_year  integer NOT NULL,
  payload     jsonb NOT NULL,
  captured_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fed_snapshot_lookup_idx
  ON federation_snapshots (season, birth_year, captured_at);

-- RLS fail-closed (bypass-only): строки видны только при app.bypass_rls='on'.
ALTER TABLE federation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE federation_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS federation_bypass_only ON federation_snapshots;
CREATE POLICY federation_bypass_only ON federation_snapshots
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

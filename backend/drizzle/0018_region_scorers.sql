-- =============================================================================
-- 0018 Бомбардиры региона — region_scorers.
--
-- region_scorers — месячные срезы ГОЛОВ Первенства (когорты 2009–2016) по
-- протоколам матчей FFSPB: events[] деталей матча, гол (eventType 0) + пенальти
-- (eventType 2) кредитуются автору, автоголы (eventType 1) исключены (регион-wide,
-- НЕ tenant-scoped). INSERT-only история; эндпоинт region-scorers отдаёт ПОСЛЕДНИЙ
-- ряд. payload jsonb — сколько матчей просканировано + топ-15 бомбардиров (имя,
-- клуб, эмблема, год рождения когорты, голы); ассисты в протоколах не заполнены.
--
-- Пишет офлайн-скрипт `npm run sync:region-scorers` (~раз в месяц; живой обход
-- деталей матчей FFSPB тяжёлый и недоступен с Render). Доступ только через
-- bypass-контекст (withBypassRLS). RLS fail-closed (bypass-only) — как region_minutes.
-- Идемпотентно: авто-применяется migrate.ts на деплое (в транзакции).
-- =============================================================================

CREATE TABLE IF NOT EXISTS region_scorers (
  id              bigserial PRIMARY KEY,
  federation_slug text NOT NULL,
  season          integer NOT NULL,
  payload         jsonb NOT NULL,
  captured_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS region_scorers_lookup_idx
  ON region_scorers (federation_slug, season, captured_at);

-- RLS fail-closed (bypass-only): строки видны только при app.bypass_rls='on'.
ALTER TABLE region_scorers ENABLE ROW LEVEL SECURITY;
ALTER TABLE region_scorers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS region_scorers_bypass_only ON region_scorers;
CREATE POLICY region_scorers_bypass_only ON region_scorers
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

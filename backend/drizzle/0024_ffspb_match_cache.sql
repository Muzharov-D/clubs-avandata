-- =============================================================================
-- 0024 Кэш протоколов ФФСПб по турнирам — ffspb_match_cache.
--
-- Официальный API ФФСПб медленный и нестабильный (страницы по 10 матчей, до минуты на
-- ответ), поэтому список матчей турнира держим у себя: одна полная загрузка, дальше —
-- только матчи последних недель (date[gte]) поверх кэша. Переживает рестарты Render:
-- холодный старт читает отсюда, а не тянет 17 страниц заново. Регион-wide, НЕ
-- tenant-scoped; доступ через bypass-контекст (withBypassRLS), RLS fail-closed —
-- как federation_snapshots. Идемпотентно: авто-применяется migrate.ts на деплое.
-- =============================================================================

-- next_page: следующая страница незавершённой полной загрузки (NULL = список полный).
-- ФФСПб отдаёт каждую новую страницу по 2–3 минуты, поэтому прогресс хранится постраничнo
-- и переживает рестарт; пока next_page не NULL — список не используется (таблица была бы неполной).
CREATE TABLE IF NOT EXISTS ffspb_match_cache (
  tournament_id integer PRIMARY KEY,
  matches       jsonb NOT NULL,
  next_page     integer,
  full_at       timestamptz,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ffspb_match_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ffspb_match_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ffspb_match_cache_bypass_only ON ffspb_match_cache;
CREATE POLICY ffspb_match_cache_bypass_only ON ffspb_match_cache
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- =============================================================================
-- 0028 Логотипы клубов — у нас в базе.
--
-- Логотипы команд лежат на внешних хранилищах (s3.twcstorage.ru, img.nagradion.ru) и
-- грузились с задержкой. Теперь каждый логотип скачивается один раз и отдаётся с нашего
-- сервера (/api/v1/public/logo?u=…) с вечным кэшем браузера. Ключ — исходный адрес
-- (в имени файла хранилища есть метка времени, поэтому новая версия = новый адрес).
-- Доступ только через bypass-контекст. Идемпотентно.
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_logos (
  url          text PRIMARY KEY,
  content_type text NOT NULL,
  bytes        bytea NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_logos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_logos_bypass_only ON club_logos;
CREATE POLICY club_logos_bypass_only ON club_logos
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

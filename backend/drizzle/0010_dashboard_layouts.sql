-- =============================================================================
-- 0010 Dashboard constructor — per-user видимость блоков/графиков по страницам.
--
-- Тренер скрывает/показывает любой блок или график на каждой странице; выбор
-- хранится per-user (синхронизация между устройствами/браузерами). Одна строка
-- на пользователя, весь конфиг в JSONB `layout`:
--   { "<pageId>": { "<blockId>": false } }   (false = скрыто; отсутствие = видимо)
--
-- tenant_id = tenants.slug (как во всех tenant-scoped таблицах). FORCE RLS +
-- политика tenant_isolation — копия 0007 (defense-in-depth). Роуты и так строго
-- фильтруют по user_id и ходят через withTenant.
-- Идемпотентно: авто-применяется migrate.ts на деплое.
-- =============================================================================

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id          bigserial PRIMARY KEY,
  tenant_id   text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layout      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- ENABLE/FORCE/CREATE POLICY — идемпотентны и выполняются безусловно (таблица
-- гарантированно есть после CREATE IF NOT EXISTS в той же транзакции миграции).
-- Без DO-guard: чтобы RLS никогда не «проскочил» при будущей правке файла.
ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_layouts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dashboard_layouts;
CREATE POLICY tenant_isolation ON dashboard_layouts
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  );

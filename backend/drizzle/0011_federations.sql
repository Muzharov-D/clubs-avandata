-- =============================================================================
-- 0011 Федерации — слой регулятора над клубами-тенантами.
--
-- federations        — региональная федерация (ФФСПб и т.п.); slug = id.
-- federation_tenants — членство клуба в федерации (M:N): tier full|listed.
--
-- Это НЕ tenant-scoped таблицы (нет app.tenant_id), как tenants. Доступ только
-- через bypass-контекст: platform_admin (withBypassRLS) создаёт/правит; федерация
-- (withFederation, ставит app.bypass_rls='on') читает. Политика fail-closed:
-- без bypass — 0 строк. Изоляция региона держится на app-фильтре членства
-- (FED_MEMBERSHIP_SQL) в федеративных запросах; RLS здесь — defense-in-depth.
-- Идемпотентно: авто-применяется migrate.ts на деплое (в транзакции).
-- =============================================================================

CREATE TABLE IF NOT EXISTS federations (
  slug         text PRIMARY KEY,
  name         text NOT NULL,
  region       text NOT NULL,
  parent_body  text,
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  brand        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS federation_tenants (
  federation_slug  text NOT NULL REFERENCES federations(slug) ON DELETE CASCADE,
  tenant_slug      text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  tier             text NOT NULL DEFAULT 'full',
  joined_at        timestamptz DEFAULT now(),
  PRIMARY KEY (federation_slug, tenant_slug),
  CONSTRAINT federation_tenants_tier_chk CHECK (tier IN ('full','listed'))
);

CREATE INDEX IF NOT EXISTS federation_tenants_lookup_idx
  ON federation_tenants (federation_slug, tier);

-- RLS fail-closed (bypass-only): строки видны только при app.bypass_rls='on'.
-- ENABLE/FORCE/POLICY идемпотентны и выполняются безусловно (таблицы есть после
-- CREATE IF NOT EXISTS в той же транзакции миграции). Без DO-guard — чтобы RLS
-- никогда не «проскочил» при будущей правке файла.
ALTER TABLE federations ENABLE ROW LEVEL SECURITY;
ALTER TABLE federations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS federation_bypass_only ON federations;
CREATE POLICY federation_bypass_only ON federations
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE federation_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE federation_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS federation_bypass_only ON federation_tenants;
CREATE POLICY federation_bypass_only ON federation_tenants
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

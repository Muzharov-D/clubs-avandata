-- =============================================================================
-- 0012 Роль federation_admin — региональный регулятор (read-only, region-scoped).
--
-- Расширяем users: новая роль в CHECK, связь с федерацией (federation_slug),
-- и правило «нет клуба» теперь и для federation_admin (как у platform_admin —
-- federation_admin scoped в федерацию, а не в клуб → tenant_id NULL).
--
-- DROP CONSTRAINT IF EXISTS + ADD — re-runnable (как DROP POLICY + CREATE в 0010).
-- ADD COLUMN IF NOT EXISTS — идемпотентно. federations создана в 0011 (раньше).
-- users НЕ под FORCE RLS (см. 0007) — изменение безопасно для auth-флоу.
-- Существующие строки проходят оба новых CHECK (роль-набор расширен; для клубных
-- ролей tenant_id NOT NULL, для platform_admin NULL — инвариант сохранён).
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_chk;
ALTER TABLE users ADD CONSTRAINT users_role_chk
  CHECK (role IN ('platform_admin','head_coach','team_coach','player','federation_admin'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_admin_no_tenant;
ALTER TABLE users ADD CONSTRAINT users_platform_admin_no_tenant
  CHECK ((role IN ('platform_admin','federation_admin')) = (tenant_id IS NULL));

ALTER TABLE users ADD COLUMN IF NOT EXISTS federation_slug text
  REFERENCES federations(slug) ON DELETE SET NULL;

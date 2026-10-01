-- =============================================================================
-- 0025 Роль holding_admin — руководство холдинга (группы школ одного бренда).
--
-- Отдельный кабинет /holding: read-only аналитика по всем командам холдинга
-- относительно лиги и региона. Пользователь без клуба (tenant_id NULL), как
-- platform_admin/federation_admin; привязан к холдингу через holding_slug
-- (конфиг в backend/src/federation/holdings.ts, FK нет — холдинги в коде).
-- Идемпотентно: авто-применяется migrate.ts на деплое (в транзакции).
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS holding_slug text;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_chk;
ALTER TABLE users ADD CONSTRAINT users_role_chk
  CHECK (role IN ('platform_admin','head_coach','team_coach','player','federation_admin','sporting_director','holding_admin'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_admin_no_tenant;
ALTER TABLE users ADD CONSTRAINT users_platform_admin_no_tenant
  CHECK ((role IN ('platform_admin','federation_admin','holding_admin')) = (tenant_id IS NULL));

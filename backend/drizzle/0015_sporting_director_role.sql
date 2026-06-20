-- =============================================================================
-- 0015 Роль sporting_director (спортивный директор клуба) — клуб-scoped,
-- read-only аналитика по ВСЕМ командам клуба (выжимка как у федерации, но в
-- границах одного tenant). Привязан к tenant_id (как тренеры), teamId = NULL.
--
-- Re-runnable: DROP IF EXISTS + ADD (как 0013). Второй CHECK
-- (users_platform_admin_no_tenant) трогать НЕ нужно — sporting_director не в
-- списке безтенантных ролей, значит обязан иметь tenant_id (что и требуется).
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_chk;
ALTER TABLE users ADD CONSTRAINT users_role_chk
  CHECK (role IN ('platform_admin','head_coach','team_coach','player','federation_admin','sporting_director'));

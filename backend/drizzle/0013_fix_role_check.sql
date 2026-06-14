-- =============================================================================
-- 0013 Чистка legacy role-check (фикс инцидента входа federation_admin).
--
-- Инцидент: federation_admin не вставлялся (users_role_check violation). Причина:
-- исходный CREATE TABLE создал НЕименованный CHECK на role → Postgres дал ему
-- авто-имя `users_role_check` (без federation_admin). Миграция 0012 дропала
-- `users_role_chk` (имя из Drizzle-схемы), которого в БД не было → старый
-- `users_role_check` остался и блокировал новую роль (а рядом добавился второй,
-- правильный, `users_role_chk`).
--
-- Фикс: дропаем legacy `users_role_check`, оставляем единственный канонический
-- `users_role_chk` с federation_admin. Re-runnable (DROP IF EXISTS + ADD).
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_chk;
ALTER TABLE users ADD CONSTRAINT users_role_chk
  CHECK (role IN ('platform_admin','head_coach','team_coach','player','federation_admin'));

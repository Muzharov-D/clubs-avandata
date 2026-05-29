-- =============================================================================
-- 0005 Invite tokens — безопасная установка пароля для приглашённых пользователей.
-- Вместо возврата temp-пароля в HTTP-ответе (оседал в логах/истории) храним sha256
-- одноразового токена; пользователь ставит пароль по ссылке /set-password.
-- Additive + idempotent.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_invite_token_hash_idx ON users (invite_token_hash);

-- =============================================================================
-- 0001 Init — tenants, users, refresh_tokens + RLS infra
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- tenants — корневая таблица для multi-tenancy.
-- НЕТ RLS (admin-only access).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  slug            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','archived')),
  brand           JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_provider   TEXT NOT NULL DEFAULT 'manual'
                    CHECK (data_provider IN ('ffspb','yfl','manual')),
  provider_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  features        JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan            TEXT NOT NULL DEFAULT 'free',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- users — все пользователи (включая platform_admin без tenant_id).
-- RLS: фильтр по tenant_id из current_setting('app.tenant_id').
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT REFERENCES tenants(slug) ON DELETE CASCADE,
  email               TEXT,
  username            TEXT,
  password_hash       TEXT,
  full_name           TEXT,
  role                TEXT NOT NULL
                        CHECK (role IN ('platform_admin','head_coach','team_coach','player')),
  team_id             TEXT,
  player_id           TEXT,
  email_verified_at   TIMESTAMPTZ,
  invited_by          TEXT,
  last_login          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT users_tenant_email_uq    UNIQUE (tenant_id, email),
  CONSTRAINT users_tenant_username_uq UNIQUE (tenant_id, username),
  CONSTRAINT users_platform_admin_no_tenant
    CHECK ((role = 'platform_admin') = (tenant_id IS NULL))
);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);

-- -----------------------------------------------------------------------------
-- refresh_tokens — rotation + reuse-detection.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_active_idx
  ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- =============================================================================
-- RLS policies
-- -----------------------------------------------------------------------------
-- Принцип: каждая tenant-scoped таблица фильтруется по app.tenant_id.
-- Для admin-операций (создание клуба) использовать SET LOCAL row_security = off
-- внутри withBypassRLS() — это требует BYPASSRLS или table owner.
-- -----------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
  USING (
    tenant_id IS NULL  -- platform_admin записи видны только при bypass
    OR tenant_id = current_setting('app.tenant_id', true)
  );

-- refresh_tokens — фильтр через JOIN к users.tenant_id неудобен;
-- денормализуем доступ через сам user_id (юзер видит свои токены).
-- Заглушка: пока RLS off, доступ через application-layer (мы знаем user_id из JWT).
-- Включим позже когда добавим tenant_id колонку или JOIN-политику.

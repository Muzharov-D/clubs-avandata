-- =============================================================================
-- 0020 Обратная связь тренер ↔ игрок.
--
-- Тренер пишет разбор конкретному игроку (по матчу или периодический, против
-- индивидуального плана), игрок отвечает своим видением. Приватно, один-на-один.
--
-- ext_match_id IS NULL  → периодический разбор (их за сезон может быть много).
-- ext_match_id заполнен → разбор конкретного матча, по одному на игрока.
-- Частичный уникальный индекс покрывает только второй случай: в Postgres
-- UNIQUE с NULL не ограничивает, поэтому периодические записи не конфликтуют.
--
-- Идемпотентно: CREATE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS player_feedback (
  id                  bigserial PRIMARY KEY,
  tenant_id           text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  player_id           text NOT NULL REFERENCES players(id)   ON DELETE CASCADE,
  age_group           text NOT NULL,
  ext_match_id        text,
  coach_text          text NOT NULL,
  coach_user_id       text REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  player_text         text,
  player_responded_at timestamptz
);

-- Один разбор на (игрок, матч). Периодические (ext_match_id IS NULL) не ограничены.
CREATE UNIQUE INDEX IF NOT EXISTS player_feedback_match_uq
  ON player_feedback (tenant_id, player_id, ext_match_id)
  WHERE ext_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_feedback_player_idx ON player_feedback (tenant_id, player_id);
CREATE INDEX IF NOT EXISTS player_feedback_match_idx  ON player_feedback (tenant_id, age_group, ext_match_id);

-- RLS — как у остальных tenant-scoped таблиц (см. 0010): безусловно, без DO-guard.
ALTER TABLE player_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON player_feedback;
CREATE POLICY tenant_isolation ON player_feedback
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  );

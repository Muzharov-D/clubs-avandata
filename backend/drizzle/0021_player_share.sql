-- =============================================================================
-- 0021 Что тренер открыл игроку в его кабинете.
--
-- Кабинет игрока показывает НЕ весь профиль, а только те показатели, которые
-- тренер отметил, плюс его разбор (таблица player_feedback, миграция 0020).
-- Строки может не быть — тогда действует умолчание: три главных показателя
-- амплуа, общий индекс скрыт (см. modules/lite/metrics.ts).
--
-- metrics — список ключей осей радара (['shooting','dribbling',...]).
-- Валидируется на сервере против шестёрки амплуа: тренер не может открыть ось,
-- которой сам не видел.
--
-- Идемпотентно: CREATE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS player_share (
  tenant_id    text NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  player_id    text NOT NULL REFERENCES players(id)   ON DELETE CASCADE,
  metrics      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  show_overall boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, player_id)
);

-- RLS — как у остальных tenant-scoped таблиц (см. 0010): безусловно, без DO-guard.
ALTER TABLE player_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_share FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON player_share;
CREATE POLICY tenant_isolation ON player_share
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = current_setting('app.tenant_id', true)
  );

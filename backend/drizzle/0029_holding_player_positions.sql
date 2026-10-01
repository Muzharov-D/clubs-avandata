-- =============================================================================
-- 0029 Кабинет холдинга: дополнительные позиции игрока, которые видит тренер.
--
-- Основная позиция и сыгранные позиции берутся из разметки матчей. Тренер или
-- руководство могут добавить позицию, на которой хотят видеть игрока (например,
-- опорного — в центре защиты): доска комплектования ставит его туда в первую очередь,
-- профиль игрока показывает её рядом с сыгранными.
--
-- Холдинги описаны в коде — FK нет, ключ holding_slug. Доступ только через
-- bypass-контекст (withBypassRLS), фильтр по slug — в роутах. Идемпотентно.
-- =============================================================================

CREATE TABLE IF NOT EXISTS holding_player_positions (
  holding_slug text NOT NULL,
  player_id    integer NOT NULL,
  grp          text NOT NULL,           -- GK | CB | FB | CM | W | ST
  author_id    text NOT NULL,
  author_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (holding_slug, player_id, grp)
);

ALTER TABLE holding_player_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_player_positions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS holding_bypass_only ON holding_player_positions;
CREATE POLICY holding_bypass_only ON holding_player_positions
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

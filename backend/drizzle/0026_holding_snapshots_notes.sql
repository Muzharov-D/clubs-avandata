-- =============================================================================
-- 0026 Кабинет холдинга: недельные снимки решений и заметки руководства.
--
-- holding_snapshots — INSERT-only история: раз в неделю компактный срез решений
-- холдинга (кандидаты по спискам, рейтинги и места игроков, линии команд). Diff
-- текущего состояния против снимка недельной давности → «Что изменилось».
--
-- holding_notes — пометки руководителя по игроку («в молодёжку с января»,
-- «наблюдаем»): решение, дата напоминания, рейтинг/место на момент решения —
-- чтобы показать, как игрок изменился после решения.
--
-- Холдинги описаны в коде (federation/holdings.ts) — FK нет, ключ holding_slug.
-- Доступ только через bypass-контекст (withBypassRLS), фильтр по slug — в роутах.
-- Идемпотентно: авто-применяется migrate.ts на деплое (в транзакции).
-- =============================================================================

CREATE TABLE IF NOT EXISTS holding_snapshots (
  id           bigserial PRIMARY KEY,
  holding_slug text NOT NULL,
  season       integer NOT NULL,
  payload      jsonb NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS holding_snapshot_lookup_idx
  ON holding_snapshots (holding_slug, season, captured_at);

ALTER TABLE holding_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS holding_bypass_only ON holding_snapshots;
CREATE POLICY holding_bypass_only ON holding_snapshots
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

CREATE TABLE IF NOT EXISTS holding_notes (
  id           bigserial PRIMARY KEY,
  holding_slug text NOT NULL,
  player_id    integer NOT NULL,
  player_name  text NOT NULL,
  kind         text NOT NULL,           -- youth | promote | older | watch | keep | other
  text         text NOT NULL DEFAULT '',
  remind_on    date,                    -- когда напомнить (NULL — без напоминания)
  rating_at    integer,                 -- рейтинг игрока на момент решения
  rank_at      integer,                 -- место в регионе своего возраста на момент решения
  size_at      integer,
  author_id    text NOT NULL,
  author_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz              -- решение исполнено/снято
);
CREATE INDEX IF NOT EXISTS holding_notes_player_idx ON holding_notes (holding_slug, player_id);
CREATE INDEX IF NOT EXISTS holding_notes_open_idx ON holding_notes (holding_slug, closed_at);

ALTER TABLE holding_notes DROP CONSTRAINT IF EXISTS holding_notes_kind_chk;
ALTER TABLE holding_notes ADD CONSTRAINT holding_notes_kind_chk
  CHECK (kind IN ('youth','promote','older','watch','keep','other'));

ALTER TABLE holding_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS holding_bypass_only ON holding_notes;
CREATE POLICY holding_bypass_only ON holding_notes
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

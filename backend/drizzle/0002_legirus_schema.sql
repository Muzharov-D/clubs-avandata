-- =============================================================================
-- 0002 Legirus schema — порт всех 12 миграций Легируса в multi-tenant форму.
-- Все таблицы — с tenant_id (replaces legacy club_id) + RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- teams — возрастные группы клуба (2010/2011/...)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id            TEXT PRIMARY KEY,                              -- '{tenant}-{age}', e.g. 'legirus-2010'
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  name          TEXT NOT NULL,                                 -- 'Легирус 2010'
  age_group     TEXT NOT NULL,                                 -- '2010'
  age_label     TEXT,                                          -- 'U-17'
  year          INT,
  head_coach    TEXT,
  is_our_team   BOOLEAN DEFAULT TRUE,
  active        BOOLEAN DEFAULT TRUE,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teams_tenant_idx ON teams(tenant_id);

-- -----------------------------------------------------------------------------
-- players — игроки с поддержкой playing-up (extra_teams)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,                              -- 'ext-{provider}-{nativeId}' or 'manual-{uuid}'
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  number        INT,
  position      TEXT,
  position_full TEXT,
  birth_date    DATE,
  photo_url     TEXT,
  extra_teams   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],       -- для playing-up
  external_ids  JSONB NOT NULL DEFAULT '{}'::jsonb,            -- { ffspb: 12345, yfl: 67890 }
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS players_tenant_team_idx ON players(tenant_id, team_id);

-- Добавляем FK в users (поля уже есть с 0001_init.sql).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_team_fk'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_team_fk
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_player_fk'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_player_fk
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- matches — SportVisor PDF разборы (наши матчи)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id             TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ext_match_id        TEXT,                                    -- ID в external провайдере (FFSPB/YFL)
  home_team_id        TEXT,
  away_team_id        TEXT,
  home_team_name      TEXT,
  away_team_name      TEXT,
  match_date          TIMESTAMPTZ,
  season              TEXT,
  tournament          TEXT DEFAULT 'league',
  score_home          INT,
  score_away          INT,
  pdf_source          TEXT,
  uploaded_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at         TIMESTAMPTZ DEFAULT NOW(),
  team_summary_stats  JSONB,
  team_aggregates     JSONB,
  team_avg_ratings    JSONB,
  meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT matches_tenant_ext_uq UNIQUE (tenant_id, ext_match_id)
);
CREATE INDEX IF NOT EXISTS matches_team_idx       ON matches(team_id);
CREATE INDEX IF NOT EXISTS matches_date_idx       ON matches(match_date DESC);
CREATE INDEX IF NOT EXISTS matches_tournament_idx ON matches(tournament);

-- -----------------------------------------------------------------------------
-- match_players — статистика игрока в конкретном матче (SportVisor)
-- tenant_id денормализован для прямой RLS-фильтрации без JOIN.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_players (
  match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  number        INT,
  position      TEXT,
  position_full TEXT,
  minutes       INT,
  ratings       JSONB,
  stats         JSONB,
  splits        JSONB,
  radar         JSONB,
  maps          JSONB,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS match_players_player_idx ON match_players(player_id);
CREATE INDEX IF NOT EXISTS match_players_tenant_idx ON match_players(tenant_id);

-- -----------------------------------------------------------------------------
-- calendar — FFSPB календарь (наши + чужие матчи подгруппы)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group           TEXT NOT NULL,
  season              TEXT NOT NULL,
  ext_match_id        TEXT,
  match_date          TIMESTAMPTZ,
  home_team           TEXT,
  away_team           TEXT,
  ext_home_team_id    TEXT,
  ext_away_team_id    TEXT,
  score_home          INT,
  score_away          INT,
  is_our_match        BOOLEAN DEFAULT FALSE,
  venue               TEXT,
  group_name          TEXT,
  round               TEXT,
  source_url          TEXT,
  tournament          TEXT DEFAULT 'league',
  home_shield         TEXT,
  away_shield         TEXT,
  events_data         JSONB,                                  -- ход матча (goals/cards/subs)
  events_fetched_at   TIMESTAMPTZ,
  lineups_data        JSONB,                                  -- составы
  lineups_fetched_at  TIMESTAMPTZ,
  coach_comment       TEXT,
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT calendar_tenant_age_ext_uq UNIQUE (tenant_id, age_group, ext_match_id)
);
CREATE INDEX IF NOT EXISTS calendar_lookup_idx ON calendar(tenant_id, age_group, match_date);

CREATE TABLE IF NOT EXISTS calendar_meta (
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT,
  title         TEXT,
  parser_hint   TEXT,
  sources       JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, age_group)
);

-- -----------------------------------------------------------------------------
-- standings — снимки турнирной таблицы (rolling-update)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS standings (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT NOT NULL,
  league_name   TEXT,
  source_url    TEXT,
  table_data    JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS standings_lookup_idx
  ON standings(tenant_id, age_group, season, fetched_at DESC);

-- -----------------------------------------------------------------------------
-- cup_brackets — кубковые сетки (JSONB)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cup_brackets (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT NOT NULL,
  cup_name      TEXT,
  source_url    TEXT,
  rounds_data   JSONB NOT NULL,
  parse_hint    TEXT,
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cup_lookup_idx
  ON cup_brackets(tenant_id, age_group, season, fetched_at DESC);

-- -----------------------------------------------------------------------------
-- trainings + attendance + templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  duration_min  INT NOT NULL DEFAULT 90,
  venue_id      TEXT,
  venue_text    TEXT,
  type          TEXT NOT NULL DEFAULT 'training'
                  CHECK (type IN ('training','extra','warmup','recovery','meet')),
  notes         TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trainings_team_date_idx ON trainings(team_id, starts_at);

CREATE TABLE IF NOT EXISTS training_attendance (
  training_id      UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  player_id        TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tenant_id        TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  response_status  TEXT CHECK (response_status IN ('going','not_going')),
  response_at      TIMESTAMPTZ,
  presence_status  TEXT CHECK (presence_status IN ('present','late','excused','absent')),
  presence_at      TIMESTAMPTZ,
  marked_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  note             TEXT,
  PRIMARY KEY (training_id, player_id)
);
CREATE INDEX IF NOT EXISTS training_attendance_player_idx ON training_attendance(player_id);
CREATE INDEX IF NOT EXISTS training_attendance_tenant_idx ON training_attendance(tenant_id);

CREATE TABLE IF NOT EXISTS training_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name          TEXT,
  weekdays      INT[] NOT NULL,                                -- 0..6
  start_time    TIME NOT NULL,
  duration_min  INT NOT NULL DEFAULT 90,
  venue_id      TEXT,
  venue_text    TEXT,
  notes         TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS training_templates_team_idx ON training_templates(team_id);

-- -----------------------------------------------------------------------------
-- match_callups — вызовы на матч (привязка к FFSPB ext_match_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_callups (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  ext_match_id  TEXT NOT NULL,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','called','confirmed','declined','excused')),
  note          TEXT,
  called_at     TIMESTAMPTZ DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT match_callups_uq UNIQUE (tenant_id, age_group, ext_match_id, player_id)
);
CREATE INDEX IF NOT EXISTS match_callups_match_idx
  ON match_callups(tenant_id, age_group, ext_match_id);
CREATE INDEX IF NOT EXISTS match_callups_player_idx ON match_callups(player_id);
CREATE INDEX IF NOT EXISTS match_callups_status_idx
  ON match_callups(status) WHERE status IN ('pending','called');

-- -----------------------------------------------------------------------------
-- push_subscriptions + notif_log + notif_deferred + notif_recipient_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  team_id       TEXT REFERENCES teams(id) ON DELETE CASCADE,
  role          TEXT,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  prefs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  team_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,            -- multi-team подписки
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subs_user_idx     ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subs_team_idx     ON push_subscriptions(team_id);
CREATE INDEX IF NOT EXISTS push_subs_team_ids_idx ON push_subscriptions USING gin (team_ids);

CREATE TABLE IF NOT EXISTS notif_log (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  scope         TEXT NOT NULL,                                 -- 'callup-reminder-24h'
  scope_id      TEXT NOT NULL,                                 -- match ext_id
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notif_log_uq UNIQUE (tenant_id, scope, scope_id)
);
CREATE INDEX IF NOT EXISTS notif_log_lookup_idx ON notif_log(tenant_id, scope, scope_id);

CREATE TABLE IF NOT EXISTS notif_deferred (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  scope         TEXT NOT NULL,
  scope_id      TEXT NOT NULL,
  team_id       TEXT,
  payload       JSONB NOT NULL,
  deliver_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT notif_deferred_uq UNIQUE (tenant_id, scope, scope_id)
);
CREATE INDEX IF NOT EXISTS notif_deferred_deliver_idx ON notif_deferred(deliver_at);

CREATE TABLE IF NOT EXISTS notif_recipient_log (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  scope         TEXT NOT NULL,
  scope_id      TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notif_recipient_idx
  ON notif_recipient_log(tenant_id, endpoint, sent_at DESC);

-- =============================================================================
-- RLS policies — все tenant-scoped таблицы.
-- Платформенный admin обходит через withBypassRLS (SET LOCAL row_security = off).
-- =============================================================================

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'teams','players','matches','match_players','calendar','calendar_meta',
    'standings','cup_brackets','trainings','training_attendance','training_templates',
    'match_callups','push_subscriptions','notif_log','notif_deferred','notif_recipient_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true))',
      t, t
    );
  END LOOP;
END $$;

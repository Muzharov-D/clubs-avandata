-- Phase 1–5 features (idempotent, авто-применяется migrate.ts при деплое).
--
-- 1. matches.coach_note    — заметка тренера к загруженному разбору (Phase 3).
-- 2. players.data_consent  — флаг согласия на обработку ПД ребёнка (Phase 4, приватность).
-- 3. matches.data_quality  — снапшот достоверности данных матча на момент загрузки
--                            (Phase 1, индикатор доверия; вычисляется и на лету,
--                            но кешируем чтобы не пересчитывать на каждый GET).

ALTER TABLE matches  ADD COLUMN IF NOT EXISTS coach_note   text;
ALTER TABLE matches  ADD COLUMN IF NOT EXISTS data_quality jsonb;
ALTER TABLE players  ADD COLUMN IF NOT EXISTS data_consent boolean NOT NULL DEFAULT false;

-- Индекс под тренды/сезонные агрегаты: match_players по (tenant, player) уже есть,
-- добавляем по matches(tenant, team, date) для быстрого ORDER BY в /players/season.
CREATE INDEX IF NOT EXISTS matches_tenant_team_date_idx
  ON matches (tenant_id, team_id, match_date DESC);

// === LEGIRUS REFERENCE (verbatim) — backend/services/dataRepo.js ===
// ГЛАВНОЕ для задачи #4 (баг «дом/гость»):
//   1. loadMatch/loadMatchesIndex отдают home_team_id/away_team_id (ID, не имена) —
//      Avandata API этого НЕ делает, отсюда includes()-эвристика на фронте.
//   2. loadCalendar: LEFT JOIN статы матча ТОЛЬКО для наших матчей через
//      `ON c.is_our_match = TRUE` + age_group + МСК-дата. Комментарий внутри
//      описывает реальный инцидент (наша статистика прилипала к чужой паре).
// При порте: убрать file-based fallback (isPgEnabled / legacy.*), club_id='legirus' → tenant_id.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPgEnabled, query } from '../db/pool.js';
import * as legacy from './dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Кешированная мапа «имя клуба → URL щита» из club-shields.json.
// Файл правится руками очень редко, так что подгружаем один раз при старте.
let _shieldsByName = null;
function getClubShields() {
  if (_shieldsByName) return _shieldsByName;
  const map = new Map();
  try {
    const p = path.resolve(__dirname, '..', 'data', 'club-shields.json');
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      for (const c of (raw.clubs || [])) {
        if (c.name && c.shield) {
          map.set(nrm(c.name), c.shield);
        }
      }
    }
  } catch (e) { console.error('[shields] load failed:', e.message); }
  _shieldsByName = map;
  return map;
}
function nrm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Резолв щита по имени клуба. Сначала точное совпадение, потом startsWith
// (для имён вида «Пороховчанин 2010» при наличии «Пороховчанин-Тосно» в config).
function resolveShield(teamName) {
  if (!teamName) return null;
  const shields = getClubShields();
  const key = nrm(teamName);
  if (shields.has(key)) return shields.get(key);
  // Match by substring: "Пороховчанин 2010" → "Пороховчанин-Тосно" если 2 слова совпали
  for (const [name, url] of shields) {
    const first = name.split(/[\s-]/)[0];
    if (first.length >= 4 && key.includes(first)) return url;
  }
  return null;
}

// === TEAMS ===
export async function loadTeams() {
  if (!isPgEnabled()) return legacy.loadTeams();

  const cl = await query(`SELECT id, name, display_name, meta FROM clubs WHERE id = 'legirus'`);
  const clubRow = cl.rows[0] || {};
  const club = {
    id: clubRow.id || 'legirus',
    name: clubRow.name || 'Легирус',
    logo: clubRow.meta?.logo || '/assets/logos/legirus.png',
  };

  const r = await query(`
    SELECT id, club_id AS "clubId", name, age_group AS "ageGroupRaw", year,
           head_coach AS "headCoach", is_our_team AS "isOurTeam", active, meta
    FROM teams WHERE club_id = 'legirus' ORDER BY year NULLS LAST, name`);

  const teams = r.rows.map((t) => {
    const meta = t.meta || {};
    return {
      id: t.id,
      clubId: t.clubId,
      name: t.name,
      shortName: meta.shortName || t.name,
      ageGroup: meta.ageGroupLabel || t.ageGroupRaw, // "U-17" если есть, иначе "2010"
      year: t.year,
      yearGroup: meta.yearGroup || t.year,
      headCoach: t.headCoach,
      isOurTeam: t.isOurTeam,
      active: t.active,
      logo: meta.logo || null,
      colors: meta.colors || null,
    };
  });
  return { club, teams };
}

// === PLAYERS ===
export async function loadPlayers() {
  if (!isPgEnabled()) return legacy.loadPlayers();
  const r = await query(`
    SELECT id, team_id AS "teamId", full_name AS "fullName",
           first_name AS "firstName", last_name AS "lastName",
           number, position, position_full AS "positionFull",
           birth_date AS "birthDate",
           photo_url AS "photoUrl", photo_url AS "photo",
           COALESCE(extra_teams, ARRAY[]::TEXT[]) AS "extraTeams"
    FROM players ORDER BY team_id, number NULLS LAST`);
  return { players: r.rows };
}

export async function loadPlayer(playerId) {
  if (!isPgEnabled()) {
    const all = legacy.loadPlayers();
    return (all.players || []).find((p) => p.id === playerId) || null;
  }
  const r = await query(`
    SELECT id, team_id AS "teamId", full_name AS "fullName",
           first_name AS "firstName", last_name AS "lastName",
           number, position, position_full AS "positionFull",
           birth_date AS "birthDate",
           photo_url AS "photoUrl", photo_url AS "photo",
           COALESCE(extra_teams, ARRAY[]::TEXT[]) AS "extraTeams"
    FROM players WHERE id = $1`, [playerId]);
  return r.rows[0] || null;
}

// === MATCHES ===
// NB: отдаёт homeTeamId/awayTeamId — ключ к фиксу #4 в Avandata.
export async function loadMatchesIndex() {
  if (!isPgEnabled()) return legacy.loadMatchesIndex();
  const r = await query(`
    SELECT id, team_id AS "teamId", home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
           home_team_name AS "homeTeamName", away_team_name AS "awayTeamName",
           match_date AS date, season, tournament,
           CASE WHEN score_home IS NOT NULL
             THEN jsonb_build_object('home', score_home, 'away', score_away)
             ELSE NULL END AS score
    FROM matches ORDER BY match_date DESC NULLS LAST`);
  return { matches: r.rows };
}

export async function loadMatch(matchId) {
  if (!isPgEnabled()) return legacy.loadMatch(matchId);
  const m = await query(`
    SELECT id, team_id AS "teamId", home_team_id, away_team_id,
           home_team_name, away_team_name,
           match_date AS date, season, tournament,
           score_home, score_away,
           team_summary_stats AS "teamSummaryStats",
           team_aggregates AS "teamAggregates",
           team_avg_ratings AS "teamAvgRatings",
           meta
    FROM matches WHERE id = $1`, [matchId]);
  if (m.rows.length === 0) throw new Error(`Матч ${matchId} не найден`);
  const head = m.rows[0];

  const players = await query(`
    SELECT mp.player_id AS id, mp.number, mp.position, mp.position_full AS "positionFull",
           mp.minutes, mp.ratings, mp.stats, mp.splits, mp.radar, mp.maps,
           p.full_name AS "fullName", p.first_name AS "firstName", p.last_name AS "lastName",
           p.photo_url AS "photoUrl", p.photo_url AS "photo"
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    WHERE mp.match_id = $1
    ORDER BY mp.number NULLS LAST`, [matchId]);

  // score: null если матч не сыгран (оба значения null), иначе {home, away}
  const score = head.score_home != null ? { home: head.score_home, away: head.score_away } : null;

  // formation / formationImage: приоритет meta JSONB (после backfill),
  // fallback на JSON-файл (для матчей, которые ещё не мигрировались).
  const meta = head.meta || {};
  let formationExtras = {
    formation: meta.formation || null,
    formationImage: meta.formationImage || null,
    formationImageFull: meta.formationImageFull || null,
    radarImages: meta.radarImages || null,
  };
  if (!formationExtras.formation) {
    try {
      const file = legacy.loadMatch(head.id);
      if (file) {
        formationExtras = {
          formation: file.formation || null,
          formationImage: file.formationImage || null,
          formationImageFull: file.formationImageFull || null,
          radarImages: file.radarImages || null,
        };
      }
    } catch (_) { /* нет файла — рендерим пустую формацию */ }
  }

  return {
    id: head.id,
    teamId: head.teamId,
    homeTeam: {
      id: head.home_team_id,
      name: head.home_team_name,
      shield: resolveShield(head.home_team_name),
    },
    awayTeam: {
      id: head.away_team_id,
      name: head.away_team_name,
      shield: resolveShield(head.away_team_name),
    },
    date: head.date,
    season: head.season,
    tournament: head.tournament,
    score,
    teamSummaryStats: head.teamSummaryStats,
    teamAggregates: head.teamAggregates,
    teamAvgRatings: head.teamAvgRatings,
    players: players.rows,
    meta: head.meta,
    ...formationExtras,
  };
}

// === STANDINGS ===
export async function loadStandings(ageGroup) {
  if (!isPgEnabled()) return legacy.loadStandings(ageGroup);
  const r = await query(`
    SELECT age_group AS "ageGroup", season, league_name AS title, source_url AS source,
           table_data AS "table", fetched_at AS "lastUpdated"
    FROM standings
    WHERE club_id = 'legirus' AND age_group = $1
    ORDER BY fetched_at DESC LIMIT 1`, [ageGroup]);
  return r.rows[0] || null;
}

// === CALENDAR === (★ ФИКС «дом/гость» для #4 — JOIN статы только наших матчей)
export async function loadCalendar(ageGroup) {
  if (!isPgEnabled()) return legacy.loadCalendar(ageGroup);
  const r = await query(`
    SELECT c.ext_match_id AS "matchId", c.match_date AS date,
           c.home_team AS home, c.away_team AS away,
           c.ext_home_team_id AS "homeTeamId", c.ext_away_team_id AS "awayTeamId",
           CASE WHEN c.score_home IS NOT NULL THEN jsonb_build_object('home', c.score_home, 'away', c.score_away) ELSE NULL END AS score,
           c.score_home IS NOT NULL AS "isPast",
           c.is_our_match AS "isOurMatch",
           c.venue, c.group_name AS "group", c.round,
           c.tournament,
           c.home_shield AS "homeShield",
           c.away_shield AS "awayShield",
           c.events_data AS "events",
           c.lineups_data AS "lineups",
           c.coach_comment AS "coachComment",
           m.team_summary_stats AS "teamSummaryStats",
           m.team_aggregates AS "teamAggregates"
    FROM calendar c
    LEFT JOIN (
      -- matches принадлежит конкретной команде; возрастная группа берётся из teams.
      -- Имена команд между matches и calendar НЕ совпадают (matches: "Легирус 2010",
      -- calendar: "ФК Легирус (ЦФКСиЗ ВО)"), поэтому матчим по age_group + календарной
      -- дате в МСК (matches иногда хранит 21:00 UTC = 00:00 MSK следующего дня).
      -- КРИТИЧНО: join только для НАШИХ матчей. Иначе SportVisor-разбор Легируса в
      -- день X залипал на ВСЕ матчи календаря того дня (включая чужие пары), и
      -- родитель видел нашу 58%/13ударов/2.5XG в карточке Выборжанин-Самсон.
      SELECT mt.age_group,
             (m.match_date AT TIME ZONE 'Europe/Moscow')::date AS msk_date,
             m.team_summary_stats,
             m.team_aggregates
      FROM matches m
      JOIN teams mt ON mt.id = m.team_id
    ) m
      ON c.is_our_match = TRUE
     AND m.age_group = c.age_group
     AND m.msk_date = (c.match_date AT TIME ZONE 'Europe/Moscow')::date
    WHERE c.club_id = 'legirus' AND c.age_group = $1
    ORDER BY c.match_date NULLS LAST`, [ageGroup]);
  if (r.rows.length === 0) return null;

  const meta = await query(`
    SELECT season, title, parser_hint AS "parserHint", sources, fetched_at AS "lastUpdated"
    FROM calendar_meta WHERE club_id = 'legirus' AND age_group = $1`, [ageGroup]);
  const head = meta.rows[0] || {};

  const now = new Date();
  const matches = r.rows.map((m) => ({
    ...m,
    isUpcoming: !m.score && (!m.date || new Date(m.date) >= now),
  }));
  return {
    ageGroup,
    season: head.season || null,
    title: head.title || null,
    parserHint: head.parserHint || null,
    sources: head.sources || [],
    matches,
    lastUpdated: head.lastUpdated || null,
  };
}

// === LEGIRUS REFERENCE (verbatim) — backend/services/leagueLeadersService.js ===
// Для корректного подсчёта голов / лидеров (related: #4, любая leaders-задача).
// Ключевое в getTopScorers:
//   - голы = события kind ∈ ('goal','penalty'); АВТОГОЛЫ (own_goal) НЕ в актив игрока;
//   - дедуп игрока по playerId (стабильнее), fallback ключ name+team;
//   - tie-break: goals desc, затем playerName.localeCompare(..., 'ru');
//   - фильтр подгруппы по нормализованному имени команды (JS, не SQL).
// ⚠️ normalizeTeamName здесь ДУБЛИРУЕТ frontend/legirus.js — в Avandata вынести в ОДИН
//    shared-модуль (это и есть долг §14.2, не тащить дубль).
// При порте: club_id='legirus' → tenant_id; FFSPB-sync в провайдер-абстракцию.

import { isPgEnabled, query } from '../db/pool.js';
import { isFfspbConfigured } from './ffspbApi.js';
import { fetchAndStoreEvents } from './matchEventsService.js';
import { loadStandings } from './dataRepo.js';

// Нормализация — те же правила что во frontend/src/utils/legirus.js
// (срез юр-префиксов + lower + дефис=пробел).  ← ДУБЛЬ, см. шапку файла.
function normalizeTeamName(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/^(фк|гбу до|гбоу|мбоу|маоу|гку|мку|гкоу|ано|оо|роо)\s+/i, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TEAM_ALIASES = {
  'пороховчанин': 'пороховчанин тосно',
  'сшор экран': 'сш экран',
  'сш выборжанин': 'выборжанин',
};
function applyAlias(name) {
  const n = normalizeTeamName(name);
  return TEAM_ALIASES[n] || n;
}

async function getSubgroupTeamNames(ageGroup) {
  const s = await loadStandings(ageGroup);
  if (!s || !Array.isArray(s.table)) return null;
  const names = s.table.map((r) => applyAlias(r.team)).filter(Boolean);
  return new Set(names);
}

// === Топ-бомбардиры age_group ===
// Голы по событиям kind ∈ ('goal','penalty'). Автоголы (own_goal) НЕ считаем в актив.
// Возвращает топ-N: { rank, playerId, playerName, teamName, teamShield, goals }.
export async function getTopScorers(ageGroup, limit = 20) {
  if (!isPgEnabled()) return [];
  const subgroup = await getSubgroupTeamNames(ageGroup);
  if (!subgroup || subgroup.size === 0) return [];

  const r = await query(`
    SELECT
      e->>'playerId'   AS player_id,
      e->>'playerName' AS player_name,
      CASE WHEN e->>'team' = 'host' THEN cal.home_team   ELSE cal.away_team   END AS team_name,
      CASE WHEN e->>'team' = 'host' THEN cal.home_shield ELSE cal.away_shield END AS team_shield
    FROM calendar cal,
         jsonb_array_elements(cal.events_data) AS e
    WHERE cal.club_id = 'legirus'
      AND cal.age_group = $1
      AND cal.tournament = 'league'
      AND cal.score_home IS NOT NULL
      AND cal.match_date < NOW()
      AND jsonb_typeof(cal.events_data) = 'array'
      AND (e->>'kind' = 'goal' OR e->>'kind' = 'penalty')`, [ageGroup]);

  // Группируем по player_id+team в JS (нужна JS-нормализация имени команды для фильтра подгруппы).
  const map = new Map();
  for (const row of r.rows) {
    const teamNorm = applyAlias(row.team_name);
    if (!subgroup.has(teamNorm)) continue;
    // Ключ: player_id если есть (стабильнее), иначе имя+команда.
    const key = row.player_id ? `id:${row.player_id}` : `name:${row.player_name}|${teamNorm}`;
    const cur = map.get(key) || {
      playerId: row.player_id || null,
      playerName: row.player_name || '—',
      teamName: row.team_name,
      teamShield: row.team_shield || null,
      goals: 0,
    };
    cur.goals += 1;
    if (!cur.teamShield && row.team_shield) cur.teamShield = row.team_shield;
    map.set(key, cur);
  }
  const list = [...map.values()].sort(
    (a, b) => b.goals - a.goals
      || a.playerName.localeCompare(b.playerName, 'ru'));
  return list.slice(0, limit).map((p, i) => ({ rank: i + 1, ...p }));
}

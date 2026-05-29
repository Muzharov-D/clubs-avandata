// === LEGIRUS REFERENCE (verbatim) — backend/services/playersSyncService.js ===
// Для задач #7 (нормализация/дедуп в одной точке) и #9 (устойчивый дедуп).
// Ключевое:
//   - findExistingLegacyPlayer: дедуп по (team_id, number) → fallback по фамилии, приоритет legacy-id.
//   - dedupePlayersOnce: схлопывает legacy+ffspb дубль, переносит match_players И users.player_id
//     (комментарий: «прошлая итерация забыла users → повисший playerId → 404»).
//   - normalizePhoto: bare-filename nagradion → абсолютный URL (иначе 404 → инициалы).
// При порте: club/'legirus'-привязки → tenant loop; FFSPB-specifics в провайдер-абстракцию.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isFfspbConfigured, listAll, listStandings } from './ffspbApi.js';
import { isPgEnabled, query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '..', 'data', 'standings', '_config.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function parseTournamentId(url) {
  if (!url) return null;
  const m = String(url).match(/tournament(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function findOurFfspbTeamId(tournamentId, ourMatcher) {
  const groups = await listStandings(tournamentId);
  const matcher = String(ourMatcher || 'Легирус').toLowerCase();
  for (const g of groups || []) {
    for (const t of g.teams || []) {
      const name = String(t.teamName || t.team?.name || '');
      if (name.toLowerCase().includes(matcher)) {
        return t.team?.id;
      }
    }
  }
  return null;
}

function pe(player, fieldName) {
  const arr = player.publicExtra || [];
  const f = arr.find((x) => x.field?.name === fieldName);
  return f?.value || null;
}

function extractPlayerId(p) {
  if (p.id != null) return String(p.id);
  if (p['@id']) {
    const m = String(p['@id']).match(/\/(\d+)$/);
    if (m) return m[1];
  }
  return null;
}

// FFSPB API часто отдаёт photo как bare filename ("person833120034.jpg") —
// это файл на nagradion.ru CDN. Превращаем в абсолютный URL чтобы фронт
// мог рендерить <img src> напрямую (раньше склеивалось как
// /assets/players/person... → 404 → инициалы).
const NAGRADION_BASE = 'https://img.nagradion.ru/images/normal/m/';
function normalizePhoto(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^person\d+\.(jpg|jpeg|png|webp)$/i.test(s)) return NAGRADION_BASE + s;
  return s;
}

function ffspbPlayerToOur(p, teamId) {
  const playerId = extractPlayerId(p);
  if (!playerId) return null; // нет id — пропускаем
  const profile = (typeof p.member === 'object' && p.member) ? p.member : {};
  const firstName = p.firstName || profile.firstName || null;
  const lastName  = p.surname   || profile.surname   || null;
  const numberRaw = pe(p, 'Номер игрока');
  const number = Number.parseInt(numberRaw, 10);
  const position = pe(p, 'Амплуа');
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const photoUrl = normalizePhoto(p.photo || profile.photo || null);
  return {
    id: `ffspb-${playerId}`,
    teamId,
    fullName: fullName || lastName || null,
    firstName,
    lastName,
    number: Number.isFinite(number) ? number : null,
    position,
    positionFull: null,
    photoUrl,
  };
}

// Прежде чем создавать новый ffspb-XXX, проверяем что нет ли уже legacy
// игрока (id вида p\d+-name) с тем же team + number. Если есть — обновляем
// его (фото/имя), но id оставляем legacy. Это избегает дублей и сохраняет
// связи в match_players (которые ссылаются на legacy id).
async function findExistingLegacyPlayer(teamId, number, lastName) {
  if (number != null) {
    const r = await query(
      `SELECT id FROM players
        WHERE team_id = $1 AND number = $2 AND id NOT LIKE 'ffspb-%'
        LIMIT 1`,
      [teamId, number]);
    if (r.rows[0]) return r.rows[0].id;
  }
  if (lastName) {
    const r = await query(
      `SELECT id FROM players
        WHERE team_id = $1 AND lower(last_name) = lower($2) AND id NOT LIKE 'ffspb-%'
        LIMIT 1`,
      [teamId, lastName]);
    if (r.rows[0]) return r.rows[0].id;
  }
  return null;
}

export async function syncPlayersForAge(age, cfg = null) {
  if (!isFfspbConfigured()) return { skipped: 'FFSPB_API_KEY not set' };
  if (!isPgEnabled())       return { skipped: 'PG not configured' };

  const config = cfg || readConfig();
  const tid = parseTournamentId(config.sources?.[age]);
  if (!tid) throw new Error('No tournament_id for ' + age);

  const ffspbTeamId = await findOurFfspbTeamId(tid, config.ourClubMatcher);
  if (!ffspbTeamId) {
    return { tid, ffspbTeamId: null, error: 'Наша команда не найдена в standings' };
  }

  const players = await listAll('/players', { team: `/api/teams/${ffspbTeamId}` });
  const teamId = `legirus-${age}`;
  let upserted = 0;
  let mergedIntoLegacy = 0;
  let skipped = 0;
  for (const p of players) {
    const row = ffspbPlayerToOur(p, teamId);
    if (!row) { skipped++; continue; }
    if (!row.fullName) { skipped++; continue; }

    const legacyId = await findExistingLegacyPlayer(teamId, row.number, row.lastName);
    if (legacyId) {
      await query(
        `UPDATE players SET
           team_id = $2,
           full_name = $3,
           first_name = COALESCE($4, first_name),
           last_name = COALESCE($5, last_name),
           number = COALESCE($6, number),
           position = COALESCE($7, position),
           photo_url = COALESCE($8, photo_url)
         WHERE id = $1`,
        [legacyId, row.teamId, row.fullName, row.firstName, row.lastName,
         row.number, row.position, row.photoUrl]);
      mergedIntoLegacy++;
      continue;
    }

    await query(
      `INSERT INTO players (id, team_id, full_name, first_name, last_name, number, position, position_full, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         full_name = EXCLUDED.full_name,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         number = EXCLUDED.number,
         position = EXCLUDED.position,
         photo_url = COALESCE(EXCLUDED.photo_url, players.photo_url)`,
      [row.id, row.teamId, row.fullName, row.firstName, row.lastName,
       row.number, row.position, row.positionFull, row.photoUrl]);
    upserted++;
  }
  return { tid, ffspbTeamId, found: players.length, upserted, mergedIntoLegacy, skipped };
}

// One-shot миграция existing photo_url'ов: bare nagradion-filenames префиксим до полного URL.
export async function migratePlayerPhotoUrls() {
  if (!isPgEnabled()) return { skipped: 'PG not configured' };
  const r = await query(`
    UPDATE players
       SET photo_url = $1 || photo_url
     WHERE photo_url ~* '^person[0-9]+\\.(jpg|jpeg|png|webp)$'
  `, [NAGRADION_BASE]);
  return { updated: r.rowCount || 0 };
}

// One-shot чистка ffspb-XXX дублей: для (team_id, number) если есть и legacy, и ffspb —
// удаляем ffspb, нужные поля переносим в legacy. Идемпотентна.
export async function dedupePlayersOnce() {
  if (!isPgEnabled()) return { skipped: 'PG not configured' };

  const dups = await query(`
    SELECT
      l.id AS legacy_id, l.photo_url AS legacy_photo, l.last_name AS legacy_lname,
      f.id AS ffspb_id,  f.photo_url AS ffspb_photo,  f.last_name AS ffspb_lname,
      l.team_id, l.number
    FROM players l
    JOIN players f
      ON f.team_id = l.team_id
     AND f.number IS NOT NULL AND l.number = f.number
     AND f.id LIKE 'ffspb-%' AND l.id NOT LIKE 'ffspb-%'
  `);

  let merged = 0;
  let reassignedMatchPlayers = 0;
  let reassignedUsers = 0;
  for (const d of dups.rows) {
    if (!d.legacy_photo && d.ffspb_photo) {
      await query(`UPDATE players SET photo_url = $1 WHERE id = $2`,
        [d.ffspb_photo, d.legacy_id]);
    }
    const r = await query(
      `UPDATE match_players SET player_id = $1
        WHERE player_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM match_players mp2
            WHERE mp2.match_id = match_players.match_id AND mp2.player_id = $1
          )`,
      [d.legacy_id, d.ffspb_id]);
    reassignedMatchPlayers += r.rowCount || 0;
    await query(`DELETE FROM match_players WHERE player_id = $1`, [d.ffspb_id]);
    // КРИТИЧНО: переназначаем users.player_id с ffspb на legacy. Без этого
    // юзер-игрок остаётся привязан к удалённому ffspb-id, его /api/auth/me
    // отдаёт повисший playerId → фронт грузит /players/ffspb-XXX → 404 →
    // «нет данных». Прошлая итерация dedup забыла это сделать.
    const ru = await query(
      `UPDATE users SET player_id = $1 WHERE player_id = $2`,
      [d.legacy_id, d.ffspb_id]);
    reassignedUsers += ru.rowCount || 0;
    await query(`DELETE FROM players WHERE id = $1`, [d.ffspb_id]);
    merged++;
  }
  return { found: dups.rows.length, merged, reassignedMatchPlayers, reassignedUsers };
}

// Авто-привязка пользователей-игроков к legacy player по фамилии + команде.
export async function autoLinkPlayerUsers() {
  if (!isPgEnabled()) return { skipped: 'PG not configured' };
  const users = await query(`
    SELECT id, full_name, team_id
      FROM users
     WHERE role = 'player' AND player_id IS NULL AND team_id IS NOT NULL
  `);
  let linked = 0;
  let ambiguous = 0;
  for (const u of users.rows) {
    const parts = String(u.full_name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const lastName = parts[parts.length - 1];
    const firstName = parts.length >= 2 ? parts[0] : null;

    let target = null;
    if (firstName) {
      const r = await query(
        `SELECT id FROM players
          WHERE team_id = $1
            AND lower(last_name) = lower($2)
            AND lower(first_name) = lower($3)
            AND id NOT LIKE 'ffspb-%'
          LIMIT 2`,
        [u.team_id, lastName, firstName]);
      if (r.rows.length === 1) target = r.rows[0].id;
    }
    if (!target) {
      const r = await query(
        `SELECT id FROM players
          WHERE team_id = $1
            AND lower(last_name) = lower($2)
            AND id NOT LIKE 'ffspb-%'
          LIMIT 2`,
        [u.team_id, lastName]);
      if (r.rows.length === 1) target = r.rows[0].id;
      else if (r.rows.length > 1) { ambiguous++; continue; }
    }
    if (target) {
      await query(`UPDATE users SET player_id = $1 WHERE id = $2`, [target, u.id]);
      linked++;
    }
  }
  return { found: users.rows.length, linked, ambiguous };
}

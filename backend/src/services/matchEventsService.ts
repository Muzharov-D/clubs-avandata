import { withTenant } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';
import { getMatch as apiGetMatch, isFfspbConfigured } from './ffspbApi.js';

/**
 * События матча из FFSPB API (порт legirus-screen/backend/services/matchEventsService.js).
 * Тянет /api/matches/{ext_match_id}, нормализует events[] (голы/карточки) + замены/составы
 * из participatedPlayers[], сохраняет МАССИВОМ в calendar.events_data (+ lineups_data).
 *
 * Мульти-тенантно: пишем через withTenant(tenantSlug). Push-уведомления НЕ портированы
 * (вне scope федерации). Источник бомбардиров региона — federationScorers поверх events_data.
 */

interface FfspbPlayerRef {
  '@id'?: string;
  firstName?: string;
  surname?: string;
  photo?: string;
  member?: { firstName?: string; surname?: string };
}
interface FfspbEvent {
  eventType?: number;
  minute?: number | null;
  addedTime?: boolean;
  team?: { '@id'?: string };
  author?: FfspbPlayerRef;
  assist?: FfspbPlayerRef;
  comment?: string;
  wideComment?: string;
}
interface FfspbParticipation {
  request?: FfspbPlayerRef;
  replacedBy?: FfspbPlayerRef | null;
  replaceMin?: number;
  bench?: boolean;
  number?: number | null;
  team?: { '@id'?: string };
}
interface FfspbMatchFull {
  host?: { '@id'?: string };
  events?: FfspbEvent[];
  participatedPlayers?: FfspbParticipation[];
}

interface TimelineEvent {
  minute: number | null;
  addedTime: boolean;
  eventType: number | string;
  kind: string;
  icon: string;
  label: string;
  team: 'host' | 'guest';
  playerName: string;
  playerId: string | null;
  assistName: string | null;
  comment: string;
}

// EventType FFSPB (исследование legirus на 300 матчах). 0=гол,1=автогол,2=пенальти-гол,
// 3=незабитый пен.,4=жёлтая,5=красная,6=2ЖК→удаление,15=травма. Замены — в participatedPlayers.
const TYPE_MAP: Record<number, { kind: string; icon: string; label: string }> = {
  0: { kind: 'goal', icon: '⚽', label: 'Гол' },
  1: { kind: 'own_goal', icon: '🥅', label: 'Автогол' },
  2: { kind: 'penalty', icon: '⚽', label: 'Гол с пенальти' },
  3: { kind: 'penalty_missed', icon: '⛔', label: 'Незабитый пенальти' },
  4: { kind: 'yellow', icon: '🟨', label: 'Жёлтая' },
  5: { kind: 'red', icon: '🟥', label: 'Красная' },
  6: { kind: 'yellow_to_red', icon: '🟨→🟥', label: 'Жёлтая (→ удаление)' },
  15: { kind: 'injury', icon: '🩹', label: 'Травма' },
};

const idTail = (iri?: string): string | null => (iri ? (iri.split('/').pop() ?? null) : null);

function shortName(p?: FfspbPlayerRef | null): string {
  if (!p) return '—';
  const last = p.surname || p.member?.surname || '';
  const first = p.firstName || p.member?.firstName || '';
  return (last + (first ? ` ${first.slice(0, 1)}.` : '')).trim() || '—';
}

function normalizeEvent(e: FfspbEvent, hostId?: string): TimelineEvent {
  const meta = (e.eventType != null && TYPE_MAP[e.eventType]) || { kind: 'other', icon: '·', label: 'Событие' };
  return {
    minute: e.minute ?? null,
    addedTime: e.addedTime ?? false,
    eventType: e.eventType ?? 'other',
    kind: meta.kind,
    icon: meta.icon,
    label: meta.label,
    team: e.team?.['@id'] && e.team['@id'] === hostId ? 'host' : 'guest',
    playerName: shortName(e.author),
    playerId: idTail(e.author?.['@id']),
    assistName: e.assist ? (e.assist.surname || null) : null,
    comment: e.comment || e.wideComment || '',
  };
}

function normalizeSubstitutions(match: FfspbMatchFull): TimelineEvent[] {
  const pp = match.participatedPlayers;
  if (!Array.isArray(pp)) return [];
  const hostId = match.host?.['@id'];
  const subs: TimelineEvent[] = [];
  for (const p of pp) {
    if (!p.replacedBy || !p.replaceMin) continue;
    subs.push({
      minute: p.replaceMin,
      addedTime: false,
      eventType: 'sub',
      kind: 'sub',
      icon: '🔄',
      label: 'Замена',
      team: p.team?.['@id'] && p.team['@id'] === hostId ? 'host' : 'guest',
      playerName: shortName(p.request),
      playerId: idTail(p.request?.['@id']),
      assistName: null,
      comment: `⇄ ${shortName(p.replacedBy)}`,
    });
  }
  return subs;
}

interface LineupPlayer { playerId: string | null; name: string; number: number | null; bench: boolean; photo: string | null }
function normalizeLineups(match: FfspbMatchFull): { home: LineupPlayer[]; away: LineupPlayer[] } | null {
  const pp = match.participatedPlayers;
  if (!Array.isArray(pp)) return null;
  const hostId = match.host?.['@id'];
  const home: LineupPlayer[] = [];
  const away: LineupPlayer[] = [];
  for (const p of pp) {
    const side = p.team?.['@id'] && p.team['@id'] === hostId ? home : away;
    side.push({
      playerId: idTail(p.request?.['@id']),
      name: shortName(p.request),
      number: p.number ?? null,
      bench: !!p.bench,
      photo: p.request?.photo || null,
    });
  }
  const sortFn = (a: LineupPlayer, b: LineupPlayer) =>
    Number(a.bench) - Number(b.bench) || (a.number ?? 999) - (b.number ?? 999);
  home.sort(sortFn);
  away.sort(sortFn);
  if (home.length === 0 && away.length === 0) return null;
  return { home, away };
}

function buildTimeline(match: FfspbMatchFull): TimelineEvent[] {
  const hostId = match.host?.['@id'];
  const events = Array.isArray(match.events) ? match.events.map((e) => normalizeEvent(e, hostId)) : [];
  const subs = normalizeSubstitutions(match);
  return [...events, ...subs].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

/**
 * Синк событий+составов одного матча в calendar.events_data (массив) для tenant.
 * Один HTTP-запрос к FFSPB. Идемпотентно (UPDATE по ext_match_id).
 */
export async function fetchAndStoreEvents(tenantSlug: string, ageGroup: string, extMatchId: string): Promise<number> {
  const match = (await apiGetMatch(extMatchId)) as FfspbMatchFull;
  const timeline = buildTimeline(match);
  const lineups = normalizeLineups(match);
  await withTenant(tenantSlug, async (_tx, conn) => {
    await conn.query(
      `UPDATE calendar
          SET events_data = $1::jsonb, events_fetched_at = NOW(),
              lineups_data = COALESCE($2::jsonb, lineups_data),
              lineups_fetched_at = CASE WHEN $2::jsonb IS NOT NULL THEN NOW() ELSE lineups_fetched_at END
        WHERE tenant_id = $3 AND age_group = $4 AND ext_match_id = $5`,
      [JSON.stringify(timeline), lineups ? JSON.stringify(lineups) : null, tenantSlug, ageGroup, extMatchId],
    );
  });
  return timeline.length;
}

/**
 * Синк событий для всех «созревших» матчей tenant'а: сыгранные (есть счёт), у которых
 * events_data пуст или давно (>20 мин) пуст — протокол FFSPB заполняется 1–24ч после игры.
 * Лимит на тик — щадим FFSPB (один X-AUTH-TOKEN на платформу). bypass — для чтения списка
 * матчей вне tenant-контекста, сам апдейт идёт через withTenant в fetchAndStoreEvents.
 */
export async function syncTenantEvents(tenantSlug: string, limit = 25): Promise<number> {
  if (!isFfspbConfigured()) return 0;
  const due = await withTenant(tenantSlug, async (_tx, conn) => {
    const r = await conn.query<{ age_group: string; ext_match_id: string }>(
      `SELECT age_group, ext_match_id FROM calendar
        WHERE tenant_id = $1 AND ext_match_id IS NOT NULL
          AND score_home IS NOT NULL AND match_date < NOW()
          AND (events_data IS NULL
               OR (jsonb_typeof(events_data) = 'array' AND jsonb_array_length(events_data) = 0
                   AND (events_fetched_at IS NULL OR events_fetched_at < NOW() - INTERVAL '20 minutes')))
        ORDER BY match_date DESC LIMIT $2`,
      [tenantSlug, limit],
    );
    return r.rows;
  });
  let ok = 0;
  for (const m of due) {
    try {
      await fetchAndStoreEvents(tenantSlug, m.age_group, m.ext_match_id);
      ok += 1;
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e), tenantSlug, extMatchId: m.ext_match_id }, 'events sync failed for match');
    }
  }
  return ok;
}

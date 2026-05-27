import { sql } from 'drizzle-orm';
import { withTenant } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';
import { listMatches as apiListMatches, isFfspbConfigured } from './ffspbApi.js';

/**
 * Sync calendar из FFSPB для одного (tenant × age × tournament).
 * UPSERT матчей в calendar по (tenant_id, age_group, ext_match_id).
 * Не удаляем «исчезнувшие» матчи — храним историю.
 */

interface FfspbMatch {
  id: number | string;
  host?: { '@id'?: string; id?: number | string; name?: string; shortName?: string; logoSrc?: string };
  guest?: { '@id'?: string; id?: number | string; name?: string; shortName?: string; logoSrc?: string };
  resultHost?: number | null;
  resultGuest?: number | null;
  done?: number;
  publicDate?: string;
  stadium?: { name?: string };
  location?: { name?: string };
  tourId?: number | null;
  tour?: { title?: string; name?: string };
  tourTitle?: string;
  round?: string;
}

function extractTeamId(iri: string | undefined): string | null {
  if (!iri) return null;
  const parts = String(iri).split('/');
  return parts[parts.length - 1] ?? null;
}

export interface CalendarRow {
  extMatchId: string;
  matchDate: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  extHomeTeamId: string | null;
  extAwayTeamId: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  isOurMatch: boolean;
  venue: string | null;
  groupName: string | null;
  round: string | null;
  tournament: string;
  homeShield: string | null;
  awayShield: string | null;
}

function apiMatchToRow(m: FfspbMatch, tournament: string, ourMatcher: string): CalendarRow {
  const matcher = ourMatcher.toLowerCase();
  const homeName = m.host?.name ?? m.host?.shortName ?? null;
  const awayName = m.guest?.name ?? m.guest?.shortName ?? null;
  const isOurMatch = !!matcher && (
    (homeName ?? '').toLowerCase().includes(matcher) ||
    (awayName ?? '').toLowerCase().includes(matcher)
  );
  const hasScore = m.resultHost != null && m.resultGuest != null && (m.done ?? 0) >= 4;
  const homeShield = m.host?.logoSrc ?? null;
  const awayShield = m.guest?.logoSrc ?? null;
  const round =
    m.tourId != null ? `Тур ${m.tourId}` :
    m.tour?.title ?? m.tour?.name ?? m.tourTitle ?? m.round ?? null;
  return {
    extMatchId: String(m.id),
    matchDate: m.publicDate ?? null,
    homeTeam: homeName,
    awayTeam: awayName,
    extHomeTeamId: extractTeamId(m.host?.['@id']),
    extAwayTeamId: extractTeamId(m.guest?.['@id']),
    scoreHome: hasScore ? Number(m.resultHost) : null,
    scoreAway: hasScore ? Number(m.resultGuest) : null,
    isOurMatch,
    venue: m.stadium?.name ?? m.location?.name ?? null,
    groupName: null,
    round,
    tournament,
    homeShield,
    awayShield,
  };
}

export interface SyncCalendarResult {
  tenantSlug: string;
  ageGroup: string;
  tournament: string;
  ok: boolean;
  count?: number;
  error?: string;
}

/**
 * Sync calendar для (tenant × age × tournament).
 * tournament — 'league' | 'cup'.
 */
export async function syncTenantCalendarTournament(args: {
  tenantSlug: string;
  ageGroup: string;
  season: string;
  tournamentId: string | number;
  tournament: 'league' | 'cup';
  ourMatcher: string;
}): Promise<SyncCalendarResult> {
  const { tenantSlug, ageGroup, season, tournamentId, tournament, ourMatcher } = args;
  if (!isFfspbConfigured()) {
    return { tenantSlug, ageGroup, tournament, ok: false, error: 'FFSPB_API_KEY not configured' };
  }
  try {
    const apiMatches = (await apiListMatches(tournamentId)) as FfspbMatch[];
    const rows = apiMatches.map((m) => apiMatchToRow(m, tournament, ourMatcher));

    await withTenant(tenantSlug, async (_tx, conn) => {
      for (const r of rows) {
        await conn.query(
          `INSERT INTO calendar (
             tenant_id, age_group, season, ext_match_id, match_date,
             home_team, away_team, ext_home_team_id, ext_away_team_id,
             score_home, score_away, is_our_match, venue, group_name,
             round, tournament, home_shield, away_shield, source_url, fetched_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9,
             $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, NOW()
           )
           ON CONFLICT (tenant_id, age_group, ext_match_id) DO UPDATE SET
             match_date     = EXCLUDED.match_date,
             score_home     = EXCLUDED.score_home,
             score_away     = EXCLUDED.score_away,
             venue          = EXCLUDED.venue,
             is_our_match   = EXCLUDED.is_our_match,
             tournament     = EXCLUDED.tournament,
             round          = COALESCE(EXCLUDED.round,      calendar.round),
             home_shield    = COALESCE(EXCLUDED.home_shield, calendar.home_shield),
             away_shield    = COALESCE(EXCLUDED.away_shield, calendar.away_shield),
             fetched_at     = NOW()`,
          [
            tenantSlug, ageGroup, season, r.extMatchId, r.matchDate,
            r.homeTeam, r.awayTeam, r.extHomeTeamId, r.extAwayTeamId,
            r.scoreHome, r.scoreAway, r.isOurMatch, r.venue, r.groupName,
            r.round, r.tournament, r.homeShield, r.awayShield, `ffspb-api://tournaments/${tournamentId}`,
          ],
        );
      }

      // Обновляем calendar_meta — снапшот источников и parser_hint.
      await conn.query(
        `INSERT INTO calendar_meta (tenant_id, age_group, season, title, parser_hint, sources, fetched_at)
         VALUES ($1, $2, $3, NULL, 'ffspb-api', $4, NOW())
         ON CONFLICT (tenant_id, age_group) DO UPDATE SET
           season      = EXCLUDED.season,
           parser_hint = EXCLUDED.parser_hint,
           sources     = EXCLUDED.sources,
           fetched_at  = NOW()`,
        [
          tenantSlug, ageGroup, season,
          JSON.stringify([{ tournament, tournamentId: String(tournamentId), found: rows.length }]),
        ],
      );
    });

    logger.info({ tenantSlug, ageGroup, tournament, count: rows.length }, '[calendar] synced');
    return { tenantSlug, ageGroup, tournament, ok: true, count: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ tenantSlug, ageGroup, tournament, err: msg }, '[calendar] sync failed');
    return { tenantSlug, ageGroup, tournament, ok: false, error: msg };
  }
}

// Подавляем неиспользуемый импорт sql (резерв на будущее для прямых query)
void sql;

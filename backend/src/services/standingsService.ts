import { withTenant } from '../db/tenantContext.js';
import { standings } from '../db/schema/standings.js';
import { logger } from '../shared/logger.js';
import { listStandings as apiListStandings, isFfspbConfigured } from './ffspbApi.js';

/**
 * Sync standings из FFSPB для одного (tenant × age_group × tournament).
 * API возвращает несколько групп (Вторая лига / Третья лига / Группы …) —
 * выбираем ту, где играет наша команда (matcher).
 */

interface FfspbTeamRow {
  position: number;
  team?: { id?: string | number; name?: string; logoSrc?: string; thumbnails?: { square_xs?: string } };
  teamName?: string;
  stats?: {
    games?: number;
    wins?: number;
    draws?: number;
    loses?: number;
    scored?: number;
    missed?: number;
    difference?: number | string;
    points?: number;
  };
}

interface FfspbGroup {
  groupName?: string;
  teams?: FfspbTeamRow[];
}

export interface StandingsTableRow {
  pos: number;
  team: string;
  teamId: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  missed: number;
  difference: number | string;
  points: number;
  shield: string | null;
  isOurClub: boolean;
}

function mapGroupsToTable(groups: FfspbGroup[], ourMatcher: string): { groupName: string; table: StandingsTableRow[] } | null {
  const matcher = ourMatcher.toLowerCase();
  let our: FfspbGroup | null = null;
  for (const g of groups) {
    const has = (g.teams ?? []).some((t) =>
      String(t.teamName ?? t.team?.name ?? '').toLowerCase().includes(matcher),
    );
    if (has) { our = g; break; }
  }
  if (!our) return null;

  const table: StandingsTableRow[] = (our.teams ?? []).map((t) => {
    const s = t.stats ?? {};
    const team = t.team ?? {};
    const name = t.teamName ?? team.name ?? '';
    return {
      pos: t.position,
      team: name,
      teamId: team.id != null ? String(team.id) : null,
      games:  Number(s.games  ?? 0),
      wins:   Number(s.wins   ?? 0),
      draws:  Number(s.draws  ?? 0),
      losses: Number(s.loses  ?? 0),
      scored: Number(s.scored ?? 0),
      missed: Number(s.missed ?? 0),
      difference: s.difference ?? 0,
      points: Number(s.points ?? 0),
      shield: team.logoSrc ?? team.thumbnails?.square_xs ?? null,
      isOurClub: name.toLowerCase().includes(matcher),
    };
  });
  table.sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999));
  return { groupName: our.groupName ?? '', table };
}

export interface SyncStandingsResult {
  tenantSlug: string;
  ageGroup: string;
  ok: boolean;
  teamsCount?: number;
  leagueName?: string;
  error?: string;
}

/**
 * Sync standings одного (tenant × age × tournament). Пишет новый snapshot в standings.
 * Возвращает что получилось — для агрегации в cron-логе.
 */
export async function syncTenantStandings(args: {
  tenantSlug: string;
  ageGroup: string;
  tournamentId: string | number;
  season: string;
  ourMatcher: string;
}): Promise<SyncStandingsResult> {
  const { tenantSlug, ageGroup, tournamentId, season, ourMatcher } = args;
  if (!isFfspbConfigured()) {
    return { tenantSlug, ageGroup, ok: false, error: 'FFSPB_API_KEY not configured' };
  }
  try {
    const groups = (await apiListStandings(tournamentId)) as FfspbGroup[];
    const mapped = mapGroupsToTable(groups, ourMatcher);
    if (!mapped) {
      return {
        tenantSlug, ageGroup, ok: false,
        error: `no group with matcher "${ourMatcher}" for tournament ${tournamentId}`,
      };
    }
    await withTenant(tenantSlug, async (tx) => {
      await tx.insert(standings).values({
        tenantId: tenantSlug,
        ageGroup,
        season,
        leagueName: mapped.groupName,
        sourceUrl: `ffspb-api://tournaments/${tournamentId}`,
        tableData: mapped.table,
      });
    });
    logger.info({ tenantSlug, ageGroup, teams: mapped.table.length }, '[standings] synced');
    return { tenantSlug, ageGroup, ok: true, teamsCount: mapped.table.length, leagueName: mapped.groupName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ tenantSlug, ageGroup, err: msg }, '[standings] sync failed');
    return { tenantSlug, ageGroup, ok: false, error: msg };
  }
}

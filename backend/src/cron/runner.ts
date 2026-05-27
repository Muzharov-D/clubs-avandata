import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { tenants, type Tenant } from '../db/schema/tenants.js';
import { logger } from '../shared/logger.js';
import { syncTenantStandings } from '../services/standingsService.js';
import { syncTenantCalendarTournament } from '../services/calendarService.js';

/**
 * Multi-tenant cron runner.
 *
 * Принцип:
 *  1. Для каждой задачи (standings/calendar/...) запоминаем timer.
 *  2. Каждый tick — itera по всем active тенантам с data_provider='ffspb'.
 *  3. Для каждого тенанта берём provider_config.tournaments и делаем sync
 *     по каждому (age_group × tournament).
 *
 * Идемпотентность гарантирована UPSERT'ами в сервисах + INSERT-only для standings
 * (история снапшотов).
 */

const ENABLED_CRONS = new Set<string>();
const timers = new Map<string, NodeJS.Timeout>();

interface ProviderConfigTournaments {
  // { '2010': { leagueId: '44333', cupId?: '44400' }, ... }
  [ageGroup: string]: {
    leagueId?: string | number | null;
    cupId?: string | number | null;
  };
}

interface ProviderConfig {
  ourMatcher?: string;
  season?: string;
  tournaments?: ProviderConfigTournaments;
}

async function activeFfspbTenants(): Promise<Tenant[]> {
  return withBypassRLS((tx) =>
    tx.select().from(tenants).where(eq(tenants.dataProvider, 'ffspb')),
  );
}

function tenantConfig(t: Tenant): ProviderConfig {
  const raw = (t.providerConfig ?? {}) as ProviderConfig;
  return raw;
}

// ============================================================================
// Standings
// ============================================================================

async function tickStandings() {
  const list = await activeFfspbTenants();
  for (const t of list) {
    if (t.status !== 'active') continue;
    const cfg = tenantConfig(t);
    const season = cfg.season ?? new Date().getFullYear().toString();
    const ourMatcher = cfg.ourMatcher ?? t.displayName;
    const ages = Object.entries(cfg.tournaments ?? {});
    for (const [ageGroup, tids] of ages) {
      if (!tids.leagueId) continue;
      await syncTenantStandings({
        tenantSlug: t.slug,
        ageGroup,
        tournamentId: tids.leagueId,
        season,
        ourMatcher,
      });
    }
  }
}

// ============================================================================
// Calendar (league + cup)
// ============================================================================

async function tickCalendar() {
  const list = await activeFfspbTenants();
  for (const t of list) {
    if (t.status !== 'active') continue;
    const cfg = tenantConfig(t);
    const season = cfg.season ?? new Date().getFullYear().toString();
    const ourMatcher = cfg.ourMatcher ?? t.displayName;
    const ages = Object.entries(cfg.tournaments ?? {});
    for (const [ageGroup, tids] of ages) {
      if (tids.leagueId) {
        await syncTenantCalendarTournament({
          tenantSlug: t.slug, ageGroup, season,
          tournamentId: tids.leagueId, tournament: 'league', ourMatcher,
        });
      }
      if (tids.cupId) {
        await syncTenantCalendarTournament({
          tenantSlug: t.slug, ageGroup, season,
          tournamentId: tids.cupId, tournament: 'cup', ourMatcher,
        });
      }
    }
  }
}

// ============================================================================
// Wiring
// ============================================================================

interface CronJob {
  name: string;
  intervalMs: number;
  initialDelayMs: number;
  run: () => Promise<void>;
}

const JOBS: CronJob[] = [
  { name: 'standings', intervalMs: 30 * 60_000, initialDelayMs: 5_000,  run: tickStandings },
  { name: 'calendar',  intervalMs: 30 * 60_000, initialDelayMs: 8_000,  run: tickCalendar  },
];

export function startCrons() {
  if (ENABLED_CRONS.size > 0) {
    logger.warn('crons already started');
    return;
  }
  for (const job of JOBS) {
    ENABLED_CRONS.add(job.name);
    const safeRun = () => {
      Promise.resolve(job.run()).catch((err) => {
        logger.error({ err: err instanceof Error ? err.message : String(err), job: job.name }, 'cron tick failed');
      });
    };
    setTimeout(safeRun, job.initialDelayMs);
    timers.set(job.name, setInterval(safeRun, job.intervalMs));
    logger.info({ job: job.name, intervalMs: job.intervalMs }, 'cron started');
  }
  void db; // подавляем неиспользуемый импорт, пригодится позже
}

export function stopCrons() {
  for (const [name, t] of timers) {
    clearInterval(t);
    logger.info({ job: name }, 'cron stopped');
  }
  timers.clear();
  ENABLED_CRONS.clear();
}

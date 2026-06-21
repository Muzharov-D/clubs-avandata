import { and, desc, eq } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { regionCensus } from '../db/schema/regionCensus.js';

/**
 * Перепись региона по «пирамиде лиг» FFSPB (region-wide, ВСЕ лиги сезона).
 *
 * Запись делает офлайн-скрипт scripts/syncRegionCensus.ts (~раз в месяц, тяжёлый
 * живой обход FFSPB). Здесь — ТОЛЬКО быстрое чтение последнего снимка через
 * withBypassRLS (таблица RLS bypass-only). Эндпоинт region-map подмешивает его в
 * поле `pyramid` (или null, если снимка ещё нет — экран деградирует мягко).
 *
 * Эти типы — общий контракт payload между скриптом-писателем, read-функцией,
 * эндпоинтом и фронтом (frontend/src/routes/federation/RegionMap.tsx зеркалит их).
 */

/** Один ряд per-league в пирамиде. league — Высшая/Первая/Вторая/Третья/Четвёртая/Прочие группы. */
export interface RegionPyramidLeague {
  league: string;
  teams: number;
  /** Различимые клубы (нормализованное имя). */
  clubs: number;
  /** Игроки, дедуп глобально, назначены в ВЫСШУЮ лигу появления. */
  players: number;
  /** Доля Q1 рождения (% от известных дат), 1 знак. */
  q1pct: number;
  /** Доля Q2 рождения (% от известных дат), 1 знак. */
  q2pct: number;
  /** Доля Q3 рождения (% от известных дат), 1 знак. */
  q3pct: number;
  /** Доля Q4 рождения (% от известных дат), 1 знак. */
  q4pct: number;
  /** Перекос Q1÷Q4 (×). null, если Q4=0. */
  skew: number | null;
}

/**
 * Перекос даты рождения по одной когорте (году рождения) Первенства.
 * Считается на снимке region_census (тот же обход FFSPB, без нового пула).
 */
export interface RegionAgeCohort {
  /** Год рождения когорты (2009..2016). */
  year: number;
  /** Игроки когорты Первенства (лиги Высшая+Первая), дедуп. */
  players: number;
  /** Доля Q1 рождения (% от известных дат), 1 знак. */
  q1pct: number;
  /** Доля Q4 рождения (% от известных дат), 1 знак. */
  q4pct: number;
  /** Перекос Q1÷Q4 (×). null, если Q4=0. */
  skew: number | null;
}

/** Региональные тоталы переписи (дедуп по всему региону). */
export interface RegionPyramidTotals {
  /** Игроки, различимые по id глобально. */
  playersDistinct: number;
  teamsTotal: number;
  clubsDistinct: number;
  matches: number;
  tierMatches: { 'Первенство': number; 'Турнир': number };
  q: { 1: number; 2: number; 3: number; 4: number };
  q1pct: number;
  q4pct: number;
}

/** Полный payload переписи (то, что лежит в region_census.payload). */
export interface RegionPyramidPayload {
  /** Сезон — строка как в эталоне (.tmp_ffspb_byleague.json), напр. "2026". */
  season: string;
  leagues: RegionPyramidLeague[];
  totals: RegionPyramidTotals;
  /** Перекос даты рождения по когортам Первенства (2009..2016, по возрастанию года). */
  ageEffect: RegionAgeCohort[];
  /** ISO-метка момента съёма (проставляет read-функция из captured_at). */
  capturedAt?: string | null;
}

/**
 * Последний снимок переписи региона для федерации (или null, если ещё не снимали).
 * Быстрое чтение одного ряда — безопасно дёргать на каждый запрос страницы.
 */
export async function latestRegionCensus(
  federationSlug: string,
  season?: number,
): Promise<RegionPyramidPayload | null> {
  const rows = await withBypassRLS((tx) => {
    const where = season != null
      ? and(eq(regionCensus.federationSlug, federationSlug), eq(regionCensus.season, season))
      : eq(regionCensus.federationSlug, federationSlug);
    return tx
      .select()
      .from(regionCensus)
      .where(where)
      .orderBy(desc(regionCensus.capturedAt))
      .limit(1);
  });
  const row = rows[0];
  if (!row) return null;
  const payload = row.payload as RegionPyramidPayload;
  return { ...payload, capturedAt: row.capturedAt ? new Date(row.capturedAt).toISOString() : null };
}

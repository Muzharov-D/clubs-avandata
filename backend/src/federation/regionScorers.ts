import { and, desc, eq } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { regionScorers } from '../db/schema/regionScorers.js';

/**
 * Бомбардиры региона — голы Первенства (когорты 2009–2016) по протоколам матчей
 * FFSPB (region-wide, открытые данные: имена из протоколов, не PII).
 *
 * Запись делает офлайн-скрипт scripts/syncRegionScorers.ts (~раз в месяц, тяжёлый
 * живой обход деталей матчей FFSPB). Здесь — ТОЛЬКО быстрое чтение последнего снимка
 * через withBypassRLS (таблица RLS bypass-only). Эндпоинт region-scorers отдаёт payload
 * (или null, если снимка ещё нет — экран деградирует мягко).
 *
 * Эти типы — общий контракт payload между скриптом-писателем, read-функцией,
 * эндпоинтом и фронтом (frontend/src/routes/federation/ScorersView.tsx зеркалит их).
 */

/** Один бомбардир топа: имя + клуб + эмблема клуба + год рождения когорты + голы. */
export interface RegionScorerRow {
  /** Имя бомбардира из протокола («Фамилия И.»). */
  name: string;
  /** Клуб (нормализованное имя команды, без года/кавычек). */
  club: string;
  /** URL эмблемы клуба из детали матча (logoSrc / thumbnails.square_xs); null если нет. */
  logo: string | null;
  /** Год рождения когорты турнира (2009..2016) — условное сравнение между возрастами. */
  cohort: number;
  /** Голы (гол + пенальти; автоголы исключены). */
  goals: number;
}

/** Полный payload бомбардиров региона (то, что лежит в region_scorers.payload). */
export interface RegionScorersPayload {
  /** Сезон — строка как в эталоне (.tmp_ffspb_scorers.json), напр. "2026". */
  season: string;
  /** Сколько деталей матчей просканировано (с непустыми events). */
  matchesScanned: number;
  /** Топ-15 бомбардиров (по голам, по убыванию). */
  topGoals: RegionScorerRow[];
  /** Ассисты в протоколах FFSPB не заполнены — всегда пусто (контракт сохранён). */
  topAssists: never[];
  /** ISO-метка момента съёма (проставляет read-функция из captured_at). */
  capturedAt?: string | null;
}

/**
 * Последний снимок бомбардиров региона для федерации (или null, если ещё не
 * снимали). Быстрое чтение одного ряда — безопасно дёргать на каждый запрос.
 */
export async function latestRegionScorers(
  federationSlug: string,
  season?: number,
): Promise<RegionScorersPayload | null> {
  const rows = await withBypassRLS((tx) => {
    const where = season != null
      ? and(eq(regionScorers.federationSlug, federationSlug), eq(regionScorers.season, season))
      : eq(regionScorers.federationSlug, federationSlug);
    return tx
      .select()
      .from(regionScorers)
      .where(where)
      .orderBy(desc(regionScorers.capturedAt))
      .limit(1);
  });
  const row = rows[0];
  if (!row) return null;
  const payload = row.payload as RegionScorersPayload;
  return { ...payload, capturedAt: row.capturedAt ? new Date(row.capturedAt).toISOString() : null };
}

import { and, desc, eq } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { regionMinutes } from '../db/schema/regionMinutes.js';

/**
 * Карта возможностей региона — игровое время Первенства (когорты 2009–2016) по
 * протоколам FFSPB (region-wide, ВСЕ оценённые игроки реестра лиг).
 *
 * Запись делает офлайн-скрипт scripts/syncRegionMinutes.ts (~раз в месяц, тяжёлый
 * живой обход деталей матчей FFSPB). Здесь — ТОЛЬКО быстрое чтение последнего снимка
 * через withBypassRLS (таблица RLS bypass-only). Эндпоинт minutes отдаёт payload
 * (или null, если снимка ещё нет — экран деградирует мягко).
 *
 * Эти типы — общий контракт payload между скриптом-писателем, read-функцией,
 * эндпоинтом и фронтом (frontend/src/routes/federation/BuriedView.tsx зеркалит их).
 */

/** Распределение оценённых игроков по бакетам игрового времени (доля от командных минут). */
export interface RegionMinutesBuckets {
  /** 0% — не выходят на поле ни разу. */
  zero: number;
  /** (0; 15) % — погребены на лавке. */
  b0_15: number;
  /** [15; 30) %. */
  b15_30: number;
  /** [30; 50) %. */
  b30_50: number;
  /** ≥ 50 % — реальные игроки основы. */
  over50: number;
}

/** Медиана игрового времени + доля погребённых (<15%) по одному кварталу рождения. */
export interface RegionMinutesQuarter {
  /** Квартал рождения 1..4 (Q1 январь–март … Q4 октябрь–декабрь). */
  q: number;
  /** Медиана игрового времени когорты квартала (% от командных минут), 1 знак. */
  medianTime: number;
  /** Доля погребённых (<15%) в квартале, % (1 знак). */
  buriedPct: number;
}

/** Полный payload карты возможностей (то, что лежит в region_minutes.payload). */
export interface RegionMinutesPayload {
  /** Сезон — строка как в эталоне (.tmp_ffspb_minutes.json), напр. "2026". */
  season: string;
  /** Оценённые игроки реестра лиг (у чьих команд есть матчи с составами). */
  evaluated: number;
  /** Не выходят на поле ни разу (0 появлений). */
  neverPlayed: number;
  /** Доля не выходящих, % (1 знак). */
  neverPlayedPct: number;
  /** Погребённые на лавке (<15% игрового времени). */
  buried15: number;
  /** Доля погребённых, % (1 знак). */
  buried15Pct: number;
  /** Медиана игрового времени по региону (% от командных минут), 1 знак. */
  medianTime: number;
  /** Распределение по бакетам игрового времени. */
  buckets: RegionMinutesBuckets;
  /** Медиана+погребённые по кварталам рождения (Q1..Q4, по возрастанию). */
  byQuarter: RegionMinutesQuarter[];
  /** ISO-метка момента съёма (проставляет read-функция из captured_at). */
  capturedAt?: string | null;
}

/**
 * Последний снимок карты возможностей региона для федерации (или null, если ещё
 * не снимали). Быстрое чтение одного ряда — безопасно дёргать на каждый запрос.
 */
export async function latestRegionMinutes(
  federationSlug: string,
  season?: number,
): Promise<RegionMinutesPayload | null> {
  const rows = await withBypassRLS((tx) => {
    const where = season != null
      ? and(eq(regionMinutes.federationSlug, federationSlug), eq(regionMinutes.season, season))
      : eq(regionMinutes.federationSlug, federationSlug);
    return tx
      .select()
      .from(regionMinutes)
      .where(where)
      .orderBy(desc(regionMinutes.capturedAt))
      .limit(1);
  });
  const row = rows[0];
  if (!row) return null;
  const payload = row.payload as RegionMinutesPayload;
  return { ...payload, capturedAt: row.capturedAt ? new Date(row.capturedAt).toISOString() : null };
}

/**
 * Детерминированная привязка загруженного SportVisor-матча к фикстуре
 * FFSPB/Наградион-календаря — на этапе upload.
 *
 * Зачем: матч-объект из SportVisor НЕ содержит креста соперника, ext team id и
 * каноническое имя. Раньше крест соперника на детали матча резолвился нечётко —
 * по нормализованному имени против таблицы standings — и часто падал на
 * плейсхолдер (SportVisor-имя «СШОР Невского 2010-2011» ≠ лиговое
 * «СШОР №2 Невского района»). Здесь линкуем матч к фикстуре календаря (там уже
 * есть shield/ext id/каноническое имя из API) и берём данные соперника оттуда.
 *
 * Стратегия — КОНСЕРВАТИВНАЯ (решение юзера 2026-06-06): ошибка линка = чужой
 * крест, поэтому линкуем ТОЛЬКО при двойном совпадении и единственности:
 *   1. Счёт совпадает с НАШЕЙ перспективы (наши голы : голы соперника), что
 *      снимает зависимость от ориентации дом/гость.
 *   2. Имя соперника пересекается по значимому токену (длиной ≥4, не «сшор/сш/фк/…»).
 * Если такому критерию удовлетворяет ровно одна фикстура — линкуем. Ноль или
 * больше одной → НЕ линкуем (остаётся текущее поведение, без догадок).
 */
import type { PoolClient } from 'pg';
import { normalizeTeamName, resolveOurSide } from '../shared/teamName.js';
import { resolveOurExtId } from '../data/ourTeam.js';

/** Сырая строка фикстуры календаря для матчинга. */
interface CalFixtureRow {
  extMatchId: string | null;
  home: string | null;
  away: string | null;
  homeShield: string | null;
  awayShield: string | null;
  extHomeTeamId: string | null;
  extAwayTeamId: string | null;
  scoreH: number | null;
  scoreA: number | null;
  date: string | Date | null;
}

export interface FfspbFixtureLink {
  /** ext_match_id фикстуры из FFSPB (для трассировки/связи с calendar). */
  extMatchId: string | null;
  /** Каноническое имя соперника из календаря (заменяет SportVisor-имя на отдаче). */
  opponentName: string | null;
  /** Крест соперника (URL логотипа из FFSPB). */
  opponentShield: string | null;
  /** ext team id соперника из FFSPB. */
  opponentExtId: string | null;
  /** Реальная дата матча из календаря. */
  matchDate: Date | null;
}

/** Generic-токены имени школы — сами по себе не различают команды. */
const GENERIC_TOKENS = new Set([
  'сшор', 'сш', 'фк', 'школа', 'спортивная', 'клуб', 'академия', 'сдюшор',
]);

/**
 * Значимые токены имени для пересечения: длина ≥4 (короткие 3-буквенные
 * слипания — слишком слабый сигнал), без generic-слов («сшор» и т.п.).
 */
function meaningfulTokens(name: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const tok of normalizeTeamName(name).split(' ')) {
    if (tok.length >= 4 && !GENERIC_TOKENS.has(tok)) out.add(tok);
  }
  return out;
}

/**
 * Имена корроборируют, если нормализованные равны ИЛИ делят хотя бы один
 * значимый токен (см. meaningfulTokens).
 */
function nameCorroborates(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tb = meaningfulTokens(b);
  for (const t of meaningfulTokens(a)) {
    if (tb.has(t)) return true;
  }
  return false;
}

function toDate(d: string | Date | null): Date | null {
  return d ? new Date(d) : null;
}

interface MatchOrientation {
  ourSide: 'home' | 'away' | null;
  ourScore: number | null;
  oppScore: number | null;
  opponentName: string | null;
}

/** Наша сторона в фикстуре по ext id (приоритет) или по имени (фолбэк). */
function fixtureOurSide(
  fx: CalFixtureRow,
  ourExtId: string | null,
  ourName: string | null,
): 'home' | 'away' | null {
  if (ourExtId) {
    if (fx.extHomeTeamId && String(fx.extHomeTeamId) === ourExtId) return 'home';
    if (fx.extAwayTeamId && String(fx.extAwayTeamId) === ourExtId) return 'away';
  }
  return resolveOurSide(ourName, fx.home, fx.away);
}

/**
 * Найти фикстуру календаря, к которой однозначно привязывается загруженный матч.
 * Pure-функция: фикстуры + ориентация uploaded-матча на входе → результат.
 * Возвращает null, если совпадений 0 или >1, или нет якорного счёта/стороны.
 */
export function selectFixture(
  up: MatchOrientation,
  fixtures: CalFixtureRow[],
  ourExtId: string | null,
  ourName: string | null,
): FfspbFixtureLink | null {
  // Счёт — обязательный якорь. Без него (SportVisor не отдал) не линкуем.
  if (up.ourScore == null || up.oppScore == null) return null;
  // Ориентация uploaded-матча неизвестна — не можем построить перспективный счёт.
  if (up.ourSide == null || !up.opponentName) return null;

  const hits: FfspbFixtureLink[] = [];
  for (const fx of fixtures) {
    const side = fixtureOurSide(fx, ourExtId, ourName);
    if (side == null) continue;
    const fxOur = side === 'home' ? fx.scoreH : fx.scoreA;
    const fxOpp = side === 'home' ? fx.scoreA : fx.scoreH;
    if (fxOur == null || fxOpp == null) continue;
    // (1) Счёт с нашей перспективы.
    if (Number(fxOur) !== up.ourScore || Number(fxOpp) !== up.oppScore) continue;
    // (2) Имя соперника корроборирует.
    const fxOppName = side === 'home' ? fx.away : fx.home;
    if (!nameCorroborates(fxOppName, up.opponentName)) continue;

    hits.push({
      extMatchId: fx.extMatchId,
      opponentName: fxOppName,
      opponentShield: side === 'home' ? fx.awayShield : fx.homeShield,
      opponentExtId: side === 'home' ? fx.extAwayTeamId : fx.extHomeTeamId,
      matchDate: toDate(fx.date),
    });
  }

  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;

  // Несколько совпадений: безопасно линкуем ТОЛЬКО если все они — один и тот же
  // соперник (оба круга, тот же счёт). Крест/имя/ext id тогда идентичны; но какой
  // именно круг — неизвестно, поэтому ext_match_id/дату НЕ утверждаем (дату
  // восстановит applyFixtureDates по близости). Разные соперники → не угадываем.
  // ВАЖНО: ref должен быть НЕ null — иначе при отсутствии ext id у фикстур
  // .every() истинно вакуумно и мы бы слинковали РАЗНЫХ соперников (чужой крест).
  const ref = hits[0]!.opponentExtId;
  const sameOpponent = ref != null && hits.every((h) => h.opponentExtId === ref);
  if (!sameOpponent) return null;
  return {
    extMatchId: null,
    opponentName: hits[0]!.opponentName,
    opponentShield: hits[0]!.opponentShield,
    opponentExtId: hits[0]!.opponentExtId,
    matchDate: null,
  };
}

/**
 * Привязать загруженный матч к фикстуре FFSPB-календаря (DB-обёртка).
 * Best-effort: при любой невозможности линка возвращает null, вызывающий код
 * продолжает с текущим поведением.
 */
export async function linkFfspbFixture(
  conn: PoolClient,
  tenantSlug: string,
  ageGroup: string,
  ourName: string | null,
  ourSide: 'home' | 'away' | null,
  homeName: string,
  awayName: string,
  score: { home: number | null; away: number | null } | null,
): Promise<FfspbFixtureLink | null> {
  if (!score || score.home == null || score.away == null || ourSide == null) return null;

  const ourScore = ourSide === 'home' ? score.home : score.away;
  const oppScore = ourSide === 'home' ? score.away : score.home;
  const opponentName = ourSide === 'home' ? awayName : homeName;

  const { rows } = await conn.query<CalFixtureRow>(
    `SELECT ext_match_id AS "extMatchId", home_team AS "home", away_team AS "away",
            home_shield AS "homeShield", away_shield AS "awayShield",
            ext_home_team_id AS "extHomeTeamId", ext_away_team_id AS "extAwayTeamId",
            score_home AS "scoreH", score_away AS "scoreA", match_date AS "date"
       FROM calendar
      WHERE tenant_id = $1 AND age_group = $2 AND is_our_match = TRUE
        AND score_home IS NOT NULL AND score_away IS NOT NULL
      ORDER BY match_date ASC NULLS LAST`,
    [tenantSlug, ageGroup],
  );
  if (rows.length === 0) return null;

  const ourExtId = await resolveOurExtId(conn, tenantSlug, ageGroup);
  return selectFixture(
    { ourSide, ourScore, oppScore, opponentName },
    rows,
    ourExtId,
    ourName,
  );
}

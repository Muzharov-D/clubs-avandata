/**
 * Восстановление РЕАЛЬНОЙ даты матча из календаря Наградиона.
 *
 * Проблема: новый RU-формат SportVisor не отдаёт дату → matches.match_date
 * пустой/неверный, а старый фоллбэк брал фикстуру «ближе всего к сейчас» →
 * все загрузки схлопывались в одну дату. Здесь линкуем загруженный матч к
 * фикстуре календаря по нормализованному имени соперника + возрастной группе
 * (на отдаче, без миграции данных).
 */
import { normalizeTeamName, resolveOurSide } from '../shared/teamName.js';

export interface CalFixture {
  date: string | Date | null;
  home: string | null;
  away: string | null;
  scoreH: number | null;
  scoreA: number | null;
}

export interface DatedMatchRow {
  teamId?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  home?: string | null;
  away?: string | null;
  scoreHome?: number | null;
  scoreAway?: number | null;
  date?: string | Date | null;
  [k: string]: unknown;
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

function nameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function toDate(d: string | Date | null): Date | null {
  return d ? new Date(d) : null;
}

/** Имя соперника: сторона, чей team-id НЕ наш (фоллбэк — по имени). */
export function opponentName(m: DatedMatchRow, ourName?: string | null): string | null {
  if (m.homeTeamId && m.homeTeamId === m.teamId) return m.away ?? null;
  if (m.awayTeamId && m.awayTeamId === m.teamId) return m.home ?? null;
  const side = resolveOurSide(ourName ?? null, m.home ?? null, m.away ?? null);
  if (side === 'home') return m.away ?? null;
  if (side === 'away') return m.home ?? null;
  return null;
}

/**
 * Дата фикстуры по сопернику. Неоднозначность (два круга против одного
 * соперника) разводим по счёту, затем по близости к текущей дате, затем по
 * самой ранней. null — соперник не нашёлся в календаре.
 */
export function pickFixtureDate(
  opponent: string | null,
  existingDate: string | Date | null,
  score: { home: number; away: number } | null,
  fixtures: CalFixture[],
): Date | null {
  if (!opponent) return null;
  const oppNorm = normalizeTeamName(opponent);
  if (!oppNorm) return null;

  const candidates = fixtures.filter((f) =>
    nameMatches(normalizeTeamName(f.home), oppNorm) || nameMatches(normalizeTeamName(f.away), oppNorm),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return toDate(candidates[0]!.date);

  if (score) {
    const byScore = candidates.filter(
      (f) => (f.scoreH === score.home && f.scoreA === score.away)
          || (f.scoreH === score.away && f.scoreA === score.home),
    );
    if (byScore.length === 1) return toDate(byScore[0]!.date);
  }
  const dated = candidates.filter((f) => f.date);
  if (existingDate && dated.length) {
    const base = new Date(existingDate).getTime();
    if (Number.isFinite(base)) {
      const sorted = [...dated].sort(
        (x, y) => Math.abs(new Date(x.date!).getTime() - base) - Math.abs(new Date(y.date!).getTime() - base),
      );
      return toDate(sorted[0]!.date);
    }
  }
  const byEarliest = [...dated].sort((x, y) => new Date(x.date!).getTime() - new Date(y.date!).getTime());
  return byEarliest[0] ? toDate(byEarliest[0].date) : null;
}

/**
 * Перезаписывает поле `date` у строк матчей реальной датой фикстуры из
 * календаря (по сопернику + возрастной группе команды). Мутирует rows на месте
 * (свежий результат запроса, не общее состояние). Best-effort: при отсутствии
 * фикстуры дата остаётся прежней.
 */
export async function applyFixtureDates(conn: Queryable, slug: string, rows: DatedMatchRow[]): Promise<void> {
  if (!rows.length) return;
  const teamIds = [...new Set(rows.map((r) => r.teamId).filter((x): x is string => !!x))];
  if (!teamIds.length) return;

  const { rows: teamRows } = await conn.query(
    `SELECT id, age_group AS "ageGroup" FROM teams WHERE tenant_id = $1 AND id = ANY($2)`,
    [slug, teamIds],
  );
  const ageByTeam = new Map<string, string>();
  for (const t of teamRows) ageByTeam.set(String(t.id), String(t.ageGroup));

  const calByAge = new Map<string, CalFixture[]>();
  for (const age of new Set(ageByTeam.values())) {
    const { rows: cal } = await conn.query(
      `SELECT match_date AS "date", home_team AS "home", away_team AS "away",
              score_home AS "scoreH", score_away AS "scoreA"
         FROM calendar
        WHERE tenant_id = $1 AND age_group = $2 AND is_our_match = TRUE`,
      [slug, age],
    );
    calByAge.set(age, cal as unknown as CalFixture[]);
  }

  for (const m of rows) {
    const age = m.teamId ? ageByTeam.get(m.teamId) : undefined;
    if (!age) continue;
    const opp = opponentName(m);
    const score = m.scoreHome != null && m.scoreAway != null
      ? { home: Number(m.scoreHome), away: Number(m.scoreAway) }
      : null;
    const fx = pickFixtureDate(opp, m.date ?? null, score, calByAge.get(age) ?? []);
    if (fx) m.date = fx;
  }
}

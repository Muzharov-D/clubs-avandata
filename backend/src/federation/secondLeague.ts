/**
 * Вторая лига (детско-юношеская, ФФСПб) — календарь, таблица, клубный зачёт, видео.
 *
 * Источник — официальный FFSPB API через тот же Vercel-прокси, что и avandataSource
 * (Render заблокирован по IP от stat.ffspb.org). Турниры по возрастам:
 *   44336 = До 14 (2013), 44335 = До 15 (2012), 44334 = До 16 (2011), 44333 = До 17 (2010).
 * Внутри одного tournament_id FFSPB бундлит несколько тиров через ГРУППЫ standings
 * (Вторая/Третья/Четвёртая лига) — берём ТОЛЬКО группу groupName==='Вторая лига':
 *   её teams = таблица; её team.id = фильтр матчей (обе команды должны быть в группе).
 *
 * Видео — Big Bro (api.bigbro.ai): матчи аккаунта с `show_link_slug`; прямой mp4
 * панорамы = `matches[].video.origin` (публичный, играется в <video>). Стыковка
 * Big Bro↔FFSPB по нормализованным именам команд + дате.
 */
import { env } from '../env.js';
import { normTeam } from './teamName.js';

const SECOND_LEAGUE = 'Вторая лига';
// Прямой FFSPB быстрый (~3с); Vercel-прокси (обход IP-блока Render) бывает дико
// медленным (>60с). Поэтому: пробуем ПРЯМОЙ, при неудаче — прокси с большим таймаутом.
const FFSPB_DIRECT = 'https://stat.ffspb.org/api';
const FFSPB_PROXY = (process.env.FFSPB_API_BASE ?? 'https://clubs-avandata.vercel.app/ffspb-api').replace(/\/+$/, '');
const FFSPB_KEY = env.FFSPB_API_KEY ?? '';
const TTL = 30 * 60 * 1000;

export interface SlTournament { tid: number; age: string; year: number }
export const SL_TOURNAMENTS: SlTournament[] = [
  { tid: 44336, age: 'До 14', year: 2013 },
  { tid: 44335, age: 'До 15', year: 2012 },
  { tid: 44334, age: 'До 16', year: 2011 },
  { tid: 44333, age: 'До 17', year: 2010 },
];
export const slYears = (): number[] => SL_TOURNAMENTS.map((t) => t.year);
const tournamentByYear = (year: number): SlTournament | undefined => SL_TOURNAMENTS.find((t) => t.year === year);

export function isSecondLeagueConfigured(): boolean { return !!FFSPB_KEY; }

// ── кеш ──────────────────────────────────────────────────────────────────────
const cache = new Map<string, { at: number; val: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.val as T;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}

// ── FFSPB: прямой (быстро) → прокси (фолбэк) ─────────────────────────────────
async function ffspbFetch(base: string, path: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/ld+json', 'X-AUTH-TOKEN': FFSPB_KEY },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`FFSPB ${res.status} ${base}${path}`);
  return (await res.json()) as Record<string, unknown>;
}
async function ffspbGet(path: string): Promise<Record<string, unknown>> {
  // Прямой stat.ffspb.org быстрый (~3с). Если недоступен (IP-блок Render) —
  // фолбэк на Vercel-прокси с большим таймаутом (прокси бывает дико медленным).
  // 4xx (напр. 401) не фолбэчим — ключ/путь и на прокси те же.
  try {
    return await ffspbFetch(FFSPB_DIRECT, path, 12000);
  } catch (e) {
    const msg = String((e as Error)?.message ?? '');
    if (/FFSPB 4\d\d/.test(msg)) throw e;
    return await ffspbFetch(FFSPB_PROXY, path, 50000);
  }
}
const members = (d: Record<string, unknown>): Array<Record<string, unknown>> =>
  (d['hydra:member'] as Array<Record<string, unknown>> | undefined) ?? [];

// ── Таблица + состав группы «Вторая лига» ────────────────────────────────────
export interface SlStandRow {
  position: number | null; teamId: number | null; team: string; logo: string | null;
  games: number; wins: number; draws: number; losses: number;
  scored: number; missed: number; diff: number; points: number;
}
interface SlGroup { teamIds: Set<number>; table: SlStandRow[] }

async function secondLeagueGroup(tid: number): Promise<SlGroup> {
  return cached(`sl:group:${tid}`, TTL, async () => {
    const d = await ffspbGet(`/standings?tournament=/api/tournaments/${tid}&itemsPerPage=100`);
    const g = members(d).find((m) => m.groupName === SECOND_LEAGUE);
    if (!g) return { teamIds: new Set<number>(), table: [] };
    const rows = (g.teams as Array<Record<string, unknown>> | undefined) ?? [];
    const table: SlStandRow[] = rows.map((t) => {
      const team = (t.team as Record<string, unknown> | undefined) ?? {};
      const s = (t.stats as Record<string, unknown> | undefined) ?? {};
      const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
      const scored = num(s.scored), missed = num(s.missed);
      return {
        position: typeof t.position === 'number' ? t.position : null,
        teamId: typeof team.id === 'number' ? team.id : null,
        team: (team.name as string) || (t.teamName as string) || '—',
        logo: (team.logoSrc as string) || null,
        games: num(s.games), wins: num(s.wins), draws: num(s.draws), losses: num(s.loses),
        scored, missed, diff: s.difference != null ? num(s.difference) : scored - missed, points: num(s.points),
      };
    }).sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const teamIds = new Set<number>(table.map((r) => r.teamId).filter((x): x is number => x != null));
    return { teamIds, table };
  });
}

// ── Календарь (только матчи Второй лиги) ─────────────────────────────────────
export interface SlMatch {
  id: number; date: string | null; tour: number | null;
  home: string; away: string; homeLogo: string | null; awayLogo: string | null;
  score: string | null; scoreHome: number | null; scoreAway: number | null; played: boolean;
  techDefeat: boolean; venue: string | null;
  videoSlug?: string | null;
}
const nm = (x: unknown): string | null => (x && typeof x === 'object' ? ((x as Record<string, unknown>).name as string) : (x as string)) ?? null;

async function secondLeagueMatches(tid: number): Promise<{ matches: SlMatch[]; teamIds: Set<number> }> {
  const grp = await secondLeagueGroup(tid);
  const raw = await cached(`sl:matches:${tid}`, TTL, async () => {
    const all: Array<Record<string, unknown>> = [];
    let next: string | null = `/matches?tournament_id=${tid}&itemsPerPage=100`;
    let safety = 20;
    while (next && safety-- > 0) {
      const d: Record<string, unknown> = await ffspbGet(next);
      for (const m of members(d)) all.push(m);
      const view = d['hydra:view'] as Record<string, unknown> | undefined;
      const nx = view?.['hydra:next'] as string | undefined;
      next = nx ? nx.replace(/^.*\/api/, '') : null;
    }
    return all;
  });
  const kept = grp.teamIds.size
    ? raw.filter((m) => {
        const h = (m.host as Record<string, unknown> | undefined)?.id;
        const a = (m.guest as Record<string, unknown> | undefined)?.id;
        return typeof h === 'number' && typeof a === 'number' && grp.teamIds.has(h) && grp.teamIds.has(a);
      })
    : raw;
  const matches: SlMatch[] = kept.map((m) => {
    const vr = String(m.viewResult ?? '').trim();
    const mm = vr.match(/^(\d+)\s*:\s*(\d+)$/);
    const host = m.host as Record<string, unknown> | undefined;
    const guest = m.guest as Record<string, unknown> | undefined;
    return {
      id: m.id as number,
      date: (m.publicDate as string) || (m.date as string) || null,
      tour: (m.tourId as number) ?? null,
      home: nm(m.host) || (m.hostName as string) || '—',
      away: nm(m.guest) || (m.guestName as string) || '—',
      homeLogo: (host?.logoSrc as string) || null,
      awayLogo: (guest?.logoSrc as string) || null,
      score: mm ? vr : null,
      scoreHome: mm ? Number(mm[1]) : null,
      scoreAway: mm ? Number(mm[2]) : null,
      played: !!mm,
      techDefeat: !!m.technicalDefeat,
      venue: nm(m.location),
    };
  }).sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  return { matches, teamIds: grp.teamIds };
}

// ── Big Bro: видео-матчи аккаунта + стыковка ─────────────────────────────────
interface BbVideo { home: string; away: string; day: string | null; year: number | null; slug: string; status: string | null }

let _bbTok: string | null = null; let _bbTokAt = 0;
const BB_TIMEOUT = 8000;
async function bbToken(): Promise<string> {
  if (_bbTok && Date.now() - _bbTokAt < 9 * 24 * 3600e3) return _bbTok;
  const res = await fetch(`${env.BIGBRO_ENDPOINT}/api/auth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.BIGBRO_USERNAME, password: env.BIGBRO_PASSWORD }),
    signal: AbortSignal.timeout(BB_TIMEOUT),
  });
  if (!res.ok) throw new Error(`BigBro auth ${res.status}`);
  _bbTok = ((await res.json()) as { access: string }).access; _bbTokAt = Date.now();
  return _bbTok;
}
export function isBigbroConfigured(): boolean { return !!(env.BIGBRO_USERNAME && env.BIGBRO_PASSWORD); }
const bandYear = (name: string | null): number | null => { const m = String(name ?? '').match(/20\d{2}/); return m ? Number(m[0]) : null; };

async function bbVideos(): Promise<BbVideo[]> {
  if (!isBigbroConfigured()) return [];
  // Устойчиво: если Big Bro недоступен/медленный (напр. блок по IP с Render) —
  // НЕ виснем (таймаут на каждый фетч) и НЕ роняем календарь (catch → []).
  // Ошибку не кешируем (throw внутри cached не кешируется) — следующий заход ретраит.
  try {
    return await cached('sl:bbvideos', 6 * 60 * 60 * 1000, async () => {
    const tok = await bbToken();
    const out: BbVideo[] = [];
    let page = 1; let safety = 50;
    while (safety-- > 0) {
      const r = await fetch(`${env.BIGBRO_ENDPOINT}/api/activities/?page=${page}`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(BB_TIMEOUT) });
      if (!r.ok) break;
      const d = (await r.json()) as { results?: Array<Record<string, unknown>>; next?: string | null };
      for (const a of d.results ?? []) {
        const home = (a.home_team_name as string) || null, away = (a.guest_team_name as string) || null;
        const slug = (a.show_link_slug as string) || null;
        if (!home || !away || !slug) continue;
        const date = (a.activity_date as string) || null;
        out.push({ home, away, day: date ? date.slice(0, 10) : null, year: bandYear(home) || bandYear(away), slug, status: (a.status as string) || null });
      }
      if (!d.next) break;
      page++;
    }
    // дедуп на матч (home|away|day), предпочесть ready/ordinary
    const rank = (o: BbVideo) => (o.status === 'ready' ? 2 : o.status === 'ordinary' ? 1 : 0);
    const by = new Map<string, BbVideo>();
    for (const o of out) {
      const k = `${o.home.toLowerCase()}|${o.away.toLowerCase()}|${o.day}`;
      const prev = by.get(k);
      if (!prev || rank(o) > rank(prev)) by.set(k, o);
    }
    return [...by.values()];
    });
  } catch { return []; }
}

// Толерантная стыковка имён (срез года/ФК/СШ через normTeam + перекрытие токенов).
const toks = (s: string): Set<string> => new Set(normTeam(s).split(' ').filter((t) => t.length > 1));
function teamSim(a: string, b: string): number {
  const ta = toks(a), tb = toks(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  if (inter === ta.size && inter === tb.size) return 1;
  return inter / Math.min(ta.size, tb.size);
}
const pairScore = (h1: string, a1: string, h2: string, a2: string): number =>
  Math.max(teamSim(h1, h2) + teamSim(a1, a2), teamSim(h1, a2) + teamSim(a1, h2));

async function attachVideos(matches: SlMatch[], year: number): Promise<void> {
  const vids = (await bbVideos()).filter((v) => v.year === year);
  if (!vids.length) return;
  const byDay = new Map<string, SlMatch[]>();
  for (const m of matches) { const d = (m.date ?? '').slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(m); }
  for (const v of vids) {
    const cands = byDay.get(v.day ?? '') ?? [];
    let best: SlMatch | null = null, bestScore = 0;
    for (const m of cands) { const s = pairScore(v.home, v.away, m.home, m.away); if (s > bestScore) { bestScore = s; best = m; } }
    if (best && bestScore >= 1.4 && !best.videoSlug) best.videoSlug = v.slug;
  }
}

// ── Публичное API для роутов ─────────────────────────────────────────────────
export interface SlAgeData { age: string; year: number; ageTitle: string | null; total: number; matches: SlMatch[]; table: SlStandRow[] }

export async function secondLeagueAge(year: number): Promise<SlAgeData | null> {
  const t = tournamentByYear(year);
  if (!t) return null;
  const grp = await secondLeagueGroup(t.tid);
  const { matches } = await secondLeagueMatches(t.tid);
  // лого команд в таблице добираем из матчей (в standings бывает пусто)
  const logoById = new Map<number, string>();
  // (логотип в standings уже есть; матчи дублируют по имени — пропустим)
  await attachVideos(matches, year).catch(() => undefined);
  void logoById;
  return { age: t.age, year, ageTitle: null, total: matches.length, matches, table: grp.table };
}

// Клубный зачёт «сумма мест» по всем возрастам (как в legirus).
const PREFIX_RE = /^\s*(ГБУ\s+ДО|МОУ|ГБОУ|СШОР|СШ|ФК|ФШМ)\s+/i;
function clubKey(name: string): string {
  let s = String(name || '').replace(/\s*\([^)]*\)\s*/g, ' ');
  for (let i = 0; i < 5; i++) { const n = s.replace(PREFIX_RE, ''); if (n === s) break; s = n; }
  return s.replace(/[№#]\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
const clubDisplay = (name: string): string => String(name || '').replace(/\s*\((ЦФКСиЗ\s+ВО|ГБУ\s+ДО)[^)]*\)\s*/i, '').trim();

export interface SlClubRow {
  rank: number; name: string; logo: string | null; posSum: number; participated: number;
  points: number; diff: number; breakdown: Record<number, { pos: number | null; total: number }>;
}
export async function secondLeagueClubRanking(): Promise<{ years: number[]; ranking: SlClubRow[] }> {
  const perAge = await Promise.all(SL_TOURNAMENTS.map(async (t) => ({ year: t.year, table: (await secondLeagueGroup(t.tid)).table })));
  const years = SL_TOURNAMENTS.map((t) => t.year);
  const sizeByYear = new Map(perAge.map((p) => [p.year, p.table.length]));
  const agg = new Map<string, { name: string; logo: string | null; points: number; scored: number; missed: number; breakdown: Record<number, { pos: number | null; total: number }> }>();
  for (const { year, table } of perAge) {
    for (const row of table) {
      const key = clubKey(row.team);
      if (!key) continue;
      const cur = agg.get(key) ?? { name: clubDisplay(row.team), logo: row.logo, points: 0, scored: 0, missed: 0, breakdown: {} };
      cur.points += row.points; cur.scored += row.scored; cur.missed += row.missed;
      cur.breakdown[year] = { pos: row.position, total: sizeByYear.get(year) ?? 0 };
      if (!cur.logo && row.logo) cur.logo = row.logo;
      agg.set(key, cur);
    }
  }
  const clubs = [...agg.values()].map((c) => {
    let posSum = 0, participated = 0;
    for (const y of years) {
      const it = c.breakdown[y];
      if (it && it.pos) { posSum += it.pos; participated++; } else posSum += (sizeByYear.get(y) ?? 10) + 1;
    }
    return { ...c, posSum, participated, diff: c.scored - c.missed };
  });
  clubs.sort((a, b) => a.posSum - b.posSum || b.participated - a.participated || b.diff - a.diff || b.points - a.points);
  const ranking: SlClubRow[] = clubs.map((c, i) => ({
    rank: i + 1, name: c.name, logo: c.logo, posSum: c.posSum, participated: c.participated,
    points: c.points, diff: c.diff, breakdown: c.breakdown,
  }));
  return { years, ranking };
}

// Прямые видео-файлы матча (панорама) по слагу Big Bro.
export async function secondLeagueMatchVideo(slug: string): Promise<{ status: string | null; name: string | null; parts: string[] }> {
  if (!isBigbroConfigured()) return { status: null, name: null, parts: [] };
  let tok: string;
  try { tok = await bbToken(); } catch { return { status: null, name: null, parts: [] }; }
  const r = await fetch(`${env.BIGBRO_ENDPOINT}/api/activities?show_link_slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(BB_TIMEOUT) }).catch(() => null);
  if (!r || !r.ok) return { status: null, name: null, parts: [] };
  const d = (await r.json()) as { results?: Array<Record<string, unknown>> };
  const r0 = (d.results ?? [])[0];
  if (!r0) return { status: null, name: null, parts: [] };
  const parts = ((r0.matches as Array<Record<string, unknown>> | undefined) ?? [])
    .map((m) => { const v = m.video as Record<string, unknown> | undefined; return v && v.is_loaded && typeof v.origin === 'string' ? (v.origin as string) : null; })
    .filter((x): x is string => !!x);
  return { status: (r0.status as string) || null, name: (r0.name as string) || null, parts };
}

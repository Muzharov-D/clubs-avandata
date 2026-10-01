/**
 * Срез кабинета: весь холдинг, одна школа или одна команда (школа × год рождения).
 * Живёт в адресе (?club=&year=), поэтому переживает переходы и им можно поделиться.
 * Каждая страница фильтрует свои списки через scopeAnalytics / scopeChanges / inScope.
 */
import { useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useHoldingProfile, useSlugQuery, shortClub, type HoldingAnalytics, type HoldingChanges } from './api';

export interface Scope { club: string | null; year: number | null }
type Scoped = { clubKey?: string | null; teamKey?: string | null; birthYear?: number | null; year?: number | null };

/** Текущий срез: на странице команды — сама команда, иначе — из адреса. */
export function useScope(): Scope {
  const [sp] = useSearchParams();
  const { pathname } = useLocation();
  return useMemo(() => {
    const m = /^\/holding\/teams\/([^/]+)/.exec(pathname);
    if (m) { const [club, y] = decodeURIComponent(m[1]!).split(':'); return { club: club ?? null, year: y ? Number(y) : null }; }
    const y = Number(sp.get('year'));
    return { club: sp.get('club') || null, year: Number.isFinite(y) && y > 1900 ? y : null };
  }, [sp, pathname]);
}

/** Суффикс ссылок: slug федерации + срез. Для запросов к API — useSlugQuery (без среза). */
export function useNavQuery(): string {
  const slugQ = useSlugQuery();
  const s = useScope();
  const p = new URLSearchParams(slugQ.slice(1));
  // На странице команды срез — из пути; при уходе на другие разделы переносим его в адрес.
  if (s.club) p.set('club', s.club);
  if (s.year) p.set('year', String(s.year));
  const str = p.toString();
  return str ? `?${str}` : '';
}

const keyOf = (x: Scoped): { club: string | null; year: number | null } => {
  if (x.teamKey) { const [c, y] = x.teamKey.split(':'); return { club: c ?? null, year: y ? Number(y) : null }; }
  return { club: x.clubKey ?? null, year: x.year ?? x.birthYear ?? null };
};
export const inScope = (s: Scope, x: Scoped): boolean => {
  if (!s.club && !s.year) return true;
  const k = keyOf(x);
  return (!s.club || k.club === s.club) && (!s.year || k.year === s.year);
};

export function scopeAnalytics(a: HoldingAnalytics, s: Scope): HoldingAnalytics {
  if (!s.club && !s.year) return a;
  const f = <T extends Scoped>(xs: T[]) => xs.filter((x) => inScope(s, x));
  return {
    ...a,
    teams: f(a.teams.map((t) => ({ ...t, teamKey: t.key }))),
    youth: { ready: f(a.youth.ready), watch: f(a.youth.watch), rest: f(a.youth.rest) },
    promote: f(a.promote), olderAge: f(a.olderAge), risk: f(a.risk), losing: f(a.losing),
    selection: f(a.selection), weakLines: f(a.weakLines), strongLines: f(a.strongLines), players: f(a.players),
  };
}

export function scopeChanges(c: HoldingChanges, s: Scope): HoldingChanges {
  if (!s.club && !s.year) return c;
  const f = <T extends Scoped>(xs: T[]) => xs.filter((x) => inScope(s, x));
  return {
    ...c,
    lists: c.lists.map((l) => ({ ...l, entered: f(l.entered), left: f(l.left) })),
    risers: f(c.risers), fallers: f(c.fallers), newRated: f(c.newRated),
    lines: { sagged: f(c.lines.sagged), improved: f(c.lines.improved) },
    teams: f(c.teams.map((t) => ({ ...t, teamKey: t.key }))),
    selection: f(c.selection),
  };
}

/** Подпись среза для заголовков: «ФК Динамо · 2011», «Царское Село», «2012 г.р. обеих школ». */
export function useScopeLabel(): string | null {
  const s = useScope();
  const profile = useHoldingProfile();
  if (!s.club && !s.year) return null;
  const m = profile.data?.members.find((x) => x.key === s.club);
  const club = m ? shortClub(m.label) : null;
  if (club && s.year) return `${club} · ${s.year}`;
  if (club) return club;
  return `${s.year} г.р. · обе школы`;
}

/**
 * Переключатель среза под верхней полосой: школа и год. На странице команды смена
 * школы/года ведёт на соседнюю команду, сброс — обратно на брифинг холдинга.
 */
export function ScopeBar() {
  const s = useScope();
  const profile = useHoldingProfile();
  const slugQ = useSlugQuery();
  const [sp, setSp] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const members = profile.data?.members ?? [];
  const teams = profile.data?.teams ?? [];
  const years = [...new Set(teams.map((t) => t.year))].sort((a, b) => b - a);
  const ageOf = (y: number) => teams.find((t) => t.year === y)?.ageTitle.replace(/^до\s*/, 'U').replace(/\s*лет$/, '') ?? '';
  const onTeam = pathname.startsWith('/holding/teams/');

  function set(next: Scope) {
    if (onTeam) {
      // Со страницы команды: на соседнюю команду или на брифинг со срезом.
      if (next.club && next.year && teams.some((t) => t.key === `${next.club}:${next.year}`)) { navigate(`/holding/teams/${encodeURIComponent(`${next.club}:${next.year}`)}${slugQ}`); return; }
      const p = new URLSearchParams(slugQ.slice(1));
      if (next.club) p.set('club', next.club); if (next.year) p.set('year', String(next.year));
      navigate(`/holding${p.toString() ? '?' + p.toString() : ''}`);
      return;
    }
    const p = new URLSearchParams(sp);
    if (next.club) p.set('club', next.club); else p.delete('club');
    if (next.year) p.set('year', String(next.year)); else p.delete('year');
    setSp(p, { replace: true });
  }
  if (!members.length) return null;
  const team = s.club && s.year ? teams.find((t) => t.key === `${s.club}:${s.year}`) : null;

  return (
    <div className="hd-scope" role="toolbar" aria-label="Срез: холдинг, школа или команда">
      <div className="hd-scope__inner">
        <div className="hd-seg" role="group" aria-label="Школа">
          <button type="button" className={`hd-seg__btn${!s.club ? ' hd-seg__btn--on' : ''}`} onClick={() => set({ club: null, year: s.year })}>Весь холдинг</button>
          {members.map((m) => <button key={m.key} type="button" className={`hd-seg__btn${s.club === m.key ? ' hd-seg__btn--on' : ''}`} onClick={() => set({ club: m.key, year: s.year })}>{shortClub(m.label)}</button>)}
        </div>
        <div className="hd-seg" role="group" aria-label="Год рождения">
          <button type="button" className={`hd-seg__btn${!s.year ? ' hd-seg__btn--on' : ''}`} onClick={() => set({ club: s.club, year: null })}>Все годы</button>
          {years.map((y) => <button key={y} type="button" className={`hd-seg__btn${s.year === y ? ' hd-seg__btn--on' : ''}`} onClick={() => set({ club: s.club, year: y })}>{y}<span className="hd-seg__sub">{ageOf(y)}</span></button>)}
        </div>
        {team && !onTeam && <Link to={`/holding/teams/${encodeURIComponent(team.key)}${slugQ}`} className="hd-link hd-scope__team">Страница команды →</Link>}
        {onTeam && <Link to={`/holding${slugQ}`} className="hd-link hd-scope__team">← Весь холдинг</Link>}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { FedError } from '../federation/FedState';
import { PlayerAvatar } from '../federation/PlayerAvatar';
import { ratingColor } from '../federation/ratings';
import { useHoldingAnalytics, useSlugQuery, num, pm, shortClub, shortPos, plMatch, CATEGORY_TITLE, LINE_TITLE, type CompareResponse, type CompareSide, type PlayerMetricRow } from './api';
import { SectionTitle } from './parts';

/**
 * Сравнение двух игроков бок о бок по 36 показателям: наш и кандидат селекции (без имени)
 * или два кандидата в молодёжку. Показатель — за матч; перцентиль — внутри своего амплуа
 * и дивизиона, поэтому видно и «кто больше делает», и «кто сильнее среди своих».
 */
export function HoldingComparePage() {
  const [sp, setSp] = useSearchParams();
  const a = sp.get('a') ?? '', b = sp.get('b') ?? '';
  const slugQ = useSlugQuery();
  const an = useHoldingAnalytics();
  const setSide = (k: 'a' | 'b', v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  const cmp = useQuery({
    queryKey: ['holding', 'compare', a, b, slugQ],
    queryFn: () => api<CompareResponse | { status: 'warming' }>(`/holding/compare?a=${a}&b=${b}${slugQ ? '&' + slugQ.slice(1) : ''}`),
    enabled: !!a && !!b && a !== b,
    refetchInterval: (s) => { const d = s.state.data; return d && (!('a' in d) || d.status === 'warming') ? 10_000 : false; },
    refetchIntervalInBackground: true,
  });

  // Варианты выбора: игроки холдинга по командам + кандидаты селекции без имён.
  const options = useMemo(() => {
    const d = an.data; if (!d) return null;
    const teams = d.teams.slice().sort((x, y) => (y.year - x.year) || x.clubLabel.localeCompare(y.clubLabel, 'ru')).map((t) => ({
      label: `${shortClub(t.clubLabel)} ${t.year}`,
      players: t.squad.filter((p) => p.rating != null).map((p) => ({ id: p.id, label: `${p.name} · ${shortPos(p.position)} · ${num(p.rating as number)}` })),
    }));
    const seen = new Set<number>();
    const cands = d.selection.flatMap((g) => g.candidates.map((c) => ({ g, c }))).filter(({ c }) => !seen.has(c.id) && seen.add(c.id))
      .map(({ g, c }) => ({ id: c.id, label: `${g.year} · ${shortPos(c.position)} · ${c.club} · топ ${c.pctRegion}% · ${num(c.rating)}` }));
    return { teams, cands };
  }, [an.data]);

  const res = cmp.data && 'a' in cmp.data ? cmp.data : null;
  return (
    <div>
      <div className="fed-hero" style={{ marginBottom: 16 }}>
        <h1 className="fed-hero__title" style={{ fontSize: 30 }}>Сравнение игроков</h1>
        <p className="fed-hero__sub" style={{ fontSize: 14 }}>Два игрока бок о бок по всем показателям: за матч и место среди своего амплуа в лиге. Кандидаты селекции — без имён.</p>
      </div>

      <div className="hc-compare-pick">
        {(['a', 'b'] as const).map((k) => (
          <label key={k} className="hc-compare-pick__side">
            <span className="hc-muted hc-small">{k === 'a' ? 'Первый игрок' : 'Второй игрок'}</span>
            <select className="fed-select" value={k === 'a' ? a : b} onChange={(e) => setSide(k, e.target.value)} disabled={!options}>
              <option value="">{options ? 'выберите игрока…' : 'загружаем список…'}</option>
              {options?.teams.map((t) => <optgroup key={t.label} label={t.label}>{t.players.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}
              {options && options.cands.length > 0 && <optgroup label="Кандидаты селекции (без имён)">{options.cands.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>}
            </select>
          </label>
        ))}
      </div>

      {(!a || !b) && <div className="fed-note" style={{ marginTop: 16 }}>Выберите двух игроков. Из «Решений» сравнение открывается кнопкой у кандидата селекции — с лучшим игроком нашей линии.</div>}
      {a && b && a === b && <div className="fed-note" style={{ marginTop: 16 }}>Выбран один и тот же игрок.</div>}
      {cmp.error && <FedError subject="Сравнение" />}
      {a && b && a !== b && !res && !cmp.error && <div className="fed-skeleton" style={{ height: 400, marginTop: 16 }} />}
      {res && <CompareBody r={res} q={slugQ} />}
    </div>
  );
}

const sideName = (s: CompareSide) => (s.anonymous ? `Кандидат · ${shortPos(s.position)}` : s.name ?? '—');
const fmt = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

function SideHead({ s, q }: { s: CompareSide; q: string }) {
  return (
    <div className="hc-compare-head">
      {s.anonymous ? <div className="hc-anon" aria-hidden>?</div> : <PlayerAvatar name={s.name ?? ''} photoUrl={s.photo} size={56} />}
      <div style={{ minWidth: 0 }}>
        <div className="hc-compare-head__name">{s.anonymous ? sideName(s) : <Link to={`/holding/players/${s.id}${q}`} className="hc-player">{s.name}</Link>}</div>
        <div className="hc-muted hc-small">{s.club} {s.birthYear} · {s.position ?? (s.line ? LINE_TITLE[s.line] : '—')} · {s.division}</div>
        <div className="hc-compare-head__nums">
          <span style={{ color: ratingColor(s.rating) }} className="hc-rating">{s.rating != null ? num(s.rating) : '—'}</span>
          {s.pctRegion != null && <span className={`hc-pct ${s.pctRegion <= 10 ? 'hc-pct--elite' : s.pctRegion <= 25 ? 'hc-pct--good' : s.pctRegion <= 50 ? 'hc-pct--mid' : 'hc-pct--low'}`}>топ {s.pctRegion}%</span>}
          <span className="hc-muted hc-small">{s.rankRegion != null ? `${s.rankRegion}-й из ${s.sizeRegion}` : ''} · {s.mp} {plMatch(s.mp)}{s.trend != null ? ` · тренд ${pm(s.trend)}` : ''}</span>
        </div>
        {!s.anonymous && <Link to={`/holding/players/${s.id}/card${q}`} className="fed-link hc-small">Карточка кандидата →</Link>}
      </div>
    </div>
  );
}

function CompareBody({ r, q }: { r: CompareResponse; q: string }) {
  const { a, b } = r;
  const ready = !!a.metrics && !!b.metrics;
  const rows = useMemo(() => {
    if (!a.metrics || !b.metrics) return [];
    const byB = new Map(b.metrics.rows.map((x) => [x.id, x]));
    const ids = new Set([...a.metrics.rows.map((x) => x.id), ...b.metrics.rows.map((x) => x.id)]);
    const byA = new Map(a.metrics.rows.map((x) => [x.id, x]));
    return [...ids].map((id) => ({ id, ra: byA.get(id) ?? null, rb: byB.get(id) ?? null }))
      .map(({ id, ra, rb }) => {
        const base = (ra ?? rb) as PlayerMetricRow;
        const va = ra?.perMatch ?? 0, vb = rb?.perMatch ?? 0;
        const neg = base.points < 0;
        const winner = Math.abs(va - vb) < 0.05 * Math.max(va, vb, 0.1) ? null : (neg ? va < vb : va > vb) ? 'a' : 'b';
        return { id, title: base.title, category: base.category, points: base.points, neg, ra, rb, va, vb, winner };
      })
      .sort((x, y) => Math.abs(y.points) * Math.max(y.va, y.vb) - Math.abs(x.points) * Math.max(x.va, x.vb));
  }, [a.metrics, b.metrics]);
  const winsA = rows.filter((x) => x.winner === 'a'), winsB = rows.filter((x) => x.winner === 'b');
  // Где разница заметнее всего — по перцентилю внутри амплуа.
  const gap = (x: (typeof rows)[number]) => (x.ra?.pctileDiv ?? 0) - (x.rb?.pctileDiv ?? 0);
  const topA = rows.filter((x) => x.winner === 'a' && x.points > 0).sort((x, y) => gap(y) - gap(x)).slice(0, 3).map((x) => x.title);
  const topB = rows.filter((x) => x.winner === 'b' && x.points > 0).sort((x, y) => gap(x) - gap(y)).slice(0, 3).map((x) => x.title);
  const cats = ['attack', 'pass', 'defense', 'general', 'other'].filter((c) => rows.some((x) => x.category === c));

  return (
    <>
      <div className="hc-compare-heads">
        <SideHead s={a} q={q} />
        <div className="hc-compare-vs">—</div>
        <SideHead s={b} q={q} />
      </div>

      {!ready ? <div className="fed-note" style={{ marginTop: 16 }}>Считаем показатели когорты — несколько минут после запуска сервера. Страница обновится сама.</div> : (
        <>
          <section className="fed-card hc-compare-sum">
            <div><b>{sideName(a)}</b> лучше в {winsA.length} показателях{topA.length ? `: сильнее всего — ${topA.map((t) => `«${t}»`).join(', ')}` : ''}.</div>
            <div><b>{sideName(b)}</b> лучше в {winsB.length} показателях{topB.length ? `: сильнее всего — ${topB.map((t) => `«${t}»`).join(', ')}` : ''}.</div>
            <div className="hc-muted hc-small">Разобранных матчей: {a.metrics!.matches} и {b.metrics!.matches}. Перцентиль — место среди своего амплуа в своём дивизионе.</div>
          </section>

          <SectionTitle>Показатели за матч</SectionTitle>
          {cats.map((c) => (
            <section key={c} className="fed-card hc-metrics__cat" style={{ marginBottom: 12 }}>
              <div className="hc-metrics__cat-title">{CATEGORY_TITLE[c] ?? c}</div>
              <table className="fed-table hc-table hc-compare-table">
                <thead><tr><th>Показатель</th><th className="fed-table__num">{sideName(a)}</th><th>среди амплуа</th><th className="fed-table__num">{sideName(b)}</th><th>среди амплуа</th></tr></thead>
                <tbody>
                  {rows.filter((x) => x.category === c).map((x) => (
                    <tr key={x.id}>
                      <td>{x.title}{x.neg ? <span className="hc-muted hc-small"> · меньше — лучше</span> : null}</td>
                      <td className={`fed-table__num ${x.winner === 'a' ? 'hc-win' : ''}`}>{fmt(x.va)}</td>
                      <td><Pbar p={x.ra?.pctileDiv ?? null} /></td>
                      <td className={`fed-table__num ${x.winner === 'b' ? 'hc-win' : ''}`}>{fmt(x.vb)}</td>
                      <td><Pbar p={x.rb?.pctileDiv ?? null} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function Pbar({ p }: { p: number | null }) {
  if (p == null) return <span className="hc-muted hc-small">—</span>;
  return (
    <span className="hc-pbar" title={`лучше ${p}% своего амплуа в дивизионе`}>
      <span className={`hc-pbar__fill${p >= 70 ? ' hc-pbar__fill--good' : p <= 30 ? ' hc-pbar__fill--bad' : ''}`} style={{ width: `${p}%` }} />
      <span className="hc-pbar__label">{p}%</span>
    </span>
  );
}

import { Fragment, useMemo, useState, type ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { FedError } from '../federation/FedState';
import { PlayerAvatar } from '../federation/PlayerAvatar';
import { Sparkline } from '../../components/Sparkline';
// Сравнение Легируса (.jsx): «пицца на пиццу».
import ComparePizzaJs from '../../components/analytics/ComparePizza';
import '../../components/analytics/ComparePizza.css';
import '../../pages/PlayerCompare.css';
import '../../components/analytics/analytics.css';
import { useHoldingAnalytics, useSlugQuery, num, shortClub, shortPos, CATEGORY_TITLE, CATEGORY_ORDER, LINE_TITLE, type CompareResponse, type CompareSide, type PlayerMetricRow, type MetricGroup } from './api';
import { MetricName, Pbar } from './parts';
import { HdLoading } from './HoldingShell';
import { useNavQuery } from './scope';

const ComparePizza = ComparePizzaJs as unknown as ComponentType<Record<string, unknown>>;

interface SeasonSlice { key: string; name: string; short: string; description: string; group: MetricGroup; polarity: 1 | -1; value: number | null; ratio: boolean; pct: number | null }
interface SideSeason { index: number | null; indexPct: number | null; rank: number | null; peers: number; minutes: number; matches: number; matchLen: number; archetype: { name: string; tagline: string }; slices: SeasonSlice[]; series: Array<{ overall: number | null }> }
type Side = CompareSide & { season: SideSeason | null };

const sideName = (s: CompareSide) => (s.anonymous ? `Кандидат · ${shortPos(s.position)}` : s.name ?? '—');
const fmtVal = (s: SeasonSlice | undefined) => (!s || s.value == null ? '—' : s.ratio ? `${Math.round(s.value)}%` : s.value >= 10 ? s.value.toFixed(0) : s.value.toFixed(1));
const PEERS: Record<string, string> = { GK: 'вратарей', DEF: 'защитников', MID: 'полузащитников', FWD: 'нападающих' };

/**
 * Сравнение двух игроков — как в клубном кабинете Легируса: встречные полоски по
 * показателям за полный матч, тренд по матчам и «пицца на пиццу». Кандидат селекции —
 * без имени. У каждого перцентиль — среди сверстников своей позиции в регионе.
 */
export function HoldingComparePage() {
  const [sp, setSp] = useSearchParams();
  const a = sp.get('a') ?? '', b = sp.get('b') ?? '';
  const slugQ = useSlugQuery();
  const q = useNavQuery();
  const an = useHoldingAnalytics();
  const [mode, setMode] = useState<'bars' | 'pizza' | 'all'>('bars');
  const setSide = (k: 'a' | 'b', v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  const cmp = useQuery({
    queryKey: ['holding', 'compare', a, b, slugQ],
    queryFn: () => api<(CompareResponse & { a: Side; b: Side }) | { status: 'warming' }>(`/holding/compare?a=${a}&b=${b}${slugQ ? '&' + slugQ.slice(1) : ''}`),
    enabled: !!a && !!b && a !== b,
    refetchInterval: (s) => { const d = s.state.data; return d && (!('a' in d) || d.status === 'warming') ? 10_000 : false; },
    refetchIntervalInBackground: true,
  });

  // Варианты: игроки холдинга по командам + кандидаты селекции без имён.
  const options = useMemo(() => {
    const d = an.data; if (!d) return null;
    const teams = d.teams.slice().sort((x, y) => (y.year - x.year) || x.clubLabel.localeCompare(y.clubLabel, 'ru')).map((t) => ({
      label: `${shortClub(t.clubLabel)} ${t.year}`,
      players: t.squad.filter((p) => p.rating != null).map((p) => ({ id: p.id, label: `${p.name} · ${shortPos(p.position)}${p.index != null ? ` · ${p.index.toFixed(1)}` : ''}` })),
    }));
    const seen = new Set<number>();
    const cands = d.selection.flatMap((g) => g.candidates.map((c) => ({ g, c }))).filter(({ c }) => !seen.has(c.id) && seen.add(c.id))
      .map(({ g, c }) => ({ id: c.id, label: `${g.year} · ${shortPos(c.position)} · ${c.club} · топ ${c.pctRegion}%` }));
    return { teams, cands };
  }, [an.data]);

  const res = cmp.data && 'a' in cmp.data ? cmp.data : null;
  return (
    <div className="player-compare">
      <h1 className="player-compare__title">Сравнение игроков</h1>

      <div className="card player-compare__pickers">
        {(['a', 'b'] as const).map((k, i) => (
          <Fragment key={k}>
            {i === 1 && <div className="pc-vs">—</div>}
            <label className="pc-picker">
              <span>{k === 'a' ? 'Игрок A' : 'Игрок B'}</span>
              <select className="fed-select" value={k === 'a' ? a : b} onChange={(e) => setSide(k, e.target.value)} disabled={!options}>
                <option value="">{options ? 'выберите игрока…' : 'загружаем список…'}</option>
                {options?.teams.map((t) => <optgroup key={t.label} label={t.label}>{t.players.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}
                {options && options.cands.length > 0 && <optgroup label="Кандидаты селекции (без имён)">{options.cands.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>}
              </select>
            </label>
          </Fragment>
        ))}
      </div>

      {(!a || !b) && <div className="hd-empty">Выберите двух игроков. Из «Решений» сравнение открывается у кандидата селекции — с лучшим игроком нашей линии.</div>}
      {a && b && a === b && <div className="hd-empty">Выбран один и тот же игрок.</div>}
      {cmp.error && <FedError subject="Сравнение" />}
      {a && b && a !== b && !res && !cmp.error && <HdLoading title="Сравниваем" text="Считаем профили обоих игроков против сверстников их позиции." />}

      {res && (
        <>
          <div className="hd-cmp-heads">
            <Head s={res.a} q={q} tone="a" />
            <Head s={res.b} q={q} tone="b" />
          </div>
          <div className="player-compare__modeswitch" role="tablist" aria-label="Режим сравнения">
            {([['bars', 'Показатели'], ['pizza', 'Профили'], ['all', 'Все показатели']] as const).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} className={`pc-mode${mode === k ? ' is-active' : ''}`} onClick={() => setMode(k)}>{t}</button>
            ))}
          </div>
          {mode === 'bars' && <Bars r={res} />}
          {mode === 'pizza' && <Pizza r={res} />}
          {mode === 'all' && <AllMetrics r={res} />}
        </>
      )}
    </div>
  );
}

function Head({ s, q, tone }: { s: Side; q: string; tone: 'a' | 'b' }) {
  const se = s.season;
  return (
    <div className={`card hd-cmp-head hd-cmp-head--${tone}`}>
      {s.anonymous ? <div className="hc-anon" aria-hidden>?</div> : <PlayerAvatar name={s.name ?? ''} photoUrl={s.photo} size={64} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="hd-cmp-head__name">{s.anonymous ? sideName(s) : <Link to={`/holding/players/${s.id}${q}`} className="hd-pname">{s.name}</Link>}</div>
        <div className="hd-muted hd-small">{s.line ? LINE_TITLE[s.line] : s.position ?? '—'} · {s.anonymous ? s.club : shortClub(s.club)} {s.birthYear} · {s.division}</div>
        {se && <div className="hd-cmp-head__dna"><b>{se.archetype.name}</b> — {se.archetype.tagline}</div>}
        {se && <div className="hd-muted hd-small">{se.matches} матчей · {se.minutes} минут{se.index != null && s.line ? ` · лучше ${Math.round(se.indexPct ?? 0)}% ${PEERS[s.line]}` : ''}</div>}
      </div>
      {se?.index != null && <div className="hd-cmp-head__idx"><span>{se.index.toFixed(1)}</span><small>индекс</small></div>}
    </div>
  );
}

function Bars({ r }: { r: { a: Side; b: Side } }) {
  const sa = r.a.season, sb = r.b.season;
  if (!sa || !sb) return <HdLoading title="Считаем профили" text="Показатели когорты ещё собираются — страница обновится сама." />;
  const keys = sa.slices.map((x) => x.key).filter((k) => sb.slices.some((y) => y.key === k));
  const serA = sa.series.map((x) => x.overall).filter((v): v is number => v != null);
  const serB = sb.series.map((x) => x.overall).filter((v): v is number => v != null);
  const rows: Array<{ key: string; label: string; description?: string; av: number | null; bv: number | null; fa: string; fb: string; neg: boolean }> = [
    { key: 'index', label: 'Индекс сезона', av: sa.index, bv: sb.index, fa: sa.index?.toFixed(1) ?? '—', fb: sb.index?.toFixed(1) ?? '—', neg: false },
    ...keys.map((k) => {
      const x = sa.slices.find((s) => s.key === k)!, y = sb.slices.find((s) => s.key === k)!;
      return { key: k, label: x.name, description: x.description, av: x.value, bv: y.value, fa: fmtVal(x), fb: fmtVal(y), neg: x.polarity < 0 };
    }),
    { key: 'minutes', label: 'Минут на поле', av: sa.minutes, bv: sb.minutes, fa: num(sa.minutes), fb: num(sb.minutes), neg: false },
  ];
  const trends: Array<[string, Side, number[], string]> = [['a', r.a, serA, 'var(--brand-primary)'], ['b', r.b, serB, 'var(--rating-good)']];
  return (
    <>
      <div className="card player-compare__trend">
        {trends.map(([k, s, ser, color]) => (
          <div className="pc-trend__col" key={k}>
            <div className="pc-trend__name">{sideName(s)}</div>
            {ser.length >= 2 ? <Sparkline values={ser} width={160} height={40} color={color} /> : <span className="pc-trend__none">нет тренда</span>}
            <div className="pc-trend__cap">индекс по матчам (из 10)</div>
          </div>
        ))}
      </div>
      <div className="card player-compare__rows">
        {rows.map((row) => {
          const av = row.av ?? 0, bv = row.bv ?? 0;
          const aWin = row.neg ? av < bv : av > bv, bWin = row.neg ? bv < av : bv > av;
          const total = Math.abs(av) + Math.abs(bv);
          // У «меньше — лучше» полоска отдаёт место тому, у кого меньше.
          const aShare = total > 0 ? (row.neg ? bv / total : av / total) * 100 : 50;
          return (
            <div className="pc-row" key={row.key}>
              <span className={`pc-row__a${aWin ? ' pc-row__win' : ''}`}>{row.fa}</span>
              <span className="pc-row__mid">
                <span className="pc-row__label">{row.description ? <MetricName title={row.label} description={row.description} negative={row.neg} /> : row.label}</span>
                <div className="cmp-bar" role="img" aria-label={`${row.label}: ${row.fa} и ${row.fb}`}><div className="cmp-bar__a" style={{ width: `${aShare}%` }} /><div className="cmp-bar__b" style={{ width: `${100 - aShare}%` }} /></div>
              </span>
              <span className={`pc-row__b${bWin ? ' pc-row__win' : ''}`}>{row.fb}</span>
            </div>
          );
        })}
        <div className="an-note">Показатели — за полный матч своего возраста; доли — в процентах. Каждый сравнивается со сверстниками своей позиции в регионе.</div>
      </div>
    </>
  );
}

function Pizza({ r }: { r: { a: Side; b: Side } }) {
  const sa = r.a.season, sb = r.b.season;
  if (!sa || !sb) return <HdLoading title="Считаем профили" text="Показатели когорты ещё собираются — страница обновится сама." />;
  const slices = sa.slices.filter((x) => x.pct != null).flatMap((x) => {
    const y = sb.slices.find((s) => s.key === x.key);
    return y?.pct != null ? [{ axis: x.short, a: x.pct, b: y.pct, t: 50 }] : [];
  });
  if (slices.length < 3) return <div className="hd-empty">Мало данных для наложения профилей — у одного из игроков меньше 45 минут.</div>;
  return (
    <div className="card player-compare__pizza">
      <div className="page-section-title">Наложение профилей <span className="an-model-tag">перцентиль среди своей позиции · пунктир — середина региона</span></div>
      <ComparePizza slices={slices} nameA={sideName(r.a)} nameB={sideName(r.b)} />
    </div>
  );
}

/** Все показатели бок о бок — подробная таблица. */
function AllMetrics({ r }: { r: { a: CompareSide; b: CompareSide } }) {
  const { a, b } = r;
  const rows = useMemo(() => {
    if (!a.metrics || !b.metrics) return [];
    const byA = new Map(a.metrics.rows.map((x) => [x.id, x]));
    const byB = new Map(b.metrics.rows.map((x) => [x.id, x]));
    const ids = [...new Set([...a.metrics.rows.map((x) => x.id), ...b.metrics.rows.map((x) => x.id)])];
    return ids.map((id) => {
      const ra = byA.get(id) ?? null, rb = byB.get(id) ?? null;
      const base = (ra ?? rb) as PlayerMetricRow;
      return { id, title: base.title, description: base.description, category: base.category, neg: base.polarity < 0, ra, rb };
    });
  }, [a.metrics, b.metrics]);
  if (!a.metrics || !b.metrics) return <HdLoading title="Считаем показатели" text="Показатели когорты ещё собираются." />;
  const f = (x: number | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
  return (
    <>
      {CATEGORY_ORDER.filter((c) => rows.some((x) => x.category === c)).map((c) => (
        <div key={c} className="card an">
          <div className="page-section-title">{CATEGORY_TITLE[c]}</div>
          <div className="hd-scroll">
            <table className="hd-table hd-table--tight">
              <thead><tr><th>Показатель</th><th className="num">{sideName(a)}</th><th>среди позиции</th><th className="num">{sideName(b)}</th><th>среди позиции</th></tr></thead>
              <tbody>
                {rows.filter((x) => x.category === c).map((x) => (
                  <tr key={x.id}>
                    <td><MetricName title={x.title} description={x.description} negative={x.neg} /></td>
                    <td className="num" style={{ fontWeight: 700 }}>{f(x.ra?.perMatch)}</td><td><Pbar p={x.ra?.pctileDiv ?? null} /></td>
                    <td className="num" style={{ fontWeight: 700 }}>{f(x.rb?.perMatch)}</td><td><Pbar p={x.rb?.pctileDiv ?? null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

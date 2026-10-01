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
import { useHoldingAnalytics, useSlugQuery, num, shortClub, shortPos, groupOfPosition, groupOf, GROUP_TITLE, GROUPS, CATEGORY_TITLE, CATEGORY_ORDER, LINE_TITLE, type CompareResponse, type CompareSide, type PlayerMetricRow, type MetricGroup, type PositionGroup } from './api';
import { MetricName, Pbar } from './parts';
import { HdLoading } from './HoldingShell';
import { useNavQuery } from './scope';
import { IndexRing } from './viz';

const ComparePizza = ComparePizzaJs as unknown as ComponentType<Record<string, unknown>>;

interface SeasonSlice { key: string; name: string; short: string; description: string; group: MetricGroup; polarity: 1 | -1; value: number | null; ratio: boolean; pct: number | null }
interface SideSeason { peersWord: string; groupTitle: string | null; index: number | null; indexPct: number | null; rank: number | null; peers: number; minutes: number; matches: number; matchLen: number; archetype: { name: string; tagline: string }; slices: SeasonSlice[]; series: Array<{ overall: number | null }> }
type Side = CompareSide & { season: SideSeason | null };

const sideName = (s: CompareSide) => (s.anonymous ? `Кандидат · ${(() => { const g = groupOfPosition(s.position); return g ? GROUP_TITLE[g].toLowerCase() : shortPos(s.position); })()}` : s.name ?? '—');
const fmtVal = (s: SeasonSlice | undefined) => (!s || s.value == null ? '—' : s.ratio ? `${Math.round(s.value)}%` : s.value >= 10 ? s.value.toFixed(0) : s.value.toFixed(1));

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

  // Кого можно выбрать: все игроки холдинга + кандидаты селекции (без имён).
  const pool = useMemo<PickItem[]>(() => {
    const d = an.data; if (!d) return [];
    const own: PickItem[] = d.teams.flatMap((t) => t.squad.map((p) => ({
      id: p.id, name: p.name, anonymous: false, club: t.clubKey, clubLabel: shortClub(t.clubLabel), year: p.birthYear,
      group: groupOf(p), position: p.position, index: p.index, pct: p.pctRegion, minutes: p.minutes,
    })));
    const seen = new Set<number>();
    const cands: PickItem[] = d.selection.flatMap((g) => g.candidates.map((c) => ({ g, c }))).filter(({ c }) => !seen.has(c.id) && seen.add(c.id))
      .map(({ g, c }) => ({ id: c.id, name: null, anonymous: true, club: 'candidate', clubLabel: c.club, year: g.year, group: groupOfPosition(c.position), position: c.position, index: c.index ?? null, pct: c.pctRegion, minutes: null }));
    return [...own, ...cands];
  }, [an.data]);
  const byId = useMemo(() => new Map(pool.map((x) => [String(x.id), x])), [pool]);
  const years = useMemo(() => [...new Set(pool.map((x) => x.year))].sort((x, y) => y - x), [pool]);
  const [editing, setEditing] = useState<'a' | 'b' | null>(null);
  const picking: 'a' | 'b' | null = editing ?? (!a ? 'a' : !b ? 'b' : null);

  const res = cmp.data && 'a' in cmp.data ? cmp.data : null;
  return (
    <div className="player-compare">
      <h1 className="player-compare__title">Сравнение игроков</h1>

      {/* Выбранные игроки: карточка или «выбрать» */}
      <div className="hd-cmp-slots">
        {(['a', 'b'] as const).map((k, i) => {
          const it = byId.get(k === 'a' ? a : b);
          return (
            <Fragment key={k}>
              {i === 1 && <div className="pc-vs">—</div>}
              <div className={`card hd-cmp-slot hd-cmp-slot--${k}${picking === k ? ' hd-cmp-slot--active' : ''}`}>
                <span className="hd-cmp-slot__label">Игрок {k === 'a' ? 'А' : 'Б'}</span>
                {it ? <PickRow it={it} /> : <span className="hd-muted">{an.data ? 'не выбран' : 'загружаем игроков…'}</span>}
                <button type="button" className="hd-btn" onClick={() => setEditing(picking === k ? null : k)}>{picking === k ? 'Готово' : it ? 'Изменить' : 'Выбрать'}</button>
              </div>
            </Fragment>
          );
        })}
      </div>

      {picking && an.data && (
        <PlayerPicker
          key={picking}
          pool={pool}
          years={years}
          exclude={picking === 'a' ? b : a}
          // Для второго игрока — тот же год и позиция, что у первого: сравнивать сопоставимых.
          initial={(() => { const other = byId.get(picking === 'a' ? b : a); return other ? { year: other.year, group: other.group } : {}; })()}
          title={`Выберите игрока ${picking === 'a' ? 'А' : 'Б'}`}
          onPick={(id) => { setSide(picking, String(id)); setEditing(null); }}
        />
      )}
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
        <div className="hd-muted hd-small">{se?.groupTitle ?? (s.line ? LINE_TITLE[s.line] : s.position ?? '—')} · {s.anonymous ? s.club : shortClub(s.club)} {s.birthYear} · {s.division}</div>
        {se && <div className="hd-cmp-head__dna"><b>{se.archetype.name}</b> — {se.archetype.tagline}</div>}
        {se && <div className="hd-muted hd-small">{se.matches} матчей · {se.minutes} минут{se.index != null ? ` · лучше ${Math.round(se.indexPct ?? 0)}% ${se.peersWord.replace(/\s+\d{4} г\.р\. региона$/, '')}` : ''}</div>}
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
  if (slices.length < 3) return <div className="hd-empty">Мало данных для наложения профилей — у одного из игроков меньше двух полных матчей на поле (б/о).</div>;
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

// ─── Выбор игрока: поиск и фильтры ────────────────────────────────────────────
interface PickItem { id: number; name: string | null; anonymous: boolean; club: string; clubLabel: string; year: number; group: PositionGroup | null; position: string | null; index: number | null; pct: number | null; minutes: number | null }

function PickRow({ it }: { it: PickItem }) {
  return (
    <span className="hd-pick">
      {it.anonymous ? <span className="hc-anon hd-pick__anon">?</span> : <IndexRing value={it.index} size={40} stroke={4} />}
      <span className="hd-pick__body">
        <span className="hd-pick__name">{it.anonymous ? `Кандидат · ${it.group ? GROUP_TITLE[it.group].toLowerCase() : shortPos(it.position)}` : it.name}</span>
        <span className="hd-pick__meta">{it.group ? GROUP_TITLE[it.group] : it.position ?? '—'} · {it.clubLabel} {it.year}{it.pct != null ? ` · топ ${it.pct}% региона` : ''}</span>
      </span>
    </span>
  );
}

function PlayerPicker({ pool, years, exclude, initial, title, onPick }: {
  pool: PickItem[]; years: number[]; exclude: string; initial: { year?: number; group?: PositionGroup | null }; title: string; onPick: (id: number) => void;
}) {
  const [text, setText] = useState('');
  const [who, setWho] = useState<'all' | 'dinamo' | 'cs' | 'candidate'>('all');
  const [year, setYear] = useState<number | null>(initial.year ?? null);
  const [group, setGroup] = useState<PositionGroup | null>(initial.group ?? null);
  const t = text.trim().toLowerCase();
  const list = pool.filter((x) => String(x.id) !== exclude
    && (who === 'all' || (who === 'candidate' ? x.anonymous : !x.anonymous && (who === 'cs' ? x.club.includes('царское') : !x.club.includes('царское'))))
    && (!year || x.year === year) && (!group || x.group === group)
    && (!t || (x.name ?? '').toLowerCase().includes(t) || x.clubLabel.toLowerCase().includes(t)))
    .sort((p, q2) => (q2.index ?? (q2.pct != null ? 10 - q2.pct / 10 : -1)) - (p.index ?? (p.pct != null ? 10 - p.pct / 10 : -1)));
  const chip = (on: boolean, label: string, onClick: () => void, key?: string) => <button key={key ?? label} type="button" className={`hd-fchip${on ? ' hd-fchip--on' : ''}`} onClick={onClick}>{label}</button>;
  return (
    <section className="card hd-picker">
      <div className="hd-picker__head">
        <b>{title}</b>
        <input className="hd-picker__search" type="search" placeholder="Поиск: фамилия, имя или команда" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </div>
      <div className="hd-picker__filters">
        <div className="hd-picker__row"><span>Кто</span>{chip(who === 'all', 'Все', () => setWho('all'))}{chip(who === 'dinamo', 'ФК Динамо', () => setWho('dinamo'))}{chip(who === 'cs', 'Царское Село', () => setWho('cs'))}{chip(who === 'candidate', 'Кандидаты селекции', () => setWho('candidate'))}</div>
        <div className="hd-picker__row"><span>Год</span>{chip(!year, 'Все', () => setYear(null))}{years.map((y) => chip(year === y, String(y), () => setYear(y), String(y)))}</div>
        <div className="hd-picker__row"><span>Позиция</span>{chip(!group, 'Все', () => setGroup(null))}{GROUPS.map((g) => chip(group === g, GROUP_TITLE[g], () => setGroup(g), g))}</div>
      </div>
      <div className="hd-picker__count">Найдено: {list.length}{list.length > 30 ? ' · показаны 30 сильнейших — уточните поиск или фильтры' : ''}</div>
      <div className="hd-picker__list">
        {list.slice(0, 30).map((x) => <button key={x.id} type="button" className="hd-picker__item" onClick={() => onPick(x.id)}><PickRow it={x} /></button>)}
        {list.length === 0 && <div className="hd-empty">Никого не нашли — снимите часть фильтров.</div>}
      </div>
    </section>
  );
}

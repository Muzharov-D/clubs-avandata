/**
 * Общие элементы кабинета холдинга в стиле «брифинга»: таблица игроков с контекстом
 * лиги, ячейки места/отклонения/тренда, ярусы, цифры-итоги, заголовки разделов,
 * таблицы показателей. Всё — про сравнение с лигой, а не голые числа.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LINE_TITLE, GROUP_TITLE, groupOf, CATEGORY_TITLE, CATEGORY_ORDER, num, pm, shortClub, type LeaguePlayer, type Line, type PlayerMetricRow, type TeamMetricRow } from './api';
import { useNavQuery } from './scope';

const lineWord: Record<Line, string> = { GK: 'вратарь', DEF: 'защитник', MID: 'полузащитник', FWD: 'нападающий' };

/** «Топ 8%» — насколько игрок высоко в своём возрасте по региону. */
export function PctBadge({ p }: { p: Pick<LeaguePlayer, 'pctRegion' | 'rankRegion' | 'sizeRegion' | 'birthYear'> }) {
  if (p.pctRegion == null) return <span className="hd-muted">—</span>;
  const cls = p.pctRegion <= 10 ? 'hd-tag--up' : p.pctRegion <= 25 ? 'hd-tag--brand' : p.pctRegion <= 50 ? '' : 'hd-tag--down';
  return <span className={`hd-tag ${cls}`} title={`${p.rankRegion}-й из ${p.sizeRegion} игроков ${p.birthYear} г.р. региона с рейтингом`}>топ {p.pctRegion}%</span>;
}

/** Место в регионе и дивизионе одной строкой. */
export function RankCell({ p }: { p: LeaguePlayer }) {
  if (p.rankRegion == null) return <span className="hd-muted">нет рейтинга</span>;
  return <span><b>{p.rankRegion}</b><span className="hd-muted">/{p.sizeRegion} в регионе</span>{p.rankDiv != null && <span className="hd-muted"> · {p.rankDiv}/{p.sizeDiv} в лиге</span>}</span>;
}

/** Отклонение от среднего по амплуа в дивизионе. */
export function DeltaCell({ p }: { p: LeaguePlayer }) {
  if (p.deltaLine == null || p.lineAvgDiv == null) return <span className="hd-muted">—</span>;
  const rel = p.deltaLine / p.lineAvgDiv;
  return <span className={rel >= 0.12 ? 'hd-up' : rel <= -0.12 ? 'hd-down' : ''} style={{ fontWeight: 600 }} title={`среднее по амплуа «${p.line ? LINE_TITLE[p.line] : '—'}» в лиге: ${num(p.lineAvgDiv)}`}>{pm(p.deltaLine)}</span>;
}

/** Индекс сезона 0–10 (как кольцо в профиле): цвет по шкале рейтинга. */
export function IndexCell({ p }: { p: LeaguePlayer }) {
  if (p.index == null) return <span className="hd-muted" title="Мало минут для сравнения или показатели ещё считаются">—</span>;
  const c = p.index >= 9 ? 'var(--rating-excellent)' : p.index >= 8 ? 'var(--rating-good)' : p.index >= 7 ? 'var(--rating-ok)' : p.index >= 6 ? 'var(--rating-weak)' : 'var(--rating-poor)';
  return <span className={`hd-index${p.lowSample ? ' hd-index--low' : ''}`} style={{ color: c }} title={`${p.lowSample ? 'предварительно: на поле меньше двух полных матчей · ' : ''}лучше ${Math.round(p.indexPct ?? 0)}% сверстников своей позиции · ${p.minutes ?? 0} мин`}>{p.index.toFixed(1)}</span>;
}

/** Тренд: последние оценки против сезона. */
export function TrendCell({ p }: { p: LeaguePlayer }) {
  if (p.formDelta != null) {
    const d = p.formDelta;
    const cls = d >= 0.5 ? 'hd-up' : d <= -0.5 ? 'hd-down' : 'hd-muted';
    return <span className={cls} style={{ fontWeight: 600, whiteSpace: 'nowrap' }} title="последние 3 матча против своего сезона, по шкале 5–10">{d >= 0.5 ? '↑' : d <= -0.5 ? '↓' : '→'} {d > 0 ? '+' : ''}{d.toFixed(1)}{!p.inRotation && <span className="hd-warn" style={{ fontWeight: 500 }}> · вне ротации</span>}</span>;
  }
  if (p.trend == null || p.rating == null) return <span className="hd-muted">{!p.inRotation ? 'вне ротации' : '—'}</span>;
  const rel = p.trend / p.rating;
  const arrow = rel >= 0.08 ? '↑' : rel <= -0.08 ? '↓' : '→';
  const cls = rel >= 0.08 ? 'hd-up' : rel <= -0.08 ? 'hd-down' : 'hd-muted';
  return (
    <span className={cls} style={{ fontWeight: 600, whiteSpace: 'nowrap' }} title={`последние матчи: ${p.last.join(', ')} · сезон ${num(p.rating)}`}>
      {arrow} {pm(p.trend)}{!p.inRotation && <span className="hd-warn" style={{ fontWeight: 500 }}> · вне ротации</span>}
    </span>
  );
}

export function TierBadge({ tier }: { tier: 'ready' | 'watch' | 'rest' }) {
  const map = { ready: ['hd-tag--up', 'готов'], watch: ['hd-tag--warn', 'присмотреться'], rest: ['', 'резерв'] } as const;
  const [cls, text] = map[tier];
  return <span className={`hd-tag ${cls}`}>{text}</span>;
}

export function LineBadge({ line }: { line: Line | null }) {
  return line ? <span className="hd-muted">{lineWord[line]}</span> : <span className="hd-muted">—</span>;
}

type SortKey = 'rating' | 'index' | 'pct' | 'delta' | 'trend' | 'mp' | 'name' | 'team';
const sorters: Record<SortKey, (a: LeaguePlayer, b: LeaguePlayer) => number> = {
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  index: (a, b) => (b.index ?? -1) - (a.index ?? -1),
  pct: (a, b) => (a.pctRegion ?? 999) - (b.pctRegion ?? 999),
  delta: (a, b) => (b.deltaLine ?? -9999) - (a.deltaLine ?? -9999),
  trend: (a, b) => (b.formDelta ?? (b.trend != null ? b.trend / 100 : -99)) - (a.formDelta ?? (a.trend != null ? a.trend / 100 : -99)),
  mp: (a, b) => b.mp - a.mp,
  name: (a, b) => a.name.localeCompare(b.name, 'ru'),
  team: (a, b) => a.team.localeCompare(b.team, 'ru') || (b.rating ?? -1) - (a.rating ?? -1),
};

/**
 * Таблица игроков с контекстом лиги. Колонки включаются пропсами: на странице команды не
 * нужна команда, в «молодёжке» нужен ярус. Сортировка — кликом по заголовку.
 */
export function PlayerTable({ players, showTeam = true, showTier = false, extra, extraTitle, emptyText = 'Игроков нет.', limit, rank }: {
  players: Array<LeaguePlayer & { tier?: 'ready' | 'watch' | 'rest'; reason?: 'trend' | 'rotation' }>;
  showTeam?: boolean; showTier?: boolean; extra?: (p: LeaguePlayer) => ReactNode; extraTitle?: string; emptyText?: string; limit?: number;
  /** Сохранить исходный порядок (очередь), а не сортировать по рейтингу. */
  rank?: boolean;
}) {
  const q = useNavQuery();
  const [sort, setSort] = useState<SortKey | null>(rank ? null : 'index');
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => (sort ? players.slice().sort(sorters[sort]) : players), [players, sort]);
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  const Th = ({ k, children, right }: { k: SortKey; children: ReactNode; right?: boolean }) => (
    <th className={right ? 'num' : undefined} aria-sort={sort === k ? 'descending' : undefined}>
      <button type="button" className={`hd-th${sort === k ? ' hd-th--on' : ''}`} onClick={() => setSort(k)}>{children}{sort === k ? ' ↓' : ''}</button>
    </th>
  );
  if (players.length === 0) return <div className="hd-empty">{emptyText}</div>;
  return (
    <>
      <div className="hd-scroll">
        <table className="hd-table">
          <thead>
            <tr>
              <th className="num" style={{ width: 32 }}>#</th>
              <Th k="name">Игрок</Th>
              {showTier && <th>Ярус</th>}
              <Th k="index" right>Индекс</Th>
              <Th k="pct">В регионе</Th>
              <Th k="trend">Форма</Th>
              <Th k="mp" right>Матчей</Th>
              {extra && <th>{extraTitle ?? ''}</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.id}>
                <td className="num hd-muted">{i + 1}</td>
                <td style={{ minWidth: 200 }}>
                  <Link to={`/holding/players/${p.id}${q}`} className="hd-pname">{p.name}</Link>
                  <span className="hd-team__sub">{showTeam ? `${shortClub(p.clubLabel)} ${p.birthYear} · ` : ''}{groupOf(p) ? GROUP_TITLE[groupOf(p)!].toLowerCase() : p.line ? lineWord[p.line] : p.position ?? '—'}</span>
                </td>
                {showTier && <td>{p.tier ? <TierBadge tier={p.tier} /> : p.reason ? <span className={`hd-tag ${p.reason === 'trend' ? 'hd-tag--down' : 'hd-tag--warn'}`}>{p.reason === 'trend' ? 'падение формы' : 'вне ротации'}</span> : null}</td>}
                <td className="num"><IndexCell p={p} /></td>
                <td style={{ whiteSpace: 'nowrap' }}><PctBadge p={p} /> <span className="hd-muted hd-small">{p.rankRegion != null ? `${p.rankRegion} из ${p.sizeRegion}` : ''}</span></td>
                <td><TrendCell p={p} /></td>
                <td className="num hd-muted">{p.mp}</td>
                {extra && <td className="hd-small">{extra(p)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && sorted.length > limit && (
        <button type="button" className="hd-more" onClick={() => setAll((v) => !v)}>{all ? 'Свернуть' : `Показать всех · ${sorted.length}`}</button>
      )}
    </>
  );
}

/** Крупная цифра с подписью. */
export function Kpi({ label, value, sub, accent, tone }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; tone?: 'good' | 'bad' | 'warn' }) {
  const cls = tone === 'good' ? ' hd-up' : tone === 'bad' ? ' hd-down' : tone === 'warn' ? ' hd-warn' : accent ? ' hd-brand' : '';
  return (
    <div className="hd-stat">
      <div className="hd-stat__label">{label}</div>
      <div className={`hd-stat__value${cls}`}>{value}</div>
      {sub && <div className="hd-stat__sub">{sub}</div>}
    </div>
  );
}

/** Заголовок раздела: антиква, линейка, короткое правило под ним. */
export function SectionTitle({ children, sub, id, right }: { children: ReactNode; sub?: ReactNode; id?: string; right?: ReactNode }) {
  return (
    <div id={id} className="hd-section" style={{ scrollMarginTop: 120, marginBottom: 12 }}>
      <div className="hd-section__head"><h2 className="hd-h2">{children}</h2>{right && <span className="hd-section__note">{right}</span>}</div>
      {sub && <p className="hd-section__lede">{sub}</p>}
    </div>
  );
}

/** Шапка страницы: рубрика, заголовок, вводка. */
export function PageHead({ kicker, title, lede, actions }: { kicker: ReactNode; title: ReactNode; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="hd-pagehead">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="hd-kicker">{kicker}</div>
        <h1 className="hd-h1">{title}</h1>
        {lede && <p className="hd-lede">{lede}</p>}
      </div>
      {actions && <div className="hd-pagehead__actions">{actions}</div>}
    </header>
  );
}

export const matchesWord = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };

// ─── Показатели относительно лиги ─────────────────────────────────────────────

/** Название показателя с «?» — описание из глоссария. Методику (веса) не показываем нигде. */
export function MetricName({ title, description, negative }: { title: string; description?: string; negative?: boolean }) {
  return (
    <span className="hd-mname">
      {title}
      {description && <span className="hd-help" tabIndex={0} role="note" aria-label={description} data-tip={`${description}${negative ? ' Чем меньше, тем лучше.' : ''}`}>?</span>}
    </span>
  );
}
const fmtRate = (x: number | null) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

/** Перцентиль полоской: доля амплуа, у которых показатель хуже. */
export function Pbar({ p, title }: { p: number | null; title?: string }) {
  if (p == null) return <span className="hd-muted hd-small">мало сверстников</span>;
  const cls = p >= 70 ? ' hd-pbar__fill--up' : p <= 30 ? ' hd-pbar__fill--down' : '';
  return <span className="hd-pbar" title={title ?? `лучше ${p}% своего амплуа в дивизионе`}><span className={`hd-pbar__fill${cls}`} style={{ width: `${Math.max(2, p)}%` }} /><span className="hd-pbar__label">{p}</span></span>;
}

/** Таблица показателей игрока: за матч, среднее по амплуа в лиге, перцентиль полоской. */
export function PlayerMetricsTable({ rows, peers }: { rows: PlayerMetricRow[]; peers?: number }) {
  const cats = CATEGORY_ORDER.filter((c) => rows.some((r) => r.category === c));
  if (rows.length === 0) return <div className="hd-empty">Событий в разобранных матчах пока нет.</div>;
  return (
    <div className="hd-metrics">
      {cats.map((c) => (
        <div key={c} className="hd-metrics__cat">
          <h4 className="hd-metrics__title">{CATEGORY_TITLE[c] ?? c}</h4>
          <table className="hd-table hd-table--tight">
            <thead><tr><th>Показатель</th><th className="num">За матч</th><th className="num">Амплуа в лиге</th><th>Среди амплуа</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.category === c).map((r) => (
                <tr key={r.id}>
                  <td><MetricName title={r.title} description={r.description} negative={r.polarity < 0} /></td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtRate(r.perMatch)}</td>
                  <td className="num hd-muted">{fmtRate(r.lineAvgDiv)}</td>
                  <td><Pbar p={r.pctileDiv} title={r.pctileDiv != null ? `лучше ${r.pctileDiv}% игроков своего амплуа в дивизионе (${r.peersDiv})` : undefined} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {peers != null && <p className="hd-muted hd-small" style={{ gridColumn: '1 / -1', margin: 0 }}>Полоска — доля игроков того же амплуа в дивизионе, у которых показатель за матч хуже (у минусовых событий — выше). Равные значения делят место пополам.</p>}
    </div>
  );
}

/** Таблица показателей команды: за матч, среднее по дивизиону, место среди команд. */
export function TeamMetricsTable({ rows }: { rows: TeamMetricRow[] }) {
  const cats = CATEGORY_ORDER.filter((c) => rows.some((r) => r.category === c));
  if (rows.length === 0) return <div className="hd-empty">Событий в разобранных матчах пока нет.</div>;
  return (
    <div className="hd-metrics">
      {cats.map((c) => (
        <div key={c} className="hd-metrics__cat">
          <h4 className="hd-metrics__title">{CATEGORY_TITLE[c] ?? c}</h4>
          <table className="hd-table hd-table--tight">
            <thead><tr><th>Показатель</th><th className="num">За матч</th><th className="num">Дивизион</th><th className="num">Место</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.category === c).map((r) => {
                const rel = r.divAvg ? (r.perMatch - r.divAvg) / r.divAvg : null;
                const neg = r.polarity < 0;
                const good = rel != null && (neg ? rel <= -0.15 : rel >= 0.15), bad = rel != null && (neg ? rel >= 0.15 : rel <= -0.15);
                return (
                  <tr key={r.id}>
                    <td><MetricName title={r.title} description={r.description} negative={neg} /></td>
                    <td className={`num ${good ? 'hd-up' : bad ? 'hd-down' : ''}`} style={{ fontWeight: 700 }}>{fmtRate(r.perMatch)}</td>
                    <td className="num hd-muted">{fmtRate(r.divAvg)}</td>
                    <td className="num">{r.rankDiv != null ? <span className={r.rankDiv <= 2 ? 'hd-up' : r.rankDiv > Math.ceil(r.sizeDiv / 2) ? 'hd-down' : ''} style={{ fontWeight: 600 }}>{r.rankDiv}<span className="hd-muted" style={{ fontWeight: 400 }}>/{r.sizeDiv}</span></span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

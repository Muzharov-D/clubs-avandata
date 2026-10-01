/**
 * Общие элементы кабинета холдинга: таблица игроков с контекстом лиги, ячейки
 * рейтинга/места/тренда, бейджи ярусов. Всё — про сравнение с лигой, а не голые числа.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PlayerAvatar } from '../federation/PlayerAvatar';
import { ratingColor, ratingLabel } from '../federation/ratings';
import { LINE_TITLE, num, pm, plMatch, shortClub, shortPos, type LeaguePlayer, type Line } from './api';

/** «Топ 8%» — насколько игрок высоко в своём возрасте по региону. */
export function PctBadge({ p }: { p: LeaguePlayer }) {
  if (p.pctRegion == null) return <span className="hc-muted">—</span>;
  const cls = p.pctRegion <= 10 ? 'hc-pct--elite' : p.pctRegion <= 25 ? 'hc-pct--good' : p.pctRegion <= 50 ? 'hc-pct--mid' : 'hc-pct--low';
  return <span className={`hc-pct ${cls}`} title={`${p.rankRegion}-й из ${p.sizeRegion} игроков ${p.birthYear} г.р. региона с рейтингом`}>топ {p.pctRegion}%</span>;
}

/** Место в регионе и дивизионе одной строкой. */
export function RankCell({ p }: { p: LeaguePlayer }) {
  if (p.rankRegion == null) return <span className="hc-muted">нет рейтинга</span>;
  return (
    <span className="hc-rank">
      <b>{p.rankRegion}</b><span className="hc-muted">/{p.sizeRegion} в регионе</span>
      {p.rankDiv != null && <span className="hc-muted"> · {p.rankDiv}/{p.sizeDiv} в лиге</span>}
    </span>
  );
}

/** Отклонение от среднего по амплуа в дивизионе. */
export function DeltaCell({ p }: { p: LeaguePlayer }) {
  if (p.deltaLine == null || p.lineAvgDiv == null) return <span className="hc-muted">—</span>;
  const rel = p.deltaLine / p.lineAvgDiv;
  const cls = rel >= 0.12 ? 'hc-delta--up' : rel <= -0.12 ? 'hc-delta--down' : '';
  return <span className={`hc-delta ${cls}`} title={`среднее по амплуа «${p.line ? LINE_TITLE[p.line] : '—'}» в лиге: ${num(p.lineAvgDiv)}`}>{pm(p.deltaLine)}</span>;
}

/** Тренд: последние оценки против сезона; стрелка + числа последних матчей. */
export function TrendCell({ p }: { p: LeaguePlayer }) {
  if (p.trend == null || p.rating == null) return <span className="hc-muted">{p.last.length ? p.last.join(' · ') : '—'}</span>;
  const rel = p.trend / p.rating;
  const arrow = rel >= 0.08 ? '↑' : rel <= -0.08 ? '↓' : '→';
  const cls = rel >= 0.08 ? 'hc-trend--up' : rel <= -0.08 ? 'hc-trend--down' : 'hc-trend--flat';
  return (
    <span className={`hc-trend ${cls}`} title={`последние матчи: ${p.last.join(', ')} · сезон ${num(p.rating)}`}>
      {arrow} {pm(p.trend)}{!p.inRotation && <span className="hc-flag" title="не попадал в оценённые составы последние туры"> · вне ротации</span>}
    </span>
  );
}

export function TierBadge({ tier }: { tier: 'ready' | 'watch' | 'rest' }) {
  const map = { ready: ['hc-tier--ready', 'готов'], watch: ['hc-tier--watch', 'присмотреться'], rest: ['hc-tier--rest', 'в резерве'] } as const;
  const [cls, text] = map[tier];
  return <span className={`hc-tier ${cls}`}>{text}</span>;
}

export function LineBadge({ line }: { line: Line | null }) {
  if (!line) return <span className="hc-muted">—</span>;
  return <span className={`hc-line hc-line--${line.toLowerCase()}`}>{LINE_TITLE[line]}</span>;
}

type SortKey = 'rating' | 'pct' | 'delta' | 'trend' | 'mp' | 'name' | 'team';
const sorters: Record<SortKey, (a: LeaguePlayer, b: LeaguePlayer) => number> = {
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  pct: (a, b) => (a.pctRegion ?? 999) - (b.pctRegion ?? 999),
  delta: (a, b) => (b.deltaLine ?? -9999) - (a.deltaLine ?? -9999),
  trend: (a, b) => (b.trend ?? -9999) - (a.trend ?? -9999),
  mp: (a, b) => b.mp - a.mp,
  name: (a, b) => a.name.localeCompare(b.name, 'ru'),
  team: (a, b) => a.team.localeCompare(b.team, 'ru') || (b.rating ?? -1) - (a.rating ?? -1),
};

/**
 * Таблица игроков с контекстом лиги. Колонки включаются пропсами: на странице команды не
 * нужна команда, в «молодёжке» нужен ярус. Сортировка — кликом по заголовку.
 */
export function PlayerTable({ players, showTeam = true, showTier = false, extra, emptyText = 'Игроков нет.', limit }: {
  players: Array<LeaguePlayer & { tier?: 'ready' | 'watch' | 'rest'; reason?: 'trend' | 'rotation' }>;
  showTeam?: boolean; showTier?: boolean; extra?: (p: LeaguePlayer) => ReactNode; emptyText?: string; limit?: number;
}) {
  const [sort, setSort] = useState<SortKey>('rating');
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => players.slice().sort(sorters[sort]), [players, sort]);
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  const Th = ({ k, children, right }: { k: SortKey; children: ReactNode; right?: boolean }) => (
    <th className={`${right ? 'hc-th--num' : ''}${sort === k ? ' hc-th--active' : ''}`}><button type="button" className="hc-th-btn" onClick={() => setSort(k)}>{children}{sort === k ? ' ▾' : ''}</button></th>
  );
  if (players.length === 0) return <div className="fed-note">{emptyText}</div>;
  return (
    <>
      <div className="hc-table-wrap">
        <table className="fed-table hc-table">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <Th k="name">Игрок</Th>
              {showTeam && <Th k="team">Команда</Th>}
              <th>Амплуа</th>
              {showTier && <th>Ярус</th>}
              <Th k="rating" right>Рейтинг</Th>
              <Th k="pct">Место в регионе</Th>
              <Th k="delta" right>К амплуа лиги</Th>
              <Th k="trend">Тренд</Th>
              <Th k="mp" right>Матчей</Th>
              {extra && <th />}
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.id}>
                <td className="fed-table__num hc-muted">{i + 1}</td>
                <td>
                  <Link to={`/holding/players/${p.id}`} className="hc-player">
                    <PlayerAvatar name={p.name} photoUrl={p.photo} size={28} />
                    <span className="hc-player__name">{p.name}</span>
                  </Link>
                </td>
                {showTeam && <td><Link to={`/holding/teams/${encodeURIComponent(p.teamKey)}`} className="hc-teamlink">{shortClub(p.clubLabel)} <span className="hc-muted">{p.birthYear}</span></Link></td>}
                <td><span className="hc-pos" title={p.position ?? ''}>{shortPos(p.position)}</span></td>
                {showTier && <td>{p.tier ? <TierBadge tier={p.tier} /> : p.reason ? <span className="hc-tier hc-tier--rest">{p.reason === 'trend' ? 'падение формы' : 'вне ротации'}</span> : null}</td>}
                <td className="fed-table__num hc-rating" style={{ color: ratingColor(p.rating) }}>{ratingLabel(p.rating)}</td>
                <td><PctBadge p={p} /> <span className="hc-muted hc-small">{p.rankRegion != null ? `${p.rankRegion} из ${p.sizeRegion}` : ''}</span></td>
                <td className="fed-table__num"><DeltaCell p={p} /></td>
                <td><TrendCell p={p} /></td>
                <td className="fed-table__num hc-muted">{p.mp}</td>
                {extra && <td>{extra(p)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && sorted.length > limit && (
        <button type="button" className="fed-link hold-more" onClick={() => setAll((v) => !v)}>{all ? 'Свернуть' : `Показать всех (${sorted.length})`}</button>
      )}
    </>
  );
}

/** Крупная цифра с подписью — «крыша» страниц. */
export function Kpi({ label, value, sub, accent, tone }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; tone?: 'good' | 'bad' | 'warn' }) {
  const cls = tone === 'good' ? ' fed-metric__value--success' : tone === 'bad' ? ' fed-metric__value--danger' : tone === 'warn' ? ' fed-metric__value--warning' : accent ? ' hold-metric__value--accent' : '';
  return (
    <div className="fed-metric hold-metric hc-kpi">
      <div className="fed-metric__label">{label}</div>
      <div className={`fed-metric__value hold-metric__value${cls}`}>{value}</div>
      {sub && <div className="fed-metric__extra">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, sub, id }: { children: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: 16 }}>
      <div className="fed-divider"><h2 className="fed-divider__title">{children}</h2><div className="fed-divider__line" /></div>
      {sub && <p className="fed-note" style={{ marginTop: -8, marginBottom: 14 }}>{sub}</p>}
    </div>
  );
}

export const matchesWord = plMatch;

// ─── Показатели относительно лиги ─────────────────────────────────────────────
import { CATEGORY_TITLE, type PlayerMetricRow, type TeamMetricRow } from './api';

const fmtRate = (x: number | null) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

/** Таблица показателей игрока: за матч, среднее по амплуа в лиге, перцентиль полоской. */
export function PlayerMetricsTable({ rows, peers }: { rows: PlayerMetricRow[]; peers?: number }) {
  const cats = ['attack', 'pass', 'defense', 'general', 'other'].filter((c) => rows.some((r) => r.category === c));
  if (rows.length === 0) return <div className="fed-note">Событий в разобранных матчах пока нет.</div>;
  return (
    <div className="hc-metrics">
      {cats.map((c) => (
        <div key={c} className="hc-metrics__cat">
          <div className="hc-metrics__cat-title">{CATEGORY_TITLE[c] ?? c}</div>
          <table className="fed-table hc-table hc-metrics__table">
            <thead><tr><th>Показатель</th><th className="fed-table__num">За матч</th><th className="fed-table__num">Амплуа в лиге</th><th className="fed-table__num">Регион</th><th>Место среди амплуа</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.category === c).map((r) => {
                const neg = r.points < 0;
                const good = r.pctileDiv != null && r.pctileDiv >= 70, bad = r.pctileDiv != null && r.pctileDiv <= 30;
                return (
                  <tr key={r.id}>
                    <td><span title={`${r.count} за сезон · ${r.points > 0 ? '+' : ''}${r.points} очков за событие`}>{r.title}{neg ? <span className="hc-muted hc-small"> · чем меньше, тем лучше</span> : null}</span></td>
                    <td className="fed-table__num" style={{ fontWeight: 700 }}>{fmtRate(r.perMatch)}</td>
                    <td className="fed-table__num hc-muted">{fmtRate(r.lineAvgDiv)}</td>
                    <td className="fed-table__num hc-muted">{fmtRate(r.lineAvgRegion)}</td>
                    <td>
                      {r.pctileDiv == null ? <span className="hc-muted hc-small">мало сверстников</span> : (
                        <span className="hc-pbar" title={`лучше ${r.pctileDiv}% игроков своего амплуа в дивизионе (${r.peersDiv})`}>
                          <span className={`hc-pbar__fill${good ? ' hc-pbar__fill--good' : bad ? ' hc-pbar__fill--bad' : ''}`} style={{ width: `${r.pctileDiv}%` }} />
                          <span className="hc-pbar__label">{r.pctileDiv}%</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {peers != null && <p className="fed-note">Перцентиль — доля игроков того же амплуа в дивизионе, у которых показатель за матч ниже (для минусовых событий — выше). Считается по всем разобранным матчам когорты.</p>}
    </div>
  );
}

/** Таблица показателей команды: за матч, среднее по дивизиону, место среди команд. */
export function TeamMetricsTable({ rows }: { rows: TeamMetricRow[] }) {
  const cats = ['attack', 'pass', 'defense', 'general', 'other'].filter((c) => rows.some((r) => r.category === c));
  if (rows.length === 0) return <div className="fed-note">Событий в разобранных матчах пока нет.</div>;
  return (
    <div className="hc-metrics">
      {cats.map((c) => (
        <div key={c} className="hc-metrics__cat">
          <div className="hc-metrics__cat-title">{CATEGORY_TITLE[c] ?? c}</div>
          <table className="fed-table hc-table hc-metrics__table">
            <thead><tr><th>Показатель</th><th className="fed-table__num">За матч</th><th className="fed-table__num">Дивизион</th><th>Место</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.category === c).map((r) => {
                const rel = r.divAvg ? (r.perMatch - r.divAvg) / r.divAvg : null;
                const neg = r.points < 0;
                const good = rel != null && (neg ? rel <= -0.15 : rel >= 0.15), bad = rel != null && (neg ? rel >= 0.15 : rel <= -0.15);
                return (
                  <tr key={r.id}>
                    <td>{r.title}{neg ? <span className="hc-muted hc-small"> · чем меньше, тем лучше</span> : null}</td>
                    <td className="fed-table__num" style={{ fontWeight: 700, color: good ? 'var(--success)' : bad ? 'var(--danger)' : undefined }}>{fmtRate(r.perMatch)}</td>
                    <td className="fed-table__num hc-muted">{fmtRate(r.divAvg)}</td>
                    <td>{r.rankDiv != null ? <span className={`hc-pct ${r.rankDiv <= 2 ? 'hc-pct--elite' : r.rankDiv <= Math.ceil(r.sizeDiv / 2) ? 'hc-pct--good' : 'hc-pct--low'}`}>{r.rankDiv}-е из {r.sizeDiv}</span> : '—'}</td>
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

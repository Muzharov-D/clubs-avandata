import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { ratingColor } from '../federation/ratings';
import { useHoldingChanges, useHoldingTimeline, useSlugQuery, num, pm, shortClub, fmtDay, LIST_SHORT, LIST_ANCHOR, LINE_TITLE, type DiffPlayer, type ListChange, type LineChange, type TimelinePoint, type ListKey } from './api';
import { Kpi, SectionTitle } from './parts';

/**
 * Динамика — что изменилось за неделю: кто вошёл в списки решений и кто вышел, кто вырос
 * и упал относительно своего возраста, где просела линия. База — недельный снимок;
 * пока снимков нет — состояние тур назад (реконструкция по матчам).
 */
export function HoldingChanges() {
  const [base, setBase] = useState('week');
  const ch = useHoldingChanges(base);
  const q = useSlugQuery();
  if (ch.error) return <FedError subject="Динамика" />;
  const c = ch.data;

  return (
    <div>
      <div className="fed-hero" style={{ marginBottom: 16 }}>
        <h1 className="fed-hero__title" style={{ fontSize: 30 }}>Что изменилось</h1>
        <p className="fed-hero__sub" style={{ fontSize: 14 }}>Кто вошёл в списки решений и кто вышел, кто вырос относительно своего возраста, где просела линия. Снимок решений пишется раз в неделю.</p>
      </div>

      <div className="hc-basebar">
        <span className="hc-muted">Сравнить с:</span>
        <select className="fed-select" value={base} onChange={(e) => setBase(e.target.value)} aria-label="База сравнения">
          <option value="week">неделю назад</option>
          {[1, 2, 3, 4, 6, 8].filter((n) => !c || n <= Math.max(1, c.maxToursBack)).map((n) => <option key={n} value={`tours:${n}`}>{n === 1 ? 'тур назад' : `${n} ${n < 5 ? 'тура' : 'туров'} назад`}</option>)}
          {c?.snapshots.map((s) => <option key={s.id} value={`snap:${s.id}`}>снимок от {fmtDay(s.capturedAt)}</option>)}
        </select>
        {c && <span className="fed-badge">{c.base.label}</span>}
        {c && c.base.kind === 'tours' && base === 'week' && <span className="hc-muted hc-small">недельных снимков пока нет — сравниваем с состоянием тур назад, восстановленным по матчам</span>}
      </div>

      {ch.isLoading || !c ? <div><div className="fed-skeleton" style={{ height: 120, margin: '16px 0' }} /><div className="fed-skeleton" style={{ height: 360 }} /></div> : (
        <>
          <div className="fed-grid fed-grid--4 hold-kpi" style={{ marginTop: 16 }}>
            <Kpi label="Вошли в списки" value={c.lists.reduce((s, l) => s + l.entered.length, 0)} sub={c.lists.filter((l) => l.entered.length).map((l) => `${l.entered.length} · ${LIST_SHORT[l.key]}`).join(' · ') || 'без изменений'} accent />
            <Kpi label="Выросли" value={c.risers.length} sub="поднялись в регионе своего возраста на 3+ п.п." tone={c.risers.length ? 'good' : undefined} />
            <Kpi label="Упали" value={c.fallers.length} sub="опустились в регионе на 3+ п.п." tone={c.fallers.length ? 'bad' : undefined} />
            <Kpi label="Просели линии" value={c.lines.sagged.length} sub={`${c.lines.improved.length} линий выросли к лиге`} tone={c.lines.sagged.length ? 'warn' : undefined} />
          </div>

          <SectionTitle sub="Списки «Решений» сейчас против базы. Вошёл — впервые прошёл порог, вышел — перестал проходить.">Списки решений</SectionTitle>
          <div className="hc-changes-grid">
            {c.lists.map((l) => <ListCard key={l.key} l={l} q={q} />)}
          </div>

          <SectionTitle sub="Сдвиг места среди сверстников своего года рождения в регионе («топ N%») — рост относительно ровесников.">Кто вырос и кто упал</SectionTitle>
          <div className="fed-grid fed-grid--2">
            <section className="fed-card"><h3 className="fed-card__title">Выросли</h3><MoverList players={c.risers} empty="Заметных подъёмов нет." /></section>
            <section className="fed-card"><h3 className="fed-card__title">Упали</h3><MoverList players={c.fallers} empty="Заметных падений нет." /></section>
          </div>
          {c.newRated.length > 0 && (
            <section className="fed-card" style={{ marginTop: 14 }}>
              <h3 className="fed-card__title">Впервые получили оценку</h3>
              <p className="fed-card__sub">Набрали 2 разобранных матча — теперь видны относительно лиги.</p>
              <MoverList players={c.newRated} empty="" fresh />
            </section>
          )}

          <SectionTitle sub="Линия против средней по своему дивизиону: насколько отставание или запас изменились с базы.">Линии</SectionTitle>
          <div className="fed-grid fed-grid--2">
            <section className="fed-card"><h3 className="fed-card__title">Просели</h3><LineList rows={c.lines.sagged} q={q} empty="Ни одна линия не просела." /></section>
            <section className="fed-card"><h3 className="fed-card__title">Выросли</h3><LineList rows={c.lines.improved} q={q} empty="Заметного роста линий нет." /></section>
          </div>

          <SectionTitle sub="Уровень игры состава (средняя оценка игроков за матч) и место команды в дивизионе по нему.">Команды</SectionTitle>
          <section className="fed-card" style={{ padding: 8 }}>
            <div className="hc-table-wrap">
              <table className="fed-table hc-table">
                <thead><tr><th>Команда</th><th className="fed-table__num">Уровень игры, изменение</th><th>Место по уровню игры</th>{c.base.kind === 'snapshot' && <th>Место в таблице</th>}</tr></thead>
                <tbody>
                  {c.teams.slice().sort((x, y) => (y.year - x.year) || x.clubLabel.localeCompare(y.clubLabel, 'ru')).map((t) => {
                    const d = t.avgNow != null && t.avgBefore != null && t.avgBefore > 0 ? Math.round(((t.avgNow - t.avgBefore) / t.avgBefore) * 100) : null;
                    return (
                      <tr key={t.key}>
                        <td><Link to={`/holding/teams/${encodeURIComponent(t.key)}${q}`} className="hc-teamlink" style={{ color: 'var(--text)', fontWeight: 600 }}>{shortClub(t.clubLabel)} {t.year}</Link> <span className="hc-muted hc-small">{t.division}</span></td>
                        <td className={`fed-table__num ${d != null && d > 0 ? 'hc-delta--up' : d != null && d < 0 ? 'hc-delta--down' : 'hc-muted'}`}>{d == null ? '—' : d === 0 ? 'без изменений' : `${pm(d)}%`}</td>
                        <td>{rankMove(t.divRankBefore, t.divRankNow, t.divTeams)}</td>
                        {c.base.kind === 'snapshot' && <td>{rankMove(t.placeBefore, t.placeNow, null)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {c.selection.length > 0 && (
            <>
              <SectionTitle sub="Сколько игроков других школ сейчас усилили бы линию — против базы.">Селекция</SectionTitle>
              <section className="fed-card">
                {c.selection.map((s) => (
                  <div key={`${s.teamKey}${s.line}`} className="fed-row" style={{ padding: '6px 4px' }}>
                    <Link to={`/holding/decisions${q}#selection`} className="fed-row__name" style={{ color: 'var(--text)', textDecoration: 'none' }}>{teamLabel(s.teamKey)} · {LINE_TITLE[s.line]}</Link>
                    <span className="hc-muted">{s.before} → <b style={{ color: 'var(--text)' }}>{s.now}</b> кандидатов</span>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}

      <Timeline />
    </div>
  );
}

const teamLabel = (key: string) => { const [club, year] = key.split(':'); return `${club === 'динамо' ? 'ФК Динамо' : 'Царское Село'} ${year}`; };

function rankMove(before: number | null, now: number | null, size: number | null) {
  if (now == null) return <span className="hc-muted">—</span>;
  const d = before != null ? before - now : 0;
  return (
    <span>{now}-е{size ? ` из ${size}` : ''}{d !== 0 && <span className={d > 0 ? 'hc-delta--up' : 'hc-delta--down'} style={{ marginLeft: 6, fontWeight: 700 }}>{d > 0 ? `↑${d}` : `↓${-d}`}</span>}</span>
  );
}

function PlayerLine({ p, right }: { p: DiffPlayer; right?: React.ReactNode }) {
  return (
    <div className="hc-chg-row">
      <div className="hc-chg-row__who">
        <Link to={`/holding/players/${p.id}`} className="hc-chg-row__name" title={p.name}>{p.name}</Link>
        <span className="hc-muted hc-small">{shortClub(p.clubLabel)} {p.birthYear}{p.line ? ` · ${LINE_TITLE[p.line].toLowerCase()}` : ''}</span>
      </div>
      <span className="hc-chg-row__right">{right}</span>
    </div>
  );
}

function ListCard({ l, q }: { l: ListChange; q: string }) {
  const d = l.now - l.before;
  return (
    <section className="fed-card hc-chg-card">
      <div className="hc-card__head">
        <Link to={`/holding/decisions${q}#${LIST_ANCHOR[l.key]}`} className="hc-card__title" style={{ color: 'var(--text)', textDecoration: 'none' }}>{l.title}</Link>
        <span className="hc-chg-count">{l.before} → <b>{l.now}</b>{d !== 0 && <span className={d > 0 ? (l.key === 'losing' || l.key === 'risk' ? 'hc-delta--down' : 'hc-delta--up') : (l.key === 'losing' || l.key === 'risk' ? 'hc-delta--up' : 'hc-delta--down')}> {d > 0 ? `+${d}` : d}</span>}</span>
      </div>
      {l.entered.length === 0 && l.left.length === 0 && <div className="hc-muted hc-small">без изменений</div>}
      {l.entered.map((p) => <PlayerLine key={`in${p.id}`} p={p} right={<span className={`hc-chg-tag ${l.key === 'losing' || l.key === 'risk' ? 'hc-chg-tag--bad' : 'hc-chg-tag--in'}`}>вошёл{p.pctRegion != null ? ` · топ ${p.pctRegion}%` : ''}</span>} />)}
      {l.left.map((p) => <PlayerLine key={`out${p.id}`} p={p} right={<span className="hc-chg-tag hc-chg-tag--out" title={p.lists.length ? `сейчас: ${p.lists.map((k: ListKey) => LIST_SHORT[k]).join(', ')}` : 'сейчас ни в одном списке'}>вышел{p.lists.length ? ` → ${LIST_SHORT[p.lists[0]!].toLowerCase()}` : ''}</span>} />)}
    </section>
  );
}

function MoverList({ players, empty, fresh }: { players: DiffPlayer[]; empty: string; fresh?: boolean }) {
  if (!players.length) return <div className="fed-note">{empty}</div>;
  return (
    <div>
      {players.map((p) => (
        <PlayerLine key={p.id} p={p} right={fresh
          ? <span>топ {p.pctRegion}% региона</span>
          : <span className="hc-chg-move">топ {p.pctBefore}% → <b>топ {p.pctRegion}%</b><span className="hc-muted hc-small">{p.rankBefore}-й → {p.rankRegion}-й среди сверстников</span></span>} />
      ))}
    </div>
  );
}

function LineList({ rows, q, empty }: { rows: LineChange[]; q: string; empty: string }) {
  if (!rows.length) return <div className="fed-note">{empty}</div>;
  const pc = (x: number | null) => (x == null ? '—' : `${pm(Math.round(x * 100))}%`);
  return (
    <div>
      {rows.map((l) => (
        <div key={`${l.teamKey}${l.line}`} className="hc-chg-row">
          <div className="hc-chg-row__who">
            <Link to={`/holding/teams/${encodeURIComponent(l.teamKey)}${q}`} className="hc-chg-row__name">{shortClub(l.clubLabel)} {l.year} · {l.title}</Link>
            <span className="hc-muted hc-small">против средней по своей лиге</span>
          </div>
          <span className="hc-chg-row__right">{pc(l.gapBefore)} → <b>{pc(l.gapNow)}</b> к лиге</span>
        </div>
      ))}
    </div>
  );
}

/** Лента по турам: сколько игроков проходило в списки после каждого тура (восстановлено по матчам). */
function Timeline() {
  const tl = useHoldingTimeline();
  const pts = tl.data?.points ?? [];
  const series: Array<{ key: ListKey; color: string }> = [
    { key: 'youthReady', color: 'var(--success)' }, { key: 'promote', color: 'var(--accent-cyan)' },
    { key: 'olderAge', color: 'var(--hold-bright)' }, { key: 'losing', color: 'var(--danger)' },
  ];
  return (
    <>
      <SectionTitle sub="Сколько игроков проходило в каждый список после каждого тура — восстановлено по разобранным матчам (оценка — среднее по матчам, поэтому прошлое считается точно).">По турам с начала сезона</SectionTitle>
      <section className="fed-card">
        {tl.isLoading || !pts.length ? <div className="fed-skeleton" style={{ height: 220 }} /> : <TimelineChart pts={pts} series={series} />}
      </section>
    </>
  );
}

function TimelineChart({ pts, series }: { pts: TimelinePoint[]; series: Array<{ key: ListKey; color: string }> }) {
  const W = 760, H = 220, P = { l: 34, r: 12, t: 12, b: 34 };
  const max = Math.max(4, ...pts.flatMap((p) => series.map((s) => p.counts[s.key])));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, pts.length - 1);
  const y = (v: number) => H - P.b - (v * (H - P.t - P.b)) / max;
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div>
      <div className="hc-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{LIST_SHORT[s.key]}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="hc-timeline" role="img" aria-label="Списки решений по турам">
        {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--border)" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" className="hc-timeline__tick">{t}</text></g>)}
        {pts.map((p, i) => <text key={i} x={x(i)} y={H - 12} textAnchor="middle" className="hc-timeline__tick">{p.toursBack === 0 ? 'сейчас' : p.date ? new Date(p.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '') : `−${p.toursBack}`}</text>)}
        {series.map((s) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth={2.5} points={pts.map((p, i) => `${x(i)},${y(p.counts[s.key])}`).join(' ')} />
            {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.counts[s.key])} r={3} fill={s.color}><title>{`${LIST_SHORT[s.key]}: ${p.counts[s.key]}`}</title></circle>)}
          </g>
        ))}
      </svg>
    </div>
  );
}

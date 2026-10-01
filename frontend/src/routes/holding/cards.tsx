/**
 * Визуальные карточки кабинета: игрок с кольцом индекса, плитка команды против лиги,
 * полоса «место в регионе». Используются на брифинге, в решениях и на странице команды.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ClubShield } from '../federation/ClubShield';
import { groupTitle, shortClub, type LeaguePlayer, type TeamLeague } from './api';
import { IndexRing, indexColor } from './viz';

export const surname = (name: string) => { const p = name.trim().split(/\s+/); return p.length > 1 ? `${p[p.length - 1]} ${p[0]![0]}.` : name; };

/** Карточка игрока: кольцо индекса, фамилия, позиция, команда, ярлык решения. */
export function PlayerCard({ p, q, tag, tagTone, sub, showTeam = true, rank }: {
  p: LeaguePlayer; q: string; tag?: ReactNode; tagTone?: 'up' | 'down' | 'warn' | 'brand'; sub?: ReactNode; showTeam?: boolean; rank?: number;
}) {
  const f = p.formDelta;
  return (
    <Link to={`/holding/players/${p.id}${q}`} className="hd-pcard" style={{ ['--pc' as string]: indexColor(p.index) }}>
      {rank != null && <span className="hd-pcard__rank">{rank}</span>}
      <IndexRing value={p.index} size={52} stroke={5} />
      <span className="hd-pcard__body">
        <span className="hd-pcard__name">{surname(p.name)}</span>
        <span className="hd-pcard__pos">{groupTitle(p)}</span>
        {showTeam && <span className="hd-pcard__team">{shortClub(p.clubLabel)} {p.birthYear}</span>}
        <span className="hd-pcard__meta">
          {sub ?? <>{p.minutes ?? 0} мин{f != null ? <> · <span className={f >= 0.5 ? 'hd-up' : f <= -0.5 ? 'hd-down' : ''}>{f >= 0.5 ? '↑' : f <= -0.5 ? '↓' : '→'} форма</span></> : null}</>}
        </span>
        {tag && <span className={`hd-tag ${tagTone ? `hd-tag--${tagTone}` : ''} hd-pcard__tag`}>{tag}</span>}
      </span>
    </Link>
  );
}

/** Сетка карточек игроков с «показать всех». */
export function PlayerCards({ players, q, limit = 8, render, empty = 'Никого.' }: { players: LeaguePlayer[]; q: string; limit?: number; render?: (p: LeaguePlayer, i: number) => ReactNode; empty?: string }) {
  if (!players.length) return <div className="hd-empty">{empty}</div>;
  return (
    <div className="hd-pcards">
      {players.slice(0, limit).map((p, i) => render ? render(p, i) : <PlayerCard key={p.id} p={p} q={q} />)}
      {players.length > limit && <div className="hd-pcards__more">ещё {players.length - limit} — в списке ниже</div>}
    </div>
  );
}

/**
 * Место в таблице против уровня игры (место по силе состава в дивизионе). o < 0 — в таблице ниже,
 * чем позволяет игра; o > 0 — выше. Словами, без «недобирает».
 */
export function perfWord(o: number | null): { text: string; tone: 'up' | 'down' | 'muted' } {
  if (o == null) return { text: '—', tone: 'muted' };
  if (o === 0) return { text: 'место по уровню игры', tone: 'muted' };
  if (o < 0) return { text: o === -1 ? 'играет чуть сильнее своего места' : o >= -3 ? 'играет сильнее своего места' : 'играет заметно сильнее своего места', tone: 'down' };
  return { text: o === 1 ? 'место чуть выше уровня игры' : o <= 3 ? 'место выше уровня игры' : 'место заметно выше уровня игры', tone: 'up' };
}

/** Средний индекс состава (игроки с 45+ минутами). */
export const teamIndex = (t: TeamLeague): number | null => {
  const xs = t.squad.filter((p) => p.index != null && (p.minutes ?? 0) >= 45).map((p) => p.index as number);
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
};

/** Плитка команды: место в таблице против уровня игры, индекс, линии слабее лиги. */
export function TeamTile({ t, q, logo }: { t: TeamLeague; q: string; logo?: string | null }) {
  const o = t.overperformance;
  const idx = teamIndex(t);
  const size = t.placeSize ?? t.divTeams ?? 0;
  const pos = (n: number | null) => (n == null || size <= 1 ? null : ((n - 1) / (size - 1)) * 100);
  const xp = pos(t.place), xs = pos(t.divRankByAvg);
  const weak = t.lines.filter((l) => l.verdict === 'weak');
  return (
    <Link to={`/holding/teams/${encodeURIComponent(t.key)}${q}`} className={`hd-tile${o != null && o < 0 ? ' hd-tile--under' : o != null && o > 0 ? ' hd-tile--over' : ''}`}>
      <div className="hd-tile__head">
        <ClubShield name={t.name} logoUrl={logo} size={30} />
        <div style={{ minWidth: 0 }}>
          <div className="hd-tile__name">{shortClub(t.clubLabel)} {t.year}</div>
          <div className="hd-tile__sub">{t.ageTitle} · {t.division}</div>
        </div>
        <IndexRing value={idx} size={42} stroke={4} />
      </div>
      <div className="hd-tile__nums">
        <div><b>{t.place ?? '—'}</b><small>/{size || '—'}</small><span>в таблице</span></div>
        <div><b>{t.divRankByAvg ?? '—'}</b><small>/{t.divTeams || '—'}</small><span>по уровню игры</span></div>
      </div>
      {xp != null && xs != null && (
        <div className="hd-tile__track" title={`в таблице ${t.place}-е, по уровню игры ${t.divRankByAvg}-е`}>
          <span className="hd-tile__span" style={{ left: `${Math.min(xp, xs)}%`, width: `${Math.abs(xp - xs)}%`, background: (o ?? 0) < 0 ? 'var(--rating-weak)' : 'var(--rating-excellent)' }} />
          <span className="hd-tile__dot hd-tile__dot--strength" style={{ left: `${xs}%` }} />
          <span className="hd-tile__dot" style={{ left: `${xp}%` }} />
        </div>
      )}
      <div className="hd-tile__foot">
        {(() => { const w = perfWord(o); return <span className={w.tone === 'muted' ? 'hd-muted' : w.tone === 'down' ? 'hd-warn' : 'hd-up'}>{w.text}</span>; })()}
        {weak.length > 0 && <span className="hd-tile__weak">слабее лиги: {weak.map((l) => l.title.toLowerCase()).join(', ')}</span>}
      </div>
    </Link>
  );
}

/** Две полосы «топ N% региона» друг под другом: наш против кандидата (меньше % — лучше). */
export function PctCompare({ ours, theirs, oursLabel, theirsLabel }: { ours: number | null; theirs: number; oursLabel: string; theirsLabel: string }) {
  const w = (p: number | null) => (p == null ? 0 : Math.max(4, 100 - p));
  return (
    <div className="hd-pctcmp">
      <div className="hd-pctcmp__row"><span className="hd-pctcmp__l">{oursLabel}</span><span className="hd-pctcmp__bar"><i style={{ width: `${w(ours)}%`, background: 'var(--brand-primary)' }} /></span><span className="hd-pctcmp__v">{ours == null ? '—' : `топ ${ours}%`}</span></div>
      <div className="hd-pctcmp__row"><span className="hd-pctcmp__l">{theirsLabel}</span><span className="hd-pctcmp__bar"><i style={{ width: `${w(theirs)}%`, background: 'var(--rating-excellent)' }} /></span><span className="hd-pctcmp__v">топ {theirs}%</span></div>
    </div>
  );
}

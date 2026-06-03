/**
 * SeasonTrendCard — «Сезонная форма»: путь набранных очков по ходу сезона.
 * Это ОКЕАН во времени — измерение, которого нет на других экранах: не срез, а
 * траектория. Считается НА КЛИЕНТЕ из заголовков матчей (без backend).
 * Своя SVG-линия с фирменной анимацией прорисовки (язык движения Авандаты).
 */
import { useMemo } from 'react';
import { isOurClub } from '../../utils/legirus';
import { Reveal } from '../motion';
import './SeasonTrendCard.css';

function weAreHome(m) {
  if (m.homeTeamId || m.awayTeamId) return m.homeTeamId === m.teamId;
  return isOurClub(m.home);
}

export default function SeasonTrendCard({ matches }) {
  const data = useMemo(() => {
    const played = (matches || [])
      .filter((m) => m.scoreHome != null && m.scoreAway != null && m.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let pts = 0;
    return played.map((m) => {
      const home = weAreHome(m);
      const us = Number(home ? m.scoreHome : m.scoreAway);
      const them = Number(home ? m.scoreAway : m.scoreHome);
      const r = us > them ? 'W' : us === them ? 'D' : 'L';
      pts += r === 'W' ? 3 : r === 'D' ? 1 : 0;
      return { us, them, r, pts, date: m.date };
    });
  }, [matches]);

  if (data.length < 2) return null;

  const W = 600, H = 160, padX = 12, padTop = 14, padBot = 22;
  const n = data.length;
  const maxPts = data[n - 1].pts || 1;
  const x = (i) => padX + (i / (n - 1)) * (W - padX * 2);
  const y = (p) => padTop + (1 - p / maxPts) * (H - padTop - padBot);
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.pts).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${(H - padBot).toFixed(1)} L ${x(0).toFixed(1)} ${(H - padBot).toFixed(1)} Z`;
  const colorFor = (r) => (r === 'W' ? 'var(--rating-excellent)' : r === 'D' ? 'var(--rating-ok)' : 'var(--rating-poor)');

  const wins = data.filter((d) => d.r === 'W').length;
  const draws = data.filter((d) => d.r === 'D').length;
  const losses = data.filter((d) => d.r === 'L').length;

  return (
    <Reveal variant="slide-up">
      <div className="card season-trend">
        <div className="page-section-title">
          Сезонная форма
          <span className="season-trend__sub">{data[n - 1].pts} очков · {wins}–{draws}–{losses}</span>
        </div>
        <svg className="season-trend__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          role="img" aria-label={`Путь очков по сезону: ${data[n - 1].pts} очков за ${n} матчей`}>
          <defs>
            <linearGradient id="st-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#st-area)" />
          <path className="season-trend__line" d={linePath} fill="none" stroke="var(--accent-cyan)"
            strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={i} cx={x(i)} cy={y(d.pts)} r="4" fill={colorFor(d.r)} stroke="var(--bg-surface)" strokeWidth="1.5">
              <title>{`${new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} · ${d.us}:${d.them} · ${d.pts} очк.`}</title>
            </circle>
          ))}
        </svg>
        <div className="season-trend__legend">
          <span><i className="season-trend__dot season-trend__dot--w" />Победа</span>
          <span><i className="season-trend__dot season-trend__dot--d" />Ничья</span>
          <span><i className="season-trend__dot season-trend__dot--l" />Поражение</span>
        </div>
      </div>
    </Reveal>
  );
}

import './SpeedZones.css';

/**
 * Зоны интенсивности (физуха) — дистанция в скоростных диапазонах
 * 4–5.5 / 5.5–7 / 7+ м/с (high-speed running → спринт). В духе физических
 * отчётов Opta/StatsBomb. Принимает уже распаршенные значения (метры).
 *
 * Props (per-player): { z1, z2, z3, total, sprintDist, sprints }
 * Props (compact, для командного списка): compact + label
 */
function n(v) { return Number(v) || 0; }

export default function SpeedZones({ z1, z2, z3, total, sprintDist, sprints, compact, label, scaleMax }) {
  const a = n(z1), b = n(z2), c = n(z3);
  const hsr = a + b + c; // high-speed running
  if (hsr <= 0 && n(total) <= 0) return null;
  // compact-режим (командный список) использует общий scaleMax → бары сравнимы;
  // одиночный — нормируется к своему hsr (показывает распределение по зонам).
  const max = Math.max(1, scaleMax || hsr);
  const pct = (x) => `${(x / max) * 100}%`;

  if (compact) {
    return (
      <div className="sz sz--compact">
        <span className="sz__c-label">{label}</span>
        <span className="sz__bar" role="img" aria-label={`${label}: интенсивный бег ${Math.round(hsr)} м`}>
          <span className="sz__seg sz__seg--1" style={{ width: pct(a) }} />
          <span className="sz__seg sz__seg--2" style={{ width: pct(b) }} />
          <span className="sz__seg sz__seg--3" style={{ width: pct(c) }} />
        </span>
        <span className="sz__c-val">{(hsr / 1000).toFixed(2)} км</span>
      </div>
    );
  }

  return (
    <div className="sz">
      <div className="sz__top">
        <div className="sz__metric"><span className="sz__big">{(n(total) / 1000).toFixed(2)}</span><span className="sz__unit">км дистанция</span></div>
        <div className="sz__metric"><span className="sz__big">{(n(sprintDist) / 1000).toFixed(2)}</span><span className="sz__unit">км спринты</span></div>
        <div className="sz__metric"><span className="sz__big">{n(sprints)}</span><span className="sz__unit">спринтов</span></div>
      </div>
      <div className="sz__bar sz__bar--lg" role="img" aria-label={`Интенсивный бег: 4–5.5 м/с ${Math.round(a)} м, 5.5–7 ${Math.round(b)} м, 7+ ${Math.round(c)} м`}>
        <span className="sz__seg sz__seg--1" style={{ width: pct(a) }}>{a / max > 0.12 ? Math.round(a) : ''}</span>
        <span className="sz__seg sz__seg--2" style={{ width: pct(b) }}>{b / max > 0.12 ? Math.round(b) : ''}</span>
        <span className="sz__seg sz__seg--3" style={{ width: pct(c) }}>{c / max > 0.12 ? Math.round(c) : ''}</span>
      </div>
      <div className="sz__legend">
        <span><i className="sz__sw sz__sw--1" />4–5.5 м/с</span>
        <span><i className="sz__sw sz__sw--2" />5.5–7 м/с</span>
        <span><i className="sz__sw sz__sw--3" />7+ м/с (спринт)</span>
      </div>
    </div>
  );
}

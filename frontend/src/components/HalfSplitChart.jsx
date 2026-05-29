import './HalfSplitChart.css';

/**
 * Визуализация «по таймам» (момент игры): для каждой метрики горизонтальный бар,
 * поделённый на 1-й и 2-й тайм пропорционально, + сумма за матч и дельта.
 * Сразу видно, где сделана работа и как менялась игра между таймами.
 *
 * Props:
 *   rows: [{ label, first, second }]
 *   title?, hint?
 */
export default function HalfSplitChart({ title, rows, hint }) {
  const valid = (rows || [])
    .map((r) => ({ label: r.label, first: Number(r.first) || 0, second: Number(r.second) || 0 }))
    .filter((r) => r.first + r.second > 0);
  if (!valid.length) return null;

  return (
    <div className="hsc">
      {title && <div className="hsc__title">{title}</div>}
      <div className="hsc__legend">
        <span><i className="hsc__sw hsc__sw--1" />1-й тайм</span>
        <span><i className="hsc__sw hsc__sw--2" />2-й тайм</span>
      </div>
      <div className="hsc__rows">
        {valid.map((r, i) => {
          const t = r.first + r.second;
          const fp = t ? (r.first / t) * 100 : 0;
          const d = r.second - r.first;
          return (
            <div className="hsc__row" key={i}>
              <span className="hsc__label">{r.label}</span>
              <span className="hsc__bar" role="img" aria-label={`${r.label}: 1-й тайм ${r.first}, 2-й тайм ${r.second}`}>
                <span className="hsc__seg hsc__seg--1" style={{ width: `${fp}%` }}>
                  {r.first > 0 && fp > 14 ? r.first : ''}
                </span>
                <span className="hsc__seg hsc__seg--2" style={{ width: `${100 - fp}%` }}>
                  {r.second > 0 && 100 - fp > 14 ? r.second : ''}
                </span>
              </span>
              <span className="hsc__total">{t}</span>
              <span className={`hsc__delta hsc__delta--${d > 0 ? 'up' : d < 0 ? 'down' : 'eq'}`}>
                {d > 0 ? '▲' : d < 0 ? '▼' : '='}{d > 0 ? '+' : ''}{d !== 0 ? d : ''}
              </span>
            </div>
          );
        })}
      </div>
      {hint && <div className="hsc__hint">{hint}</div>}
    </div>
  );
}

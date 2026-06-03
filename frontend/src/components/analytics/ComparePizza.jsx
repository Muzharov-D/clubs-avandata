/**
 * Наложение «пицц» (радар-профилей) двух игроков на одни оси. Каждая ось —
 * метрика, значение — перцентиль игрока в команде (0–100). Два полупрозрачных
 * полигона поверх друг друга — сразу видно, где А сильнее B и наоборот.
 *
 * slices: [{ axis, a, b }] — a/b в перцентилях (0–100). nameA/nameB — подписи.
 */

const PAD = 56; // место под подписи осей

function ComparePizza({ slices, nameA, nameB, size = 380 }) {
  if (!Array.isArray(slices) || slices.length < 3) return null;
  const n = slices.length;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - PAD;

  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i, pct) => {
    const r = (Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * R;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  };
  const poly = (key) => slices.map((s, i) => point(i, s[key]).join(',')).join(' ');

  const RINGS = [25, 50, 75, 100];

  return (
    <div className="cmp-pz">
      <svg viewBox={`0 0 ${size} ${size}`} className="cmp-pz__svg" role="img"
        aria-label={`Наложение профилей: ${nameA} и ${nameB}`}>
        {/* кольца сетки */}
        {RINGS.map((lvl) => (
          <circle key={lvl} cx={cx} cy={cy} r={(lvl / 100) * R} className="cmp-pz__ring" />
        ))}
        {/* оси + подписи */}
        {slices.map((s, i) => {
          const [ex, ey] = point(i, 100);
          const [lx, ly] = point(i, 122);
          const cos = Math.cos(angle(i));
          const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
          return (
            <g key={s.axis}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} className="cmp-pz__axis" />
              <text x={lx} y={ly} className="cmp-pz__lab" textAnchor={anchor} dominantBaseline="middle">
                {s.axis}
              </text>
            </g>
          );
        })}
        {/* полигоны игроков (B под A) */}
        <polygon points={poly('b')} className="cmp-pz__poly cmp-pz__poly--b" />
        <polygon points={poly('a')} className="cmp-pz__poly cmp-pz__poly--a" />
        {/* точки вершин */}
        {slices.map((s, i) => {
          const [ax, ay] = point(i, s.a);
          const [bx, by] = point(i, s.b);
          return (
            <g key={`pt-${s.axis}`}>
              <circle cx={bx} cy={by} r="2.5" className="cmp-pz__dot cmp-pz__dot--b" />
              <circle cx={ax} cy={ay} r="2.5" className="cmp-pz__dot cmp-pz__dot--a" />
            </g>
          );
        })}
      </svg>
      <div className="cmp-pz__legend">
        <span className="cmp-pz__leg cmp-pz__leg--a"><i />{nameA}</span>
        <span className="cmp-pz__leg cmp-pz__leg--b"><i />{nameB}</span>
      </div>
      <div className="cmp-pz__note">Длина луча — перцентиль игрока в команде (центр 0, край 100).</div>
    </div>
  );
}

export default ComparePizza;

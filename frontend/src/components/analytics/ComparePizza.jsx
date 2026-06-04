/**
 * Сравнение двух игроков В ТОЧНОМ СТИЛЕ пиццы профиля игрока (PizzaChart):
 * радиальные градиенты долек (глубина от центра к краю), свечение (glow),
 * призрак-трек, светящееся ядро с пульсом, рост долек со stagger, ободные
 * подписи. Цвет дольки — по ИГРОКУ (А/Б), а не по группе CIES.
 *
 * Дольки игроков вложены (бо́льшая под меньшей) — у каждого видна внешняя дуга =
 * его перцентиль. Пунктир на дольке = уровень среднего игрока команды.
 *
 * slices: [{ axis, a, b, t }] — перцентили 0–100 (t — линия команды).
 */
import './ComparePizza.css';

function polar(cx, cy, r, a) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function slicePath(cx, cy, innerR, outerR, startA, endA) {
  const p1 = polar(cx, cy, innerR, startA);
  const p2 = polar(cx, cy, outerR, startA);
  const p3 = polar(cx, cy, outerR, endA);
  const p4 = polar(cx, cy, innerR, endA);
  const large = endA - startA > Math.PI ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`, `L ${p2.x} ${p2.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${p3.x} ${p3.y}`,
    `L ${p4.x} ${p4.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${p1.x} ${p1.y}`, 'Z',
  ].join(' ');
}
function arcPath(cx, cy, r, startA, endA) {
  const p2 = polar(cx, cy, r, startA);
  const p3 = polar(cx, cy, r, endA);
  const large = endA - startA > Math.PI ? 1 : 0;
  return `M ${p2.x} ${p2.y} A ${r} ${r} 0 ${large} 1 ${p3.x} ${p3.y}`;
}
function placeAxisLabel(cx, cy, r, angle) {
  const p = polar(cx, cy, r, angle);
  let rotation = (angle * 180) / Math.PI;
  let anchor = 'start';
  const norm = ((rotation % 360) + 360) % 360;
  if (norm > 90 && norm < 270) { rotation += 180; anchor = 'end'; }
  return { x: p.x, y: p.y, rotation, anchor };
}
function wrapAxisLabel(text) {
  if (!text) return [''];
  if (text.length <= 12) return [text];
  const mid = Math.floor(text.length / 2);
  const left = text.lastIndexOf(' ', mid);
  const right = text.indexOf(' ', mid);
  const split = (left >= 0 && (right < 0 || mid - left <= right - mid)) ? left : right;
  return split < 0 ? [text] : [text.slice(0, split).trim(), text.slice(split + 1).trim()];
}
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

const FONT_VALUE = 12;
const FONT_AXIS = 11;

function ComparePizza({ slices, nameA, nameB, size = 600 }) {
  if (!Array.isArray(slices) || slices.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 60;
  const outerMax = size / 2 - 104;
  const N = slices.length;
  const step = (2 * Math.PI) / N;
  const pad = 0.014;
  const radius = (pct) => innerR + (outerMax - innerR) * (clamp(pct) / 100);

  const guides = [0.25, 0.5, 0.75, 1.0].map((f) => (
    <circle key={f} cx={cx} cy={cy} r={innerR + (outerMax - innerR) * f}
      stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none"
      strokeDasharray={f === 1 ? '0' : '2 3'} />
  ));

  const sectors = slices.map((s, i) => {
    const startA = i * step - Math.PI / 2 + pad / 2;
    const endA = (i + 1) * step - Math.PI / 2 - pad / 2;
    const midA = (startA + endA) / 2;
    const rA = radius(s.a);
    const rB = radius(s.b);
    const rT = radius(s.t);
    const aBigger = rA >= rB;
    const big = aBigger
      ? { r: rA, key: 'a', val: s.a }
      : { r: rB, key: 'b', val: s.b };
    const small = aBigger
      ? { r: rB, key: 'b', val: s.b }
      : { r: rA, key: 'a', val: s.a };
    const numBig = polar(cx, cy, Math.max(innerR + 14, big.r - 12), midA);
    const numSmall = polar(cx, cy, Math.max(innerR + 14, small.r - 12), midA);
    const ax = placeAxisLabel(cx, cy, outerMax + 12, midA);
    const lines = wrapAxisLabel(s.axis);
    return (
      <g key={i} className="cpw-sector" style={{ ['--i']: i, transformOrigin: `${cx}px ${cy}px` }}>
        {/* призрак-трек */}
        <path d={slicePath(cx, cy, innerR, outerMax, startA, endA)}
          fill="rgba(255,255,255,0.035)" stroke="rgba(7,7,28,0.6)" strokeWidth="0.5" />
        {/* бо́льшая долька (под), затем меньшая (сверху) — у обеих видна внешняя дуга */}
        <path className="cpw-fill" d={slicePath(cx, cy, innerR, big.r, startA, endA)}
          fill={`url(#cpw-grad-${big.key})`} stroke="rgba(7,7,28,0.85)" strokeWidth="1" filter="url(#cpw-glow)" />
        <path className="cpw-fill" d={slicePath(cx, cy, innerR, small.r, startA, endA)}
          fill={`url(#cpw-grad-${small.key})`} stroke="rgba(7,7,28,0.85)" strokeWidth="1" filter="url(#cpw-glow)" />
        {/* пунктир команды */}
        <path d={arcPath(cx, cy, rT, startA, endA)} className="cpw-team" fill="none" />
        {/* числа перцентилей */}
        <text x={numBig.x} y={numBig.y} className={`cpw-num cpw-num--${big.key}`}
          fontSize={FONT_VALUE} textAnchor="middle" dominantBaseline="middle">{Math.round(big.val)}</text>
        <text x={numSmall.x} y={numSmall.y} className={`cpw-num cpw-num--${small.key}`}
          fontSize={FONT_VALUE} textAnchor="middle" dominantBaseline="middle">{Math.round(small.val)}</text>
        {/* ободная подпись метрики */}
        <text x={ax.x} y={ax.y} className="cpw-axis" fontSize={FONT_AXIS}
          textAnchor={ax.anchor} dominantBaseline="middle"
          transform={`rotate(${ax.rotation} ${ax.x} ${ax.y})`}>
          {lines.map((ln, li) => <tspan key={li} x={ax.x} dy={li === 0 ? 0 : FONT_AXIS + 1}>{ln}</tspan>)}
        </text>
      </g>
    );
  });

  return (
    <div className="cpw">
      <svg viewBox={`0 0 ${size} ${size}`} className="cpw__svg" role="img"
        aria-label={`Сравнение профилей: ${nameA}, ${nameB}, команда`}>
        <defs>
          {/* Радиальные градиенты по игроку — глубина как на профиле */}
          <radialGradient id="cpw-grad-a" cx="50%" cy="50%" r="65%">
            <stop offset="0%" className="cpw-grad-a0" />
            <stop offset="100%" className="cpw-grad-a1" />
          </radialGradient>
          <radialGradient id="cpw-grad-b" cx="50%" cy="50%" r="65%">
            <stop offset="0%" className="cpw-grad-b0" />
            <stop offset="100%" className="cpw-grad-b1" />
          </radialGradient>
          <filter id="cpw-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="cpw-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.25)" />
            <stop offset="100%" stopColor="rgba(7,7,28,0)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={outerMax} fill="url(#cpw-core)" opacity="0.6" />
        {guides}
        {sectors}
        <circle className="cpw-core" cx={cx} cy={cy} r={innerR - 6}
          fill="rgba(7,7,28,0.92)" stroke="var(--accent-cyan, #22d3ee)" strokeWidth="1.5" filter="url(#cpw-glow)" />
        <text x={cx} y={cy} className="cpw-core-lab" textAnchor="middle" dominantBaseline="middle">в команде</text>
      </svg>
      <div className="cpw__legend">
        <span className="cpw__leg cpw__leg--a"><i />{nameA}</span>
        <span className="cpw__leg cpw__leg--b"><i />{nameB}</span>
        <span className="cpw__leg cpw__leg--team"><i />Команда (средний)</span>
      </div>
      <div className="cpw__note">Длина дольки — перцентиль в команде (центр 0, край 100). Пунктир — уровень среднего игрока.</div>
    </div>
  );
}

export default ComparePizza;

/**
 * Сравнение двух игроков в стиле «пиццы» (секторов-долек), а не спайдер-радара.
 * Геометрия как в PizzaChart: дольки расходятся из светящегося центра, длина =
 * перцентиль в команде (0–100). На каждой дольке наложены ДВА игрока (А и Б,
 * полупрозрачные) + пунктирная дуга «команда» (медиана). Видно и дуэль игроков,
 * и кто над/под уровнем команды.
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

function ComparePizza({ slices, nameA, nameB, size = 560 }) {
  if (!Array.isArray(slices) || slices.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 56;
  const outerMax = size / 2 - 96;
  const N = slices.length;
  const step = (2 * Math.PI) / N;
  const pad = 0.02;
  const radius = (pct) => innerR + (outerMax - innerR) * (clamp(pct) / 100);

  const guides = [0.25, 0.5, 0.75, 1.0].map((f) => (
    <circle key={f} cx={cx} cy={cy} r={innerR + (outerMax - innerR) * f}
      className="cpw__ring" strokeDasharray={f === 1 ? '0' : '2 3'} />
  ));

  const sectors = slices.map((s, i) => {
    const startA = i * step - Math.PI / 2 + pad / 2;
    const endA = (i + 1) * step - Math.PI / 2 - pad / 2;
    const midA = (startA + endA) / 2;
    const rA = radius(s.a);
    const rB = radius(s.b);
    const rT = radius(s.t);
    // больший рисуем первым, меньший сверху — чтобы обе границы читались
    const aBigger = rA >= rB;
    const big = aBigger ? { d: slicePath(cx, cy, innerR, rA, startA, endA), cls: 'a' }
      : { d: slicePath(cx, cy, innerR, rB, startA, endA), cls: 'b' };
    const small = aBigger ? { d: slicePath(cx, cy, innerR, rB, startA, endA), cls: 'b' }
      : { d: slicePath(cx, cy, innerR, rA, startA, endA), cls: 'a' };
    const aNum = polar(cx, cy, Math.max(innerR + 13, rA - 11), startA + (endA - startA) * 0.32);
    const bNum = polar(cx, cy, Math.max(innerR + 13, rB - 11), startA + (endA - startA) * 0.68);
    const ax = placeAxisLabel(cx, cy, outerMax + 13, midA);
    const lines = wrapAxisLabel(s.axis);
    return (
      <g key={i}>
        <path d={slicePath(cx, cy, innerR, outerMax, startA, endA)} className="cpw__track" />
        <path d={big.d} className={`cpw__wedge cpw__wedge--${big.cls}`} />
        <path d={small.d} className={`cpw__wedge cpw__wedge--${small.cls}`} />
        <path d={arcPath(cx, cy, rT, startA, endA)} className="cpw__team" fill="none" />
        <text x={aNum.x} y={aNum.y} className="cpw__num cpw__num--a" textAnchor="middle" dominantBaseline="middle">{Math.round(s.a)}</text>
        <text x={bNum.x} y={bNum.y} className="cpw__num cpw__num--b" textAnchor="middle" dominantBaseline="middle">{Math.round(s.b)}</text>
        <text x={ax.x} y={ax.y} className="cpw__axis" textAnchor={ax.anchor} dominantBaseline="middle"
          transform={`rotate(${ax.rotation} ${ax.x} ${ax.y})`}>
          {lines.map((ln, li) => <tspan key={li} x={ax.x} dy={li === 0 ? 0 : 12}>{ln}</tspan>)}
        </text>
      </g>
    );
  });

  return (
    <div className="cpw">
      <svg viewBox={`0 0 ${size} ${size}`} className="cpw__svg" role="img"
        aria-label={`Сравнение пицц: ${nameA}, ${nameB}, команда`}>
        <defs>
          <filter id="cpw-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="cpw-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(7,7,28,0)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={outerMax} fill="url(#cpw-core)" opacity="0.6" />
        {guides}
        {sectors}
        <circle cx={cx} cy={cy} r={innerR - 6} className="cpw__core" filter="url(#cpw-glow)" />
        <text x={cx} y={cy} className="cpw__core-lab" textAnchor="middle" dominantBaseline="middle">в команде</text>
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

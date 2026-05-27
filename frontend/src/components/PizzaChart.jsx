// Pizza chart («percentile dashboard») — фронт-витрина профиля игрока.
// Pure SVG, без внешних чарт-либ. Каждый слайс — два слоя:
//   - track  (полупрозрачная заливка до 100% — «призрак» сектора)
//   - filled (яркая заливка до percentile-значения 0–100)
// Цвета — Легирус-brand (красный + белый + тёмно-красный).

import './PizzaChart.css';

const GROUP_COLORS = {
  attack:  { fill: '#dc2626', track: 'rgba(220, 38, 38, 0.16)', text: '#fff', label: 'Атака' },
  defence: { fill: '#ffffff', track: 'rgba(255, 255, 255, 0.10)', text: '#0d1424', label: 'Оборона' },
  fitness: { fill: '#7c2d12', track: 'rgba(124, 45, 18, 0.22)',  text: '#fff', label: 'Фитнес' },
};

function polar(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function slicePath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const p1 = polar(cx, cy, innerR, startAngle);
  const p2 = polar(cx, cy, outerR, startAngle);
  const p3 = polar(cx, cy, outerR, endAngle);
  const p4 = polar(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p3.x} ${p3.y}`,
    `L ${p4.x} ${p4.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p1.x} ${p1.y}`,
    'Z',
  ].join(' ');
}

function placeAxisLabel(cx, cy, r, angle) {
  const p = polar(cx, cy, r, angle);
  let rotation = (angle * 180) / Math.PI;
  let anchor = 'start';
  const norm = ((rotation % 360) + 360) % 360;
  if (norm > 90 && norm < 270) {
    rotation += 180;
    anchor = 'end';
  }
  return { x: p.x, y: p.y, rotation, anchor };
}

// Перевод длинных axis-меток на 2 строки.
function wrapAxisLabel(text) {
  if (!text) return [''];
  if (text.includes(' / ')) return text.split(' / ').map((p) => p.trim());
  if (text.length <= 16) return [text];
  const mid = Math.floor(text.length / 2);
  const left = text.lastIndexOf(' ', mid);
  const right = text.indexOf(' ', mid);
  const split = (left >= 0 && (right < 0 || mid - left <= right - mid)) ? left : right;
  if (split < 0) return [text];
  return [text.slice(0, split).trim(), text.slice(split + 1).trim()];
}

/**
 * Props:
 *   subjectName   string  — заголовок (например, имя игрока)
 *   subjectMeta   string  — подзаголовок (контекст: команда / сезон)
 *   vsLabel       string  — текст рядом со «vs» в центре (например, «нападающих клуба»)
 *   slices        Array<{
 *                   axis: string,
 *                   value: 0-100,            // длина слайса (percentile)
 *                   group: 'attack'|'defence'|'fitness',
 *                   displayValue?: string,    // что отрисовать на слайсе (если нет — округлённый value)
 *                 }>
 *   centerLabel   string  — лейбл центра, дефолт 'ЛЕГИРУС'
 *   size          number  — размер SVG по viewBox (дефолт 640). На фронте SVG растягивается по контейнеру.
 */
export default function PizzaChart({
  subjectName,
  subjectMeta,
  vsLabel,
  slices = [],
  centerLabel = 'ЛЕГИРУС',
  size = 640,
}) {
  if (!Array.isArray(slices) || slices.length === 0) {
    return <div className="pizza-empty">Нет данных для расчёта percentile</div>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const innerR = 64;
  const outerMax = size / 2 - 110;
  const N = slices.length;
  const angleStep = (2 * Math.PI) / N;
  const padAngle = 0.013;

  const FONT_VALUE = 12;
  const FONT_AXIS = 11;

  const sliceElements = slices.map((s, i) => {
    const startA = i * angleStep - Math.PI / 2 + padAngle / 2;
    const endA = (i + 1) * angleStep - Math.PI / 2 - padAngle / 2;
    const value = Math.max(0, Math.min(100, Number(s.value) || 0));
    const r = innerR + (outerMax - innerR) * (value / 100);
    const conf = GROUP_COLORS[s.group] || GROUP_COLORS.attack;

    const trackPath = slicePath(cx, cy, innerR, outerMax, startA, endA);
    const filledPath = slicePath(cx, cy, innerR, r, startA, endA);

    const midA = (startA + endA) / 2;
    const valuePos = polar(cx, cy, Math.max(innerR + 14, r - 12), midA);
    const axisPos = placeAxisLabel(cx, cy, outerMax + 12, midA);
    const axisLines = wrapAxisLabel(s.axis);

    const labelText = s.displayValue != null ? s.displayValue : String(Math.round(value));

    return (
      <g key={i}>
        <path d={trackPath} fill={conf.track} stroke="rgba(7,7,28,0.6)" strokeWidth="0.5" />
        <path d={filledPath} fill={conf.fill} stroke="rgba(7,7,28,0.85)" strokeWidth="1">
          <title>{`${s.axis}: ${labelText} (percentile ${Math.round(value)})`}</title>
        </path>
        <text
          className="pizza-label"
          x={valuePos.x} y={valuePos.y}
          fontSize={FONT_VALUE}
          textAnchor="middle" dominantBaseline="middle"
          fill={conf.text}
        >{labelText}</text>
        <text
          className="pizza-axis-label"
          x={axisPos.x} y={axisPos.y}
          fontSize={FONT_AXIS}
          textAnchor={axisPos.anchor}
          dominantBaseline="middle"
          transform={`rotate(${axisPos.rotation} ${axisPos.x} ${axisPos.y})`}
        >
          {axisLines.map((line, li) => (
            <tspan key={li} x={axisPos.x} dy={li === 0 ? 0 : FONT_AXIS + 1}>{line}</tspan>
          ))}
        </text>
      </g>
    );
  });

  const guides = [0.25, 0.5, 0.75, 1.0].map((f) => {
    const r = innerR + (outerMax - innerR) * f;
    return (
      <circle
        key={f} cx={cx} cy={cy} r={r}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none"
        strokeDasharray={f === 1.0 ? '0' : '2 3'}
      />
    );
  });

  return (
    <div className="pizza-chart">
      <div className="pizza-chart__title">
        <div className="pizza-chart__name">{subjectName}</div>
        {subjectMeta && <div className="pizza-chart__meta">{subjectMeta}</div>}
      </div>
      <svg
        className="pizza-chart__svg"
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Pizza chart: ${subjectName}`}
      >
        {guides}
        {sliceElements}
        <circle cx={cx} cy={cy} r={innerR - 6} fill="rgba(7,7,28,0.92)" stroke={GROUP_COLORS.attack.fill} strokeWidth="1.5" />
        <text x={cx} y={cy - 2} fontSize="11" fontWeight="700" textAnchor="middle" dominantBaseline="middle" fill={GROUP_COLORS.attack.fill}>
          {centerLabel}
        </text>
        {vsLabel && (
          <text x={cx} y={cy + 14} fontSize="9" fontWeight="500" textAnchor="middle" dominantBaseline="middle" fill="#94a3c8">
            vs {vsLabel}
          </text>
        )}
      </svg>
      <div className="pizza-chart__legend">
        <span><span className="pizza-chart__dot" style={{ background: GROUP_COLORS.attack.fill }} />{GROUP_COLORS.attack.label}</span>
        <span><span className="pizza-chart__dot" style={{ background: GROUP_COLORS.defence.fill }} />{GROUP_COLORS.defence.label}</span>
        <span><span className="pizza-chart__dot" style={{ background: GROUP_COLORS.fitness.fill }} />{GROUP_COLORS.fitness.label}</span>
      </div>
    </div>
  );
}

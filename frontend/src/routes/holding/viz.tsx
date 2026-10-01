/**
 * Визуальные блоки кабинета холдинга: поле, кольцо индекса, распределение региона
 * точками, рассеяние команд. Чистый SVG, цвета — токены шкалы рейтинга.
 */
import type { ReactNode } from 'react';

// ─── Шкала индекса 0–10 ───────────────────────────────────────────────────────
export const indexColor = (v: number | null | undefined): string => {
  if (v == null) return 'var(--rating-none)';
  if (v >= 8) return 'var(--rating-excellent)';
  if (v >= 6) return 'var(--rating-good)';
  if (v >= 4) return 'var(--rating-ok)';
  if (v >= 2) return 'var(--rating-weak)';
  return 'var(--rating-poor)';
};

/** Маленькое кольцо индекса (как в профиле), число в центре. */
export function IndexRing({ value, size = 40, stroke = 4 }: { value: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = value == null ? 0 : Math.max(0, Math.min(1, value / 10));
  return (
    <span className="viz-ring" style={{ width: size, height: size }} title={value == null ? 'мало минут для сравнения' : `индекс ${value.toFixed(1)} из 10`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={indexColor(value)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${p * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="viz-ring__num" style={{ fontSize: Math.round(size * 0.34) }}>{value == null ? '—' : value.toFixed(1)}</span>
    </span>
  );
}

// ─── Поле ─────────────────────────────────────────────────────────────────────
export type SlotId = 'GK' | 'LB' | 'LCB' | 'RCB' | 'RB' | 'DM' | 'CM' | 'LW' | 'ST' | 'RW';
/**
 * Схема 4-3-3 (утверждена руководством). Место на горизонтальном поле (атака вправо): x, y — %.
 * places — сколько игроков основы на позиции (центральных полузащитников двое).
 */
export const SLOTS: Record<SlotId, { x: number; y: number; title: string; places: number }> = {
  GK: { x: 8.5, y: 50, title: 'Вратарь', places: 1 },
  LB: { x: 24, y: 11, title: 'Левый защитник', places: 1 }, LCB: { x: 21, y: 36, title: 'Центральный защитник (л)', places: 1 },
  RCB: { x: 21, y: 64, title: 'Центральный защитник (п)', places: 1 }, RB: { x: 24, y: 89, title: 'Правый защитник', places: 1 },
  DM: { x: 40, y: 50, title: 'Опорный полузащитник', places: 1 },
  CM: { x: 60, y: 50, title: 'Центральные полузащитники', places: 2 },
  LW: { x: 80, y: 13, title: 'Левый крайний нападающий', places: 1 }, ST: { x: 88, y: 50, title: 'Центральный нападающий', places: 1 }, RW: { x: 80, y: 87, title: 'Правый крайний нападающий', places: 1 },
};
/**
 * Позиция AvanData → место в 4-3-3 (те же группы, что на бэкенде, federation/positionGroups.ts):
 * атакующие полузащитники (левый/правый/центральный) — одна позиция «центральные полузащитники»;
 * опорные — одна позиция; фулбеки — к крайним защитникам; «левый/правый полузащитник» — к крайним
 * нападающим; левый/правый центральный нападающий — к центральному.
 */
export function slotOf(position: string | null | undefined): SlotId | null {
  const p = (position ?? '').toLowerCase().trim();
  if (!p) return null;
  const right = p.startsWith('прав');
  if (p.includes('вратар')) return 'GK';
  if (p.includes('опорн')) return 'DM';
  if (p.includes('атакующ')) return 'CM';
  if (p.includes('полузащит')) return right ? 'RW' : 'LW';
  if (p.includes('центральный нападающ')) return 'ST';
  if (p.includes('нападающ') || p.includes('форвард')) return right ? 'RW' : 'LW';
  if (p.includes('центральный защит')) return right ? 'RCB' : 'LCB';
  if (p.includes('защитник') || p.includes('фулбек')) return right ? 'RB' : 'LB';
  return null;
}

/** Горизонтальное поле (атака вправо) с разметкой; дети — абсолютно поверх. */
export function Pitch({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`viz-pitch ${className}`}>
      <svg className="viz-pitch__lines" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden>
        <rect x="0.5" y="0.5" width="104" height="67" rx="1" />
        <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
        <circle cx="52.5" cy="34" r="9.15" />
        <circle cx="52.5" cy="34" r="0.6" className="viz-pitch__dot" />
        <rect x="0.5" y="13.85" width="16.5" height="40.3" /><rect x="88" y="13.85" width="16.5" height="40.3" />
        <rect x="0.5" y="24.85" width="5.5" height="18.3" /><rect x="99" y="24.85" width="5.5" height="18.3" />
        <path d="M 17 27.5 A 9.15 9.15 0 0 1 17 40.5" /><path d="M 88 27.5 A 9.15 9.15 0 0 0 88 40.5" />
      </svg>
      {children}
    </div>
  );
}

// ─── Распределение региона точками ────────────────────────────────────────────
export interface SwarmPoint { id: number | string; value: number; mine?: boolean; label?: string; href?: string }
/**
 * Все игроки (или команды) региона точками по шкале; свои — крупные и подписаны.
 * Точки раскладываются в «рой», чтобы не налезать друг на друга.
 */
export function Beeswarm({ points, min = 0, max = 10, height = 120, format = (v: number) => v.toFixed(1), axisLabel, onPick }: { points: SwarmPoint[]; min?: number; max?: number; height?: number; format?: (v: number) => string; axisLabel?: string; onPick?: (id: number | string) => void }) {
  const W = 1000, padX = 24, mid = (height - 12) / 2, r = 3.6, rMine = 7;
  const x = (v: number) => padX + ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * (W - padX * 2);
  // Рой: каждой точке — ближайшее свободное место по вертикали.
  const placed: Array<{ p: SwarmPoint; cx: number; cy: number; rr: number }> = [];
  for (const p of points.slice().sort((a, b) => Number(!!a.mine) - Number(!!b.mine) || a.value - b.value)) {
    const rr = p.mine ? rMine : r;
    const cx = x(p.value);
    let cy = mid;
    for (let k = 0; k < 90; k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 1.45);
      if (Math.abs(off) > mid - rr) continue;   // не выходить за полосу
      const ty = mid + off;
      if (placed.every((q) => Math.hypot(q.cx - cx, q.cy - ty) >= q.rr + rr + 1)) { cy = ty; break; }
    }
    placed.push({ p, cx, cy, rr });
  }
  const ticks = Array.from({ length: 6 }, (_, i) => min + ((max - min) / 5) * i);
  return (
    <svg className="viz-swarm" viewBox={`0 0 ${W} ${height + 18}`} role="img" aria-label={axisLabel ?? 'распределение'}>
      <line x1={padX} x2={W - padX} y1={height - 4} y2={height - 4} className="viz-axis" />
      {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={height - 8} y2={height} className="viz-axis" /><text x={x(t)} y={height + 14} className="viz-tick" textAnchor="middle">{format(t)}</text></g>)}
      {placed.filter((d) => !d.p.mine).map((d) => <circle key={`o${d.p.id}`} cx={d.cx} cy={d.cy} r={d.rr} className="viz-swarm__other"><title>{d.p.label ?? format(d.p.value)}</title></circle>)}
      {placed.filter((d) => d.p.mine).map((d) => (
        <g key={`m${d.p.id}`} className={`viz-swarm__mine${onPick ? ' viz-swarm__mine--link' : ''}`} onClick={onPick ? () => onPick(d.p.id) : undefined}>
          <circle cx={d.cx} cy={d.cy} r={d.rr} fill={indexColor(max === 10 ? d.p.value : null)}><title>{`${d.p.label ?? ''} · ${format(d.p.value)}`}</title></circle>
        </g>
      ))}
    </svg>
  );
}

// ─── Рассеяние команд ─────────────────────────────────────────────────────────
export interface ScatterPoint { id: string; x: number; y: number; label: string; mine?: boolean }
/** Команды лиги: X — сила состава, Y — место в таблице (1 сверху). Свои — подписаны. */
export function TeamScatter({ points, xLabel, yLabel, height = 300 }: { points: ScatterPoint[]; xLabel: string; yLabel: string; height?: number }) {
  if (points.length < 3) return null;
  const W = 640, H = height, pl = 44, pr = 16, pt = 14, pb = 34;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), yMax = Math.max(...ys);
  const sx = (v: number) => pl + ((v - x0) / (x1 - x0 || 1)) * (W - pl - pr);
  const sy = (v: number) => pt + ((v - 1) / (yMax - 1 || 1)) * (H - pt - pb);
  // Ожидание: чем сильнее состав, тем выше место — линия от (min, последнее) к (max, 1).
  return (
    <svg className="viz-scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${xLabel} и ${yLabel}`}>
      <line x1={sx(x0)} y1={sy(yMax)} x2={sx(x1)} y2={sy(1)} className="viz-scatter__expect" />
      {Array.from({ length: yMax }, (_, i) => i + 1).filter((v) => v === 1 || v === yMax || v % 2 === 1).map((v) => <text key={v} x={pl - 8} y={sy(v) + 4} textAnchor="end" className="viz-tick">{v}</text>)}
      <text x={pl} y={H - 6} className="viz-tick">← слабее состав</text>
      <text x={W - pr} y={H - 6} textAnchor="end" className="viz-tick">сильнее состав →</text>
      <text x={12} y={pt + 4} className="viz-tick" transform={`rotate(-90 12 ${pt + 4})`} textAnchor="end">{yLabel}</text>
      {points.filter((p) => !p.mine).map((p) => <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={6} className="viz-scatter__other"><title>{`${p.label}: ${p.y}-е место`}</title></circle>)}
      {points.filter((p) => p.mine).map((p) => (
        <g key={p.id}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={9} className="viz-scatter__mine" />
          <text x={sx(p.x) + 13} y={sy(p.y) + 4} className="viz-scatter__label">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

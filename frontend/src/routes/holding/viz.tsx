/**
 * Визуальные блоки кабинета холдинга: поле, кольцо индекса, распределение региона
 * точками, рассеяние команд. Чистый SVG, цвета — токены шкалы рейтинга.
 */
import type { ReactNode } from 'react';
import { GROUP_TITLE, groupOf, groupOfPosition, type LeaguePlayer, type PositionGroup } from './api';

// ─── Шкала индекса 0–10 ───────────────────────────────────────────────────────
export const indexColor = (v: number | null | undefined): string => {
  if (v == null) return 'var(--rating-none)';
  // Шкала 5–10: 10 — лучший сверстник своей позиции в регионе, 5 — слабейший.
  if (v >= 9) return 'var(--rating-excellent)';
  if (v >= 8) return 'var(--rating-good)';
  if (v >= 7) return 'var(--rating-ok)';
  if (v >= 6) return 'var(--rating-weak)';
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
 * group — специализация, которая закрывает место; places — сколько игроков основы на месте.
 * Сторона (левый/правый) на отбор не влияет: специализация одна, фланг — по тому, где игрок чаще выходил.
 */
export const SLOTS: Record<SlotId, { x: number; y: number; title: string; places: number; group: PositionGroup }> = {
  GK: { x: 8.5, y: 50, title: 'Вратарь', places: 1, group: 'GK' },
  LB: { x: 24, y: 11, title: 'Крайний защитник', places: 1, group: 'FB' }, LCB: { x: 21, y: 36, title: 'Центральный защитник', places: 1, group: 'CB' },
  RCB: { x: 21, y: 64, title: 'Центральный защитник', places: 1, group: 'CB' }, RB: { x: 24, y: 89, title: 'Крайний защитник', places: 1, group: 'FB' },
  DM: { x: 40, y: 50, title: 'Опорная зона', places: 1, group: 'CM' },
  CM: { x: 60, y: 50, title: 'Центральные полузащитники', places: 2, group: 'CM' },
  LW: { x: 80, y: 13, title: 'Крайний нападающий', places: 1, group: 'W' }, ST: { x: 88, y: 50, title: 'Центральный нападающий', places: 1, group: 'ST' }, RW: { x: 80, y: 87, title: 'Крайний нападающий', places: 1, group: 'W' },
};
const SLOT_IDS = Object.keys(SLOTS) as SlotId[];
/** Сколько мест основы у специализации в 4-3-3. */
export const GROUP_PLACES: Record<PositionGroup, number> = { GK: 1, CB: 2, FB: 2, CM: 3, W: 2, ST: 1 };

/** Игрок в основе: main — его специализация; played — выходил здесь, но чаще в другом месте; coach — сюда его ставит тренер. */
export interface Placed { p: LeaguePlayer; slot: SlotId; group: PositionGroup; home: PositionGroup | null; games: number; how: 'main' | 'played' | 'coach' }

const rolesOf = (p: LeaguePlayer) => (p.roles?.length ? p.roles : p.position ? [{ title: p.position, n: Math.max(1, p.mp) }] : []);
/** Матчи игрока по специализациям — из всех позиций, на которых он выходил. */
export function groupGames(p: LeaguePlayer): Map<PositionGroup, number> {
  const m = new Map<PositionGroup, number>();
  for (const r of rolesOf(p)) { const g = groupOfPosition(r.title); if (g) m.set(g, (m.get(g) ?? 0) + r.n); }
  return m;
}
/** Фланг: больше матчей слева — плюс, справа — минус. */
const sideOf = (p: LeaguePlayer) => rolesOf(p).reduce((s, r) => s + (/^лев/i.test(r.title) ? r.n : /^прав/i.test(r.title) ? -r.n : 0), 0);
const holdingMinded = (p: LeaguePlayer) => rolesOf(p).reduce((s, r) => s + (/опорн/i.test(r.title) ? r.n : 0), 0);

/**
 * Основа команды по 4-3-3: по специализациям, без учёта стороны. Сначала каждый — в своей
 * специализации (лучшие по индексу). Недостающее место закрывает тот, кого туда ставит тренер,
 * затем — кто реально выходил на этой позиции; если такой игрок в основе в другой линии, где
 * есть замена, — переставляем. Никто не стоит в основе дважды.
 */
export function lineup(players: LeaguePlayer[], cmp: (a: LeaguePlayer, b: LeaguePlayer) => number, coach?: Map<number, Set<PositionGroup>>): Map<PositionGroup, Placed[]> {
  const groups = Object.keys(GROUP_PLACES) as PositionGroup[];
  const out = new Map<PositionGroup, Placed[]>(groups.map((g) => [g, []]));
  const games = new Map(players.map((p) => [p.id, groupGames(p)]));
  const home = new Map(players.map((p) => [p.id, groupOf(p)]));
  const used = new Set<number>();
  const byCoach = (p: LeaguePlayer, g: PositionGroup) => !!coach?.get(p.id)?.has(g);
  const n = (p: LeaguePlayer, g: PositionGroup) => games.get(p.id)?.get(g) ?? 0;
  const fits = (p: LeaguePlayer, g: PositionGroup) => byCoach(p, g) || (home.get(p.id) === 'GK') === (g === 'GK');   // вратаря в поле не ставим, если не решил тренер
  const can = (p: LeaguePlayer, g: PositionGroup) => fits(p, g) && (byCoach(p, g) || n(p, g) > 0);
  const need = (g: PositionGroup) => GROUP_PLACES[g] - out.get(g)!.length;
  const put = (p: LeaguePlayer, g: PositionGroup, how: Placed['how']) => { out.get(g)!.push({ p, slot: 'GK', group: g, home: home.get(p.id) ?? null, games: n(p, g), how }); used.add(p.id); };
  const free = () => players.filter((p) => !used.has(p.id));
  const rank = (g: PositionGroup) => (a: LeaguePlayer, b: LeaguePlayer) => Number(byCoach(b, g)) - Number(byCoach(a, g)) || n(b, g) - n(a, g) || cmp(a, b);
  const howOf = (p: LeaguePlayer, g: PositionGroup): Placed['how'] => (home.get(p.id) === g ? 'main' : byCoach(p, g) ? 'coach' : 'played');

  // 1. Своя специализация.
  for (const g of groups) for (const p of players.filter((x) => home.get(x.id) === g).sort(cmp).slice(0, GROUP_PLACES[g])) put(p, g, 'main');
  // 2. Из запаса: кого ставит тренер, затем кто выходил здесь.
  for (const g of groups) while (need(g) > 0) {
    const c = free().filter((p) => can(p, g)).sort(rank(g))[0];
    if (!c) break; put(c, g, howOf(c, g));
  }
  // 3. Перестановка из основы, если на его месте есть замена из запаса.
  for (const g of groups) while (need(g) > 0) {
    let moved = false;
    for (const from of groups) {
      if (from === g) continue;
      const sub = free().filter((p) => home.get(p.id) === from || can(p, from)).filter((p) => fits(p, from)).sort(rank(from))[0];
      if (!sub) continue;
      const list = out.get(from)!;
      const mover = list.filter((x) => can(x.p, g)).sort((x, y) => rank(g)(x.p, y.p))[0];
      if (!mover) continue;
      list.splice(list.indexOf(mover), 1); used.delete(mover.p.id);
      put(mover.p, g, howOf(mover.p, g)); put(sub, from, howOf(sub, from));
      moved = true; break;
    }
    if (!moved) break;
  }
  for (const g of groups) out.get(g)!.sort((a, b) => cmp(a.p, b.p));
  return out;
}

/**
 * Расставить основу специализации по местам схемы: фланг — по тому, где игрок чаще выходил;
 * в опорную зону — центральный полузащитник, сильнее всех в игре в обороне.
 */
export function toSlots(byGroup: Map<PositionGroup, Placed[]>): Map<SlotId, Placed[]> {
  const out = new Map<SlotId, Placed[]>(SLOT_IDS.map((s) => [s, []]));
  const at = (x: Placed, s: SlotId) => out.get(s)!.push({ ...x, slot: s });
  const pair = (xs: Placed[], left: SlotId, right: SlotId) => {
    if (xs.length >= 2) { const [a, b] = xs.slice(0, 2).sort((x, y) => sideOf(y.p) - sideOf(x.p)); at(a!, left); at(b!, right); }
    else if (xs[0]) at(xs[0], sideOf(xs[0].p) < 0 ? right : left);
  };
  for (const x of (byGroup.get('GK') ?? []).slice(0, 1)) at(x, 'GK');
  for (const x of (byGroup.get('ST') ?? []).slice(0, 1)) at(x, 'ST');
  pair(byGroup.get('CB') ?? [], 'LCB', 'RCB');
  pair(byGroup.get('FB') ?? [], 'LB', 'RB');
  pair(byGroup.get('W') ?? [], 'LW', 'RW');
  const cm = (byGroup.get('CM') ?? []).slice(0, 3);
  if (cm.length) {
    const dm = cm.slice().sort((x, y) => (y.p.defPct ?? -1) - (x.p.defPct ?? -1) || holdingMinded(y.p) - holdingMinded(x.p))[0]!;
    at(dm, 'DM');
    for (const x of cm) if (x !== dm) at(x, 'CM');
  }
  return out;
}

/** Место запасного на схеме: фланг — по тому, где чаще выходил; центральный полузащитник с сильной игрой в обороне — в опорную зону. */
export function depthSlot(p: LeaguePlayer, g: PositionGroup): SlotId {
  const left = sideOf(p) >= 0;
  switch (g) {
    case 'GK': return 'GK';
    case 'ST': return 'ST';
    case 'CB': return left ? 'LCB' : 'RCB';
    case 'FB': return left ? 'LB' : 'RB';
    case 'W': return left ? 'LW' : 'RW';
    case 'CM': return (p.defPct ?? 0) >= 60 || holdingMinded(p) > 0 ? 'DM' : 'CM';
  }
}

/** Подсказка к игроку не в своей специализации. */
export function placedNote(x: Placed): string | null {
  const base = x.home ? GROUP_TITLE[x.home].toLowerCase() : 'не указана';
  if (x.slot === 'DM' && x.how === 'main') return x.p.defPct != null ? `В опорной зоне — самый сильный в обороне из центральных полузащитников (лучше ${x.p.defPct}% сверстников)` : null;
  if (x.how === 'main') return null;
  return x.how === 'coach'
    ? `Основная позиция — ${base}; здесь его видит тренер`
    : `Основная позиция — ${base}; здесь выходил ${x.games} ${x.games === 1 ? 'раз' : x.games < 5 ? 'раза' : 'раз'}`;
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
export interface SwarmPoint { id: number | string; value: number; mine?: boolean; label?: string; href?: string; /** Вторая школа холдинга — кольцом, чтобы отличать от первой. */ ring?: boolean }
/**
 * Все игроки (или команды) региона точками по шкале; свои — крупные и подписаны.
 * Точки раскладываются в «рой», чтобы не налезать друг на друга.
 */
export function Beeswarm({ points, min = 5, max = 10, height = 120, format = (v: number) => v.toFixed(1), axisLabel, onPick }: { points: SwarmPoint[]; min?: number; max?: number; height?: number; format?: (v: number) => string; axisLabel?: string; onPick?: (id: number | string) => void }) {
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
          {d.p.ring
            ? <circle className="viz-swarm__ring" cx={d.cx} cy={d.cy} r={d.rr - 1.3} fill="#0b1224" style={{ stroke: indexColor(d.p.value) }}><title>{`${d.p.label ?? ''} · ${format(d.p.value)}`}</title></circle>
            : <circle cx={d.cx} cy={d.cy} r={d.rr} fill={indexColor(d.p.value)}><title>{`${d.p.label ?? ''} · ${format(d.p.value)}`}</title></circle>}
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
      <text x={pl} y={H - 6} className="viz-tick">← слабее игра</text>
      <text x={W - pr} y={H - 6} textAnchor="end" className="viz-tick">сильнее игра →</text>
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

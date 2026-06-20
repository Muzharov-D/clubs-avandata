/**
 * Чистая математика клубной «карты потерь» — вынесена из data/routes для ЮНИТ-ТЕСТОВ.
 * На вход — точки с УЖЕ посчитанным game-time% (pct = минуты игрока ÷ доступные
 * минуты команды, cap 1) и кварталом рождения q (0..3). На выход — воронка по
 * кварталам + примеры погребённых Q4.
 */

export interface LossPoint { q: number; pct: number; name: string; team: string }
export interface LossQuarter { q: number; roster: number; medianPct: number; buried15: number; buried30: number; contrib50: number }
export interface LossMapResult {
  roster: number;
  byQuarter: LossQuarter[];
  examplesBuried: Array<{ name: string; team: string; pct: number }>;
  hasData: boolean;
}

/** Медиана (для чётной длины — верхний средний, как в syncLossMap). */
export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
}

/** Квартальная воронка game-time% + примеры погребённых Q4. */
export function lossQuarters(pts: LossPoint[]): LossMapResult {
  const byQuarter: LossQuarter[] = [0, 1, 2, 3].map((qi) => {
    const s = pts.filter((p) => p.q === qi);
    const n = s.length || 1;
    const pc = (f: (x: number) => boolean) => Math.round((s.filter((p) => f(p.pct)).length / n) * 100);
    return {
      q: qi + 1,
      roster: s.length,
      medianPct: Math.round(median(s.map((p) => p.pct)) * 100),
      buried15: pc((x) => x < 0.15),
      buried30: pc((x) => x < 0.30),
      contrib50: pc((x) => x >= 0.50),
    };
  });
  const examplesBuried = pts
    .filter((p) => p.q === 3 && p.pct < 0.15)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6)
    .map((p) => ({ name: p.name, team: p.team, pct: Math.round(p.pct * 100) }));
  return { roster: pts.length, byQuarter, examplesBuried, hasData: pts.length > 0 };
}

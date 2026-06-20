/**
 * Чистая математика участия — вынесена из participationService для ЮНИТ-ТЕСТОВ
 * (без импорта БД/окружения). Формула минут = как в syncLossMap:
 * bench = 0/1 (или boolean); старт с заменой → replaceMin; запас, вышедший на
 * замену → L − минута выхода; запас без выхода → 0.
 */

export interface FfspbParticipation {
  request?: unknown;          // IRI игрока «/api/players/<id>»
  replacedBy?: unknown;       // кто вышел вместо него
  replaceMin?: number;        // минута замены
  bench?: number | boolean;   // 0/1 — был ли в запасе
  number?: number | null;
  team?: { '@id'?: string };
}

/** id из IRI «…/123» или объекта { '@id' }. */
export const idTail = (x: unknown): number | null => {
  const s = typeof x === 'string' ? x : (x as { '@id'?: string } | null)?.['@id'];
  const m = s && String(s).match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
};

/** Минуты каждого игрока матча по participatedPlayers. lengthSec — длина матча (сек), дефолт 70'. */
export function computeMinutes(pp: FfspbParticipation[], lengthSec: number | undefined): Map<number, number> {
  const L = (Number(lengthSec) || 4200) / 60; // мин; дефолт 70'
  // Запасной, вышедший на замену, играл (L − минута выхода). Минуту выхода берём
  // из replaceMin того, кого он заменил (replacedBy указывает на вышедшего).
  const offMin = new Map<number, number>();
  for (const p of pp) {
    if (Number(p.replaceMin) > 0) {
      const rep = idTail(p.replacedBy);
      if (rep != null) offMin.set(rep, Number(p.replaceMin));
    }
  }
  const out = new Map<number, number>();
  for (const p of pp) {
    const pid = idTail(p.request);
    if (pid == null) continue;
    const bench = Number(p.bench) === 1;
    const mins = !bench
      ? (Number(p.replaceMin) > 0 ? Math.min(L, Number(p.replaceMin)) : L)  // в старте (возм. заменён)
      : (offMin.has(pid) ? Math.max(0, L - offMin.get(pid)!) : 0);          // запас: вышел / не вышел
    out.set(pid, Math.round(mins));
  }
  return out;
}

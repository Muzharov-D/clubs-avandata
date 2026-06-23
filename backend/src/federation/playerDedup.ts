/**
 * Дедуп игроков региона. Один человек бывает зарегистрирован в нескольких заявках/клубах
 * с РАЗНЫМИ id AvanData (двойная регистрация, переход) → без дедупа он двоится в рейтинг-
 * лидерборде и сборной. На 1 демо-клубе невидимо, на 70 клубах — ломает доверие к числам.
 *
 * Ключ человека = нормализованное ФИО (порядок слов неважен, ё=е) + год рождения.
 * Слияние: mp суммируем; рейтинг — ВЗВЕШЕННО по числу матчей (rating_i уже среднее по mp_i
 * матчам, поэтому rating_i*mp_i = сумма очков → корректное общее среднее). Представление
 * (клуб/фото/позиция) берём из записи с бОльшим числом матчей.
 *
 * ОГРАНИЧЕНИЕ: два разных человека с одинаковым ФИО и годом рождения сольются в одного.
 * В региональном детском футболе это редко; вызывающая сторона логирует число слияний,
 * чтобы случай был ВИДИМ (а не молчалив) и политику можно было пересмотреть на реальных данных.
 *
 * Чистый модуль (без env/живого API) — тестируется офлайн (playerDedup.test.ts).
 */

/** Нормализация ФИО для ключа человека: нижний регистр, ё→е, порядок слов неважен. */
export const normPlayerName = (s: string): string =>
  s.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean).sort().join(' ');

export interface DedupablePlayer {
  id: number; name: string; birthYear: number | null;
  club: string | null; rating: number | null; mp: number;
}

/** Сливает дубли (одинак. ФИО+г.р., разные id), сохраняя порядок по рейтингу desc. */
export function dedupPlayers<T extends DedupablePlayer>(players: T[]): T[] {
  const byHuman = new Map<string, T & { _pts: number }>();
  for (const p of players) {
    const key = `${normPlayerName(p.name)}|${p.birthYear ?? '?'}`;
    const pts = (p.rating ?? 0) * p.mp;            // суммарные очки этой записи (rating·mp)
    const cur = byHuman.get(key);
    if (!cur) { byHuman.set(key, { ...p, _pts: pts }); continue; }
    const mp = cur.mp + p.mp;
    const totalPts = cur._pts + pts;
    const base = p.mp >= cur.mp ? p : cur;          // представление — у кого больше матчей
    byHuman.set(key, {
      ...base,
      mp,
      rating: mp > 0 ? Math.round(totalPts / mp) : (base.rating ?? null),
      _pts: totalPts,
    } as T & { _pts: number });
  }
  return [...byHuman.values()]
    .map(({ _pts, ...p }) => p as unknown as T)
    .sort((a, b) => (b.rating ?? -1e9) - (a.rating ?? -1e9));
}

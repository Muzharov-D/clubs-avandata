/**
 * Дедуп игроков региона. Один человек бывает зарегистрирован в нескольких заявках/клубах
 * с РАЗНЫМИ id AvanData (двойная регистрация, переход) → без дедупа он двоится в рейтинг-
 * лидерборде и сборной. На 1 демо-клубе невидимо, на 70 клубах — ломает доверие к числам.
 *
 * Ключ человека = нормализованное ФИО (порядок слов неважен, ё=е) + дата рождения:
 * ПОЛНАЯ дата, если она известна (`birthDate`), иначе год (`birthYear`).
 * Слияние: mp суммируем; рейтинг — ВЗВЕШЕННО по числу матчей (rating_i уже среднее по mp_i
 * матчам, поэтому rating_i*mp_i = сумма очков → корректное общее среднее). Представление
 * (клуб/фото/позиция) берём из записи с бОльшим числом матчей.
 *
 * ПОЧЕМУ ПОЛНАЯ ДАТА. На живых данных (7480 записей) ключ по ГОДУ сливает на 121 запись
 * больше, чем ключ по полной дате. Часть этих 121 — действительно опечатки в дате у одного
 * ребёнка (2013-04-12 / 2013-07-12), но отличить их от двух разных детей нельзя. Для профиля
 * безопаснее недослить: показать ребёнка дважды не страшно, слить двух детей в один профиль —
 * недопустимо. Поэтому при известной полной дате ключ строгий.
 *
 * ОГРАНИЧЕНИЕ: если полная дата неизвестна, ключ падает до года — и тогда два разных человека
 * с одинаковым ФИО и годом сольются. Вызывающая сторона логирует число слияний, чтобы случай
 * был ВИДИМ (а не молчалив) и политику можно было пересмотреть на реальных данных.
 *
 * Чистый модуль (без env/живого API) — тестируется офлайн (playerDedup.test.ts).
 */

/** Нормализация ФИО для ключа человека: нижний регистр, ё→е, порядок слов неважен. */
export const normPlayerName = (s: string): string =>
  s.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean).sort().join(' ');

export interface DedupablePlayer {
  id: number; name: string; birthYear: number | null;
  /** Полная дата рождения `YYYY-MM-DD`, если известна — строгая часть ключа. */
  birthDate?: string | null;
  club: string | null; rating: number | null; mp: number;
}

/** Часть ключа по дате: полная дата, если есть, иначе год. */
export const birthKey = (p: { birthDate?: string | null; birthYear: number | null }): string => {
  const d = (p.birthDate ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return String(p.birthYear ?? '?');
};

/** Сливает дубли (одинак. ФИО + дата рождения, разные id), сохраняя порядок по рейтингу desc. */
export function dedupPlayers<T extends DedupablePlayer>(players: T[]): T[] {
  const byHuman = new Map<string, T & { _pts: number }>();
  for (const p of players) {
    const key = `${normPlayerName(p.name)}|${birthKey(p)}`;
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

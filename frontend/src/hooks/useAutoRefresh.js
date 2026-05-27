// Авто-рефетч данных в работающем PWA.
//
// Зачем: cron бэкенда обновляет данные раз в 30 минут, но если родитель открыл
// PWA утром и оставил его открытым — данные могут «застыть» на много часов.
// Этот хук насильно перезапрашивает данные:
//   1. Раз в `interval` (по умолчанию 30 минут) пока вкладка активна.
//   2. При возвращении на вкладку (visibilitychange), если прошло >2 минут с прошлого refetch.
//   3. При возврате онлайна (online event), если перед этим был offline.
//
// Дополнительно: hook возвращает `refetch()` — можно дёрнуть руками
// (например для pull-to-refresh или кнопки "обновить").

import { useEffect, useRef, useCallback } from 'react';

const DEFAULT_INTERVAL = 30 * 60 * 1000;       // 30 минут
const VISIBILITY_THRESHOLD = 2 * 60 * 1000;    // 2 минуты — порог для refetch при возвращении

export function useAutoRefresh(refetchFn, interval = DEFAULT_INTERVAL) {
  const lastRefetchRef = useRef(Date.now());
  const fnRef = useRef(refetchFn);

  // Держим актуальную ссылку на функцию (чтобы не перезапускать таймер при ре-рендерах)
  useEffect(() => { fnRef.current = refetchFn; }, [refetchFn]);

  const refetch = useCallback(() => {
    lastRefetchRef.current = Date.now();
    try { fnRef.current?.(); } catch (_) {}
  }, []);

  useEffect(() => {
    // Таймер: каждые N минут — рефетч если вкладка активна.
    // Если вкладка свернута — пропускаем тик (не тратим батарею).
    const timer = setInterval(() => {
      if (!document.hidden) refetch();
    }, interval);

    // visibilitychange: вкладка стала видимой → если давно не обновлялись, тянем свежее.
    const onVisibility = () => {
      if (document.hidden) return;
      if (Date.now() - lastRefetchRef.current > VISIBILITY_THRESHOLD) refetch();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // online: связь вернулась → пробуем снова.
    const onOnline = () => refetch();
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [interval, refetch]);

  return refetch;
}

// Хелпер: добавляет к URL cache-bust query parameter, который меняется
// каждые `bucketMs` миллисекунд. Это обходит Service Worker stale-кеш —
// каждый bucket получает уникальный URL → SW идёт в сеть, не в кеш.
//
// Пример: в течение 30 мин все запросы идут с одним _t — попадают в кеш.
// Через 30 мин _t меняется → новый URL → fresh fetch.
export function bustCache(url, bucketMs = DEFAULT_INTERVAL) {
  const sep = url.includes('?') ? '&' : '?';
  const bucket = Math.floor(Date.now() / bucketMs);
  return `${url}${sep}_t=${bucket}`;
}

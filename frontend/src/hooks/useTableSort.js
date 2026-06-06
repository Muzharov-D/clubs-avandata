import { useState, useMemo, useCallback } from 'react';

/**
 * Переиспользуемая сортировка строк таблицы по клику на заголовок колонки.
 *
 * Клик по активной колонке — переключает направление (↓/↑). Клик по новой
 * колонке — сортирует по ней (направление по умолчанию: числа ↓, текст ↑, либо
 * заданное `preferDir`). null/NaN всегда уезжают в конец.
 *
 * @template T
 * @param {T[]} rows
 * @param {Object} opts
 * @param {string|null} [opts.initialKey]   стартовая колонка
 * @param {'asc'|'desc'} [opts.initialDir]  стартовое направление
 * @param {Record<string,(row:T)=>(number|string|null|undefined)>} opts.accessors
 *        — функции доступа к сравниваемому значению по ключу колонки
 * @returns {{ sorted: T[], sortKey: string|null, sortDir: 'asc'|'desc',
 *            requestSort: (key:string, preferDir?:'asc'|'desc')=>void }}
 */
export function useTableSort(rows, { initialKey = null, initialDir = 'desc', accessors } = {}) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState(initialDir);

  const requestSort = useCallback((key, preferDir) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(preferDir || 'desc');
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const acc = sortKey && accessors ? accessors[sortKey] : null;
    if (!acc) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const avRaw = acc(a);
      const bvRaw = acc(b);
      const aNum = typeof avRaw === 'number';
      const bNum = typeof bvRaw === 'number';
      // Числовое сравнение, если хоть одно значение число; null/NaN → в конец.
      if (aNum || bNum) {
        const av = aNum && !Number.isNaN(avRaw) ? avRaw : -Infinity;
        const bv = bNum && !Number.isNaN(bvRaw) ? bvRaw : -Infinity;
        if (av === bv) return 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      const as = (avRaw ?? '').toString();
      const bs = (bvRaw ?? '').toString();
      const cmp = as.localeCompare(bs, 'ru');
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir, accessors]);

  return { sorted, sortKey, sortDir, requestSort };
}

/** Индикатор сортировки для заголовка: активный ↓/↑, неактивный — бледный ↕. */
export function sortArrow(active, dir) {
  if (!active) return '↕';
  return dir === 'desc' ? '↓' : '↑';
}

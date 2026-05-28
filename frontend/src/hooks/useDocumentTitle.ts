/**
 * Динамический <title> страницы.
 * Использование: useDocumentTitle('Команда — Clubs Avandata').
 * При размонтировании компонента возвращает предыдущий title.
 */
import { useEffect } from 'react';

const DEFAULT_TITLE = 'Clubs Avandata — кабинет футбольного клуба';

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title.includes('Avandata') ? title : `${title} · Clubs Avandata`;
    return () => { document.title = prev || DEFAULT_TITLE; };
  }, [title]);
}

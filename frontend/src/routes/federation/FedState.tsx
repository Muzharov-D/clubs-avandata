/**
 * Единые состояния кабинета федерации — одна копия, одна разметка.
 * Иконки — тонкие SVG (не эмодзи), текст без технических деталей (env-ключей).
 */
import type { ReactNode } from 'react';

/** Ошибка данных: база разборов временно недоступна. */
export function FedError({ subject = 'База разборов' }: { subject?: string }) {
  return (
    <div className="av-surface av-pad av-note av-rise av-fedstate" style={{ color: 'var(--av-danger)' }}>
      <svg className="av-fedstate__ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" /><line x1="12" y1="7.5" x2="12" y2="13" /><line x1="12" y1="16.4" x2="12" y2="16.5" />
      </svg>
      <span>{subject} временно недоступна — обновите страницу чуть позже.</span>
    </div>
  );
}

/** Пустое состояние: ничего не нашли / нет данных по фильтру. */
export function FedEmpty({ children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="av-empty av-rise">
      <span className="av-empty__icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10.5" cy="10.5" r="6.5" /><line x1="15.5" y1="15.5" x2="20.5" y2="20.5" />
        </svg>
      </span>
      {children}
    </div>
  );
}

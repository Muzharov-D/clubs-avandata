import type { ReactNode } from 'react';

export function FedError({ subject = 'База разборов' }: { subject?: string }) {
  return (
    <div className="fed-empty" style={{ color: 'var(--danger)' }}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden style={{ marginBottom: 12, opacity: 0.6 }}>
        <circle cx="12" cy="12" r="9" /><line x1="12" y1="7.5" x2="12" y2="13" /><line x1="12" y1="16.4" x2="12" y2="16.5" />
      </svg>
      <div>{subject} временно недоступна — обновите страницу чуть позже.</div>
    </div>
  );
}

export function FedEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="fed-empty">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden style={{ marginBottom: 12, opacity: 0.4 }}>
        <circle cx="10.5" cy="10.5" r="6.5" /><line x1="15.5" y1="15.5" x2="20.5" y2="20.5" />
      </svg>
      {children}
    </div>
  );
}

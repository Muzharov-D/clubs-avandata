/**
 * Единые состояния кабинета федерации — одна копия, одна разметка.
 * Раньше «База недоступна» была написана 5 способами (где с <code>, где без);
 * Бонд (compliance) свёл к одному источнику истины.
 */
import type { ReactNode } from 'react';

/** Ошибка данных: база разборов недоступна (нет ключа на сервере). */
export function FedError({ subject = 'База разборов' }: { subject?: string }) {
  return (
    <div className="av-surface av-pad av-note av-rise" style={{ color: 'var(--av-danger)' }}>
      {subject} недоступна — задан ли <code>AVANDATA_API_KEY</code> на сервере?
    </div>
  );
}

/** Пустое состояние: ничего не нашли / нет данных по фильтру. */
export function FedEmpty({ icon = '🔍', children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="av-empty av-rise">
      <div className="av-empty__icon">{icon}</div>
      {children}
    </div>
  );
}

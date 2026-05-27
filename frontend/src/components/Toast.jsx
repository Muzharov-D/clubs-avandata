// Минималистичный toast-провайдер. Без сторонних либ.
// Использование:
//   import { toast } from './Toast';
//   toast.success('Подписка включена');
//   toast.error('Не удалось загрузить');
//   toast.info('Тебе придёт пуш за сутки до матча');
//
// В корне App: <ToastHost />.

import { useEffect, useState } from 'react';
import './Toast.css';

const listeners = new Set();
let nextId = 1;

function emit(item) {
  for (const fn of listeners) fn(item);
}

export const toast = {
  success: (msg, opts) => emit({ id: nextId++, type: 'success', msg, ...opts }),
  error:   (msg, opts) => emit({ id: nextId++, type: 'error',   msg, ...opts }),
  info:    (msg, opts) => emit({ id: nextId++, type: 'info',    msg, ...opts }),
};

export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const fn = (item) => {
      setItems((prev) => [...prev, item]);
      const ttl = item.ttl ?? 4000;
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, ttl);
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-host" aria-live="polite">
      {items.map((it) => (
        <div
          key={it.id}
          className={`toast toast--${it.type}`}
          onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
          role="status"
        >
          <span className="toast__icon" aria-hidden>
            {it.type === 'success' && '✓'}
            {it.type === 'error' && '!'}
            {it.type === 'info' && 'i'}
          </span>
          <span className="toast__msg">{it.msg}</span>
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import './EffectsToggle.css';

const KEY = 'avandata.fx';

/** Прочитать сохранённое состояние эффектов (по умолчанию — включены). */
export function fxEnabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

/** Применить класс fx-off на <html> согласно сохранённому состоянию.
 *  Вызывается из main.tsx ДО рендера, чтобы не было вспышки. */
export function applyFxPref() {
  document.documentElement.classList.toggle('fx-off', !fxEnabled());
}

/**
 * Тумблер эффектов интерфейса (анимации/свечения/mesh). Тренер может выбрать
 * «чистый» режим без движения. Сохраняется в localStorage, применяется мгновенно.
 */
export default function EffectsToggle() {
  const [on, setOn] = useState(fxEnabled);
  const toggle = () => {
    const next = !on;
    setOn(next);
    try { localStorage.setItem(KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
    document.documentElement.classList.toggle('fx-off', !next);
  };
  return (
    <button
      className={`fx-toggle${on ? ' fx-toggle--on' : ''}`}
      onClick={toggle}
      title={on ? 'Эффекты включены — нажмите для чистого режима' : 'Чистый режим — нажмите, чтобы включить эффекты'}
      aria-pressed={on}
      aria-label="Переключить визуальные эффекты"
    >
      <span className="fx-toggle__icon" aria-hidden>{on ? '✦' : '○'}</span>
      <span className="fx-toggle__track"><span className="fx-toggle__knob" /></span>
    </button>
  );
}

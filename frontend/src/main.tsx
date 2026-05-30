import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App';
// @ts-ignore — legacy .jsx
import { applyFxPref } from './components/EffectsToggle';

// Базовая палитра (Montserrat + Xolonium + dark gradient) — общая для всех тенантов
import './styles/legirus-base.css';
import './styles/legirus-app.css';
import './styles/mobile.css';

// Tenant-specific overrides (CSS vars, admin styles)
import './styles/index.css';
// Премиальная тёмная тема (редизайн) — последней, поверх базы
import './styles/theme-upgrade.css';

// Sentry — инициализируем только если в env прописан DSN. В development
// без DSN остаёмся no-op (Sentry.captureException в ErrorBoundary ничего не отправит).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Не отправляем ошибки из dev-режима, чтобы не засорять прод-инбокс
    enabled: import.meta.env.PROD,
  });
}

// Применяем сохранённый выбор «эффекты вкл/выкл» до рендера (без вспышки).
applyFxPref();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA service worker — регистрация только если sw.js существует.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('[sw] регистрация не удалась:', err));
  });
}

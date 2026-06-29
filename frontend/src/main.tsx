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
      .then((reg) => {
        // Принудительная проверка обновления SW при каждом старте — чтобы новый
        // sw.js (с новой стратегией кэша) подхватывался сразу, а не «когда-нибудь».
        reg.update().catch(() => {});
        // Когда новый SW активировался и взял контроль — мягко перезагружаем
        // страницу, чтобы пользователь увидел свежую версию без ручного hard-reload.
        // ЗАЩИТА ОТ ПЕТЛИ: флаг `reloaded` жил только в одной загрузке и сбрасывался
        // при каждом reload → если SW активируется на КАЖДОЙ загрузке (skipWaiting+
        // clients.claim), страница перезагружалась бесконечно (раз в секунду). Теперь
        // троттлим по времени через sessionStorage: не чаще раза в 10 сек. Это рвёт
        // петлю (повторный controllerchange в окне 10с игнорируется), сохраняя
        // одноразовое авто-обновление при настоящем деплое.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          let last = 0;
          try { last = Number(sessionStorage.getItem('sw-reloaded-at') || 0); } catch { /* приватный режим */ }
          if (Date.now() - last < 10_000) return;
          try { sessionStorage.setItem('sw-reloaded-at', String(Date.now())); } catch { /* ignore */ }
          window.location.reload();
        });
      })
      .catch((err) => console.warn('[sw] регистрация не удалась:', err));
  });
}

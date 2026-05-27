// Sentry init для фронта. Импортируется первым в main.jsx, до createRoot.
//
// DSN берём из import.meta.env.VITE_SENTRY_DSN (Vite injectит во время сборки).
// Если переменной нет — Sentry молча отключается. Удобно для локального dev.

import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT
      || (import.meta.env.PROD ? 'production' : 'development'),

    integrations: [
      // Performance Monitoring — измеряем render React-компонентов и навигацию.
      Sentry.browserTracingIntegration(),
    ],

    // 10% запросов трекаем для performance (вариант B).
    // Бесплатный Sentry даёт 10K transactions/мес — нам с большим запасом.
    tracesSampleRate: 0.1,

    // Какие домены инструментировать для distributed tracing (фронт→бэк связи).
    tracePropagationTargets: [
      /^https:\/\/mobile\.legirus\.sportdata\.tech\/api/,
      /^https:\/\/legirus\.sportdata\.tech\/api/,
      /^https:\/\/legirus-api\.onrender\.com\/api/,
      /^\/api\//,
    ],

    sendDefaultPii: true,

    // Игнорируем известный шум, который не помогает дебажить.
    ignoreErrors: [
      // Сетевые ошибки при offline (наш SW часто их триггерит)
      'Failed to fetch',
      'Load failed',
      'NetworkError',
      'AbortError',
      // Известный безвредный шум от ResizeObserver
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Telegram in-app browser injectit свой WebApp SDK и пытается вызвать
      // postEvent (для своих внутренних целей — кнопки, скролл). У нас не
      // Mini App, обработчика нет — Telegram-bridge возвращает Method not found.
      // Безвредно, родитель ничего не видит, но забивает Sentry-квоту.
      'Method not found',
      'Error invoking postEvent',
      // VK / OK / WhatsApp in-app browsers тоже бывают со своими bridge-шумами
      /WebViewJavascriptBridge/i,
      // iOS WKWebView типичные шумы
      'Non-Error promise rejection captured',
      // Расширения браузера лезут в наш код
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],

    // Релиз — берём из env (Vercel задаёт VITE_VERCEL_GIT_COMMIT_SHA автоматом).
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA
      || import.meta.env.VITE_RELEASE,

    beforeSend(event, hint) {
      const err = hint?.originalException;
      const msg = err?.message || event?.message || '';
      if (/offline|cached: false/i.test(msg)) return null;
      return event;
    },
  });

  console.log('[sentry] frontend monitoring enabled');
} else if (import.meta.env.DEV) {
  console.log('[sentry] VITE_SENTRY_DSN not set — error tracking disabled');
}

export { Sentry };

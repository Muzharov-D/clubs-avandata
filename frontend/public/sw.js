// АванDата service worker — push-уведомления + offline-first cache.
//
// Стратегии кеширования:
//   * HTML (navigation): network-first с таймаутом 2.5 сек, fallback на cache → "/" из cache.
//   * /assets/* (JS/CSS с хешем в имени): cache-first навсегда.
//   * /icons/*, /legirus.png, manifest: cache-first.
//   * /api/public/*: stale-while-revalidate — мгновенно из кеша + параллельно обновляем.
//   * Cross-origin: passthrough (браузерный HTTP-кеш делает свою работу).
//
// При деплое: меняем CACHE_VERSION → старый SW активируется, удаляет старые кеши,
// шлёт `sw-updated` всем вкладкам, фронт показывает мягкий toast "Обновлена версия".
//
// Версионирование: ровно одна строка ниже. Меняй её в каждом коммите, который меняет
// поведение SW (новые роуты для prefetch, изменения стратегий и т.п.).
// При деплое новой версии — обновить ОБА: CACHE_VERSION здесь
// и EXPECTED_SW_VERSION в frontend/src/main.jsx.
// Иначе self-heal механизм не сработает корректно.
const CACHE_VERSION = 'v12-2026-05-26-fix-foreign-stats';
const STATIC_CACHE = `legirus-static-${CACHE_VERSION}`;
const API_CACHE = `legirus-api-${CACHE_VERSION}`;

// Минимальный набор для бута оффлайн. Vite-ассеты (с хешем) подтянутся cache-first
// при первом онлайн-визите и останутся навсегда (пока не сменится hash).
const STATIC_PRECACHE = [
  '/',
  '/icons/legirus.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/site.webmanifest',
];

// ───────── lifecycle ─────────

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      // addAll fail-fast: если хоть один URL не отдался — install провалится.
      // Поэтому используем individual put-ы и игнорируем единичные ошибки.
      await Promise.all(STATIC_PRECACHE.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res.ok) await cache.put(url, res);
        } catch (_) {}
      }));
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Чистим все наши старые версии кешей
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((k) => k.startsWith('legirus-') && !k.endsWith(CACHE_VERSION))
        .map((k) => caches.delete(k))
      );
    } catch (_) {}
    await self.clients.claim();
    // Уведомляем все открытые вкладки что новая версия SW активирована
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clients) {
        try { c.postMessage({ type: 'sw-updated', version: CACHE_VERSION }); } catch (_) {}
      }
    } catch (_) {}
  })());
});

// ───────── fetch — главный роутер ─────────

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT не кешируем

  const url = new URL(req.url);

  // Cross-origin: пусть браузер сам решает (FFSPB shields, внешние картинки)
  if (url.origin !== self.location.origin) return;

  // /api/public/* — stale-while-revalidate (расписание, таблицы, тренировки)
  if (url.pathname.startsWith('/api/public/')) {
    event.respondWith(staleWhileRevalidate(req, API_CACHE));
    return;
  }

  // /api/* (защищённые роуты) — НЕ кешируем, всегда сеть
  if (url.pathname.startsWith('/api/')) return;

  // Vite ассеты с хешем — cache-first навсегда
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Иконки/manifest — cache-first
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Navigation (HTML) — network-first с timeout, fallback на "/"
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstHTML(req, STATIC_CACHE, 2500));
    return;
  }
});

// ───────── стратегии ─────────

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const networkPromise = fetch(req).then((res) => {
    // Кешируем только успешные 2xx
    if (res && res.ok) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);

  if (cached) {
    // Параллельно обновляем кеш, но клиенту отдаём кеш мгновенно
    networkPromise.catch(() => {});
    return cached;
  }

  // Кеша нет — ждём сеть
  const fresh = await networkPromise;
  if (fresh) return fresh;

  // Полный отказ
  return new Response(JSON.stringify({ error: 'offline', cached: false }), {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function networkFirstHTML(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const fetchPromise = fetch(req);
    const res = await Promise.race([
      fetchPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (_) {
    // Сеть отвалилась или таймаут — берём кеш этого URL, либо "/"
    const cached = await cache.match(req);
    if (cached) return cached;
    const root = await cache.match('/');
    if (root) return root;
    // Совсем offline и в кеше пусто — простая offline-страница
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Оффлайн</title>' +
      '<div style="font-family:system-ui;padding:40px;text-align:center;color:#fff;background:#1a0606;min-height:100vh">' +
      '<h1>Нет подключения</h1><p>Откройте страницу хотя бы раз онлайн, чтобы пользоваться оффлайн.</p></div>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }
}

// ───────── push ─────────

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'АванDата', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'АванDата';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'avandata',
    data: payload.data || {},
    requireInteraction: true,
    vibrate: [80, 40, 80],
  };

  event.waitUntil((async () => {
    try { await self.registration.showNotification(title, options); } catch (e) {}
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      try { c.postMessage({ type: 'push', title, body: options.body, url: payload.url || '/', data: options.data }); } catch (_) {}
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      } catch (_) {}
    }
    await self.clients.openWindow(targetUrl);
  })());
});

// ───────── message: команды от страницы (например принудительный skipWaiting) ─────────

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'skip-waiting') {
    self.skipWaiting();
  } else if (event.data.type === 'get-version') {
    // Self-heal механизм: страница пингует SW и сверяет версию с
    // EXPECTED_SW_VERSION (в main.jsx). Если SW старый (без этого handler'а) —
    // ответа не будет, JS триггернет unregister + reload.
    // Отвечаем через MessageChannel port (event.ports[0]) если он передан,
    // иначе через event.source (postMessage от клиента).
    const payload = { type: 'sw-version', version: CACHE_VERSION };
    if (event.ports && event.ports[0]) {
      try { event.ports[0].postMessage(payload); } catch (_) {}
    } else if (event.source) {
      try { event.source.postMessage(payload); } catch (_) {}
    }
  }
});

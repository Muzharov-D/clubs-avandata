// Frontend хелперы для PWA push-подписки.
// Использует Service Worker (/sw.js) и PushManager API.
//
// Поток: pushSupported() -> requestAndSubscribe() -> backend POST /api/push/subscribe
// Хранит в localStorage флаг подписки для UX (показать toggle).

import { apiFetch } from './api';

const LS_KEY = 'avandata.push.subscribed';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isSubscribedLocally() {
  try { return localStorage.getItem(LS_KEY) === '1'; }
  catch { return false; }
}

export async function getRegistration() {
  if (!pushSupported()) return null;
  // Регистрируем sw.js (idempotent)
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Запрашивает разрешение и подписывает на push.
// Возвращает PushSubscription JSON или null если пользователь отказал.
export async function requestAndSubscribe() {
  if (!pushSupported()) throw new Error('Push не поддерживается этим браузером');

  const reg = await getRegistration();
  if (!reg) throw new Error('Не удалось зарегистрировать service worker');

  // Запрашиваем VAPID public key
  let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    try {
      const resp = await apiFetch('/api/push/public-key');
      publicKey = resp.publicKey;
    } catch (e) {
      throw new Error('Push не настроен на сервере: ' + e.message);
    }
  }
  if (!publicKey) throw new Error('VAPID public key не получен');

  // Спрашиваем permission
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Пользователь не разрешил уведомления');
  }

  // Если уже подписаны — возвращаем существующую
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // Шлём на backend
  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: subscription.toJSON(),
  });

  try { localStorage.setItem(LS_KEY, '1'); } catch {}
  return subscription.toJSON();
}

export async function unsubscribe() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try { localStorage.removeItem(LS_KEY); } catch {}
    return true;
  }
  try {
    await apiFetch('/api/push/unsubscribe', {
      method: 'POST',
      body: { endpoint: sub.endpoint },
    });
  } catch (_) {}
  await sub.unsubscribe();
  try { localStorage.removeItem(LS_KEY); } catch {}
  return true;
}

export async function checkExistingSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.toJSON() : null;
  } catch { return null; }
}

// Prefs API (бэкенд: routes/push.js).
export async function fetchPushPreferences(endpoint) {
  return apiFetch(`/api/push/preferences?endpoint=${encodeURIComponent(endpoint)}`);
}

export async function setPushPreference(endpoint, kind, enabled) {
  return apiFetch('/api/push/preferences', {
    method: 'PATCH',
    body: { endpoint, kind, enabled },
  });
}

// ============================================================================
// PUBLIC (анонимный) push — для родителей на mobile.legirus без авторизации.
// Бьём в /api/public/push/* через обычный fetch (без Bearer-токена).
// ============================================================================

const PUBLIC_API = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return String(base).replace(/\/+$/, '') + '/api/public/push';
})();

export async function requestAndSubscribePublic(ageGroup) {
  if (!pushSupported()) throw new Error('Push не поддерживается этим браузером');
  const reg = await getRegistration();
  if (!reg) throw new Error('Не удалось зарегистрировать service worker');

  // VAPID public key
  let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    const r = await fetch(`${PUBLIC_API}/public-key`);
    if (!r.ok) throw new Error('Push не настроен на сервере');
    publicKey = (await r.json()).publicKey;
  }

  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Пользователь не разрешил уведомления');

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const r = await fetch(`${PUBLIC_API}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...subscription.toJSON(), ageGroup: ageGroup ?? null }),
  });
  if (!r.ok) throw new Error('Ошибка подписки: ' + r.status);

  try { localStorage.setItem(LS_KEY, '1'); } catch {}
  return subscription.toJSON();
}

// Частичный unsubscribe: убрать одну возрастную группу из подписки.
// Backend вернёт fullyUnsubscribed=true если массив стал пустым — тогда
// чистим browser-side subscription + localStorage.
export async function unsubscribePublicAge(ageGroup) {
  if (!pushSupported()) return { ok: false };
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return { ok: false };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try { localStorage.removeItem(LS_KEY); } catch {}
    return { ok: true, fullyUnsubscribed: true };
  }
  let resp = { ok: true, fullyUnsubscribed: false, teamIds: [] };
  try {
    const r = await fetch(`${PUBLIC_API}/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, ageGroup }),
    });
    resp = await r.json();
  } catch (_) {}
  if (resp.fullyUnsubscribed) {
    await sub.unsubscribe();
    try { localStorage.removeItem(LS_KEY); } catch {}
  }
  return resp;
}

// Полный unsubscribe — снести подписку целиком.
export async function unsubscribePublic() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try { localStorage.removeItem(LS_KEY); } catch {}
    return true;
  }
  try {
    await fetch(`${PUBLIC_API}/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch (_) {}
  await sub.unsubscribe();
  try { localStorage.removeItem(LS_KEY); } catch {}
  return true;
}

// Подписан ли пользователь конкретно на эту возрастную группу
// (есть active browser sub + ageGroup в teamIds на backend).
// Возвращает { subscribed: bool, teamIds: string[] }.
export async function isSubscribedToAgePublic(ageGroup) {
  if (!pushSupported()) return { subscribed: false, teamIds: [] };
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return { subscribed: false, teamIds: [] };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { subscribed: false, teamIds: [] };
    const r = await fetch(`${PUBLIC_API}/preferences?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (!r.ok) return { subscribed: false, teamIds: [] };
    const data = await r.json();
    const teamIds = data.teamIds || [];
    const targetTeamId = `legirus-${ageGroup}`;
    return { subscribed: teamIds.includes(targetTeamId), teamIds };
  } catch (_) {
    return { subscribed: false, teamIds: [] };
  }
}

export async function fetchPushPreferencesPublic(endpoint) {
  const r = await fetch(`${PUBLIC_API}/preferences?endpoint=${encodeURIComponent(endpoint)}`);
  if (!r.ok) throw new Error('Ошибка загрузки настроек: ' + r.status);
  return r.json();
}

export async function setPushPreferencePublic(endpoint, kind, enabled) {
  const r = await fetch(`${PUBLIC_API}/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, kind, enabled }),
  });
  if (!r.ok) throw new Error('Ошибка сохранения: ' + r.status);
  return r.json();
}

// Тестовое push — даём пользователю удостовериться что всё работает.
// Возвращает { ok: true, sent: 1 } если ок, или статус 410 если endpoint протух.
export async function sendTestPushPublic(endpoint) {
  const r = await fetch(`${PUBLIC_API}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Ошибка ' + r.status));
  return data;
}

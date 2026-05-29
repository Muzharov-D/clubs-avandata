import { toast } from '../components/Toast';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
// Clubs Avandata backend живёт под /api/v1/ (vs legacy Легируса /api/).
const PREFIX = `${API_BASE}/api/v1`;

// ── Direct Render URL для долгих запросов (PDF parsing ~3 мин)
// Vercel proxy убивает rewrite через ~30 секунд (ROUTER_EXTERNAL_TARGET_ERROR).
// Для upload-pdf идём напрямую к Render API, минуя Vercel rewrite.
const DIRECT_API_BASE = import.meta.env.VITE_API_DIRECT_URL
  || 'https://clubs-avandata-api.onrender.com';
const DIRECT_PREFIX = `${DIRECT_API_BASE.replace(/\/+$/, '')}/api/v1`;

const TOKEN_KEY = 'avandata.auth.token';
const USER_KEY = 'avandata.auth.user';

// Эндпоинты, ошибки которых НЕ показываем тостом (поллинг, фоновые проверки,
// первичный auth/me — там вызывающий код сам решает что делать).
const SILENT_PATHS = ['/auth/me', '/auth/refresh', '/push/'];
function isSilent(path) { return SILENT_PATHS.some((p) => path.includes(p)); }

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// Таймаут на любой fetch в 15 секунд. Без него мобильный браузер на нестабильной
// сети может ждать ответа бесконечно — пользователь видит «Проверка…» и не понимает
// что произошло. С AbortController fetch аккуратно reject'ится и UI показывает
// человекочитаемое сообщение.
const FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function fetchJson(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Сериализуем JSON-тело и проставляем content-type, если передан body как объект
  let body = opts.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  let res;
  try {
    res = await fetchWithTimeout(`${PREFIX}${path}`, { ...opts, headers, body });
  } catch (e) {
    if (e.name === 'AbortError') {
      const m = 'Превышено время ожидания. Проверьте интернет-соединение.';
      if (!isSilent(path)) toast.error(m);
      throw new Error(m);
    }
    const m = 'Не удалось связаться с сервером. Проверьте интернет.';
    if (!isSilent(path)) toast.error(m);
    throw new Error(m);
  }

  if (res.status === 401) {
    setToken(null);
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      // Не делаем hard reload (он стирает toast). Показываем сообщение и просим
      // перейти на /login через SPA-навигацию (window.history).
      toast.info('Сессия истекла, нужно войти заново');
      // Даем 600ms на показ toast'а, потом редирект
      setTimeout(() => { window.location.href = '/login'; }, 600);
    }
    throw new Error('Не авторизован');
  }
  if (res.status === 403) {
    const m = 'Нет прав на это действие';
    if (!isSilent(path)) toast.error(m);
    throw new Error(m);
  }
  if (res.status >= 500) {
    const m = `Сервер временно недоступен (${res.status}). Попробуйте через минуту.`;
    if (!isSilent(path)) toast.error(m);
    throw new Error(m);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `Ошибка ${res.status}: ${res.statusText}`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    // 4xx: пользовательская ошибка, тостим
    if (!isSilent(path)) toast.error(msg);
    throw new Error(msg);
  }
  // Пустой ответ (204) — возвращаем null
  if (res.status === 204) return null;
  return res.json();
}

// Публичный helper для модулей, которым нужен авторизованный fetch (push.js и т.п.)
export const apiFetch = (path, opts) => fetchJson(path, opts);

// Auth — Clubs Avandata.
// Поле «Логин» в форме = email (для platform_admin) или username (для legacy
// клубных пользователей). Если содержит '@' — отправляем как email, иначе как
// username. Опциональный tenantSlug — для входа в конкретный клуб.
export async function login(loginOrEmail, password, tenantSlug) {
  const isEmail = String(loginOrEmail).includes('@');
  const body = isEmail
    ? { email: loginOrEmail, password, tenantSlug: tenantSlug || undefined }
    : { username: loginOrEmail, password, tenantSlug: tenantSlug || undefined };
  let res;
  try {
    res = await fetchWithTimeout(`${PREFIX}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Превышено время ожидания входа. Проверьте интернет-соединение.');
    }
    throw new Error('Не удалось связаться с сервером. Проверьте интернет.');
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let msg = `Ошибка входа (${res.status})`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  const data = JSON.parse(text);
  setToken(data.accessToken);
  try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch (_) {}
  return { user: data.user, tenant: data.tenant ?? null };
}

// Установка пароля по invite-ссылке (?token=...). Без авторизации.
export async function setPassword(token, password) {
  let res;
  try {
    res = await fetchWithTimeout(`${PREFIX}/auth/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
  } catch (e) {
    throw new Error('Не удалось связаться с сервером. Проверьте интернет.');
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let msg = `Ошибка (${res.status})`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  return JSON.parse(text || '{}');
}

// /api/v1/auth/me возвращает только { user: AccessTokenPayload } — это id/role/
// tenantId/teamId/playerId без email/fullName. На фронте нам нужен полный user
// с fullName, который мы получили в login(). Поэтому fetchMe читает из
// localStorage; backend-вариант с merge придёт в W5 (auth API port).
export async function fetchMe() {
  // Дёргаем backend (он же отдаёт tenant). Fallback на localStorage если offline.
  try {
    const res = await fetchJson('/auth/me');
    if (res?.user) {
      try { localStorage.setItem(USER_KEY, JSON.stringify(res.user)); } catch (_) {}
      return res; // { user, tenant }
    }
  } catch (_) { /* fallthrough */ }
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) throw new Error('not logged in');
    return { user: JSON.parse(raw), tenant: null };
  } catch (e) {
    throw new Error('Не авторизован');
  }
}

export function logout() {
  setToken(null);
  // Чистим все клиентские ключи (старые legirus.* и наши avandata.*),
  // чтобы при следующем login не было залипшего team_id и т.п.
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('legirus.') || k.startsWith('avandata.')) {
        localStorage.removeItem(k);
      }
    }
  } catch (_) {}
}
export const changePassword = (currentPassword, newPassword) =>
  fetchJson('/auth/change-password', {
    method: 'POST', body: { currentPassword, newPassword },
  });

// Data
export const fetchTeams = () => fetchJson('/data/teams');
export const fetchPlayers = (teamId) =>
  fetchJson(`/data/players${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`);
export const fetchMatches = (teamId) =>
  fetchJson(`/data/matches${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`);
export const fetchMatch = (id) => fetchJson(`/data/match/${id}`);
export const deleteMatch = (id) => fetchJson(`/data/match/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const updateMatchCoachComment = (age, extMatchId, comment) =>
  fetchJson(`/data/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}/comment`, {
    method: 'PATCH', body: { comment },
  });
export const fetchMetrics = () => fetchJson('/data/metrics');
export const fetchStandings = (ageGroup) => fetchJson(`/data/standings/${encodeURIComponent(ageGroup)}`);
export const fetchStandingsList = () => fetchJson('/data/standings');
export const fetchClubRank = () => fetchJson('/public/club-rank');
export const fetchPlayer = (playerId) => fetchJson(`/data/player/${encodeURIComponent(playerId)}`);
export const fetchCup = (ageGroup) => fetchJson(`/data/cup/${encodeURIComponent(ageGroup)}`);
export const fetchCupList = () => fetchJson('/data/cup');
export const fetchCalendar = (ageGroup) => fetchJson(`/data/calendar/${encodeURIComponent(ageGroup)}`);
export const fetchCalendarList = () => fetchJson('/data/calendar');

// === Trainings (Sprint 5.1) ===
export const fetchTrainingsByTeam = (teamId, params = {}) => {
  const q = new URLSearchParams();
  if (params.scope) q.set('scope', params.scope);
  if (params.from)  q.set('from', params.from);
  if (params.to)    q.set('to', params.to);
  if (params.limit) q.set('limit', params.limit);
  const qs = q.toString();
  return fetchJson(`/trainings/team/${encodeURIComponent(teamId)}${qs ? `?${qs}` : ''}`);
};
export const fetchTraining = (id) => fetchJson(`/trainings/${encodeURIComponent(id)}`);
export const createTraining = (body) => fetchJson('/trainings', { method: 'POST', body });
export const updateTraining = (id, body) => fetchJson(`/trainings/${encodeURIComponent(id)}`, { method: 'PATCH', body });
export const deleteTraining = (id) => fetchJson(`/trainings/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const fetchAttendance = (id) => fetchJson(`/trainings/${encodeURIComponent(id)}/attendance`);
export const saveAttendance = (id, marks) => fetchJson(`/trainings/${encodeURIComponent(id)}/attendance`, { method: 'POST', body: { marks } });
export const fetchPlayerAttendanceStats = (teamId, playerId, params = {}) => {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return fetchJson(`/trainings/team/${encodeURIComponent(teamId)}/player/${encodeURIComponent(playerId)}/stats${qs ? `?${qs}` : ''}`);
};
export const respondTraining = (trainingId, status, note) =>
  fetchJson(`/trainings/${encodeURIComponent(trainingId)}/respond`, {
    method: 'POST', body: { status, note },
  });

// === Callups (Sprint 5.B) ===
export const fetchCallupsByMatch = (age, extMatchId) =>
  fetchJson(`/callups/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}`);
export const fetchCallupSummary = (age, extMatchId) =>
  fetchJson(`/callups/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}/summary`);
export const fetchMyCallups = () => fetchJson('/callups/me');
export const callPlayers = (age, extMatchId, playerIds) =>
  fetchJson(`/callups/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}/call`,
            { method: 'POST', body: { playerIds } });
export const callAllPending = (age, extMatchId) =>
  fetchJson(`/callups/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}/call-all`,
            { method: 'POST', body: {} });
export const removeFromCallup = (age, extMatchId, playerId) =>
  fetchJson(`/callups/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}/player/${encodeURIComponent(playerId)}`,
            { method: 'DELETE' });
export const respondCallup = (age, extMatchId, status, note, playerId) =>
  fetchJson(`/callups/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}/respond`,
            { method: 'POST', body: { status, note, playerId } });

export async function uploadPdf(file, teamId, tournament, excel) {
  const fd = new FormData();
  fd.append('file', file);
  if (excel) fd.append('excel', excel);
  if (teamId) fd.append('teamId', teamId);
  if (tournament) fd.append('tournament', tournament);
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // Идём НАПРЯМУЮ к Render минуя Vercel proxy (rewrite убивает запрос через
  // ~30s, а парсинг PDF — до 3 минут). CORS должен пускать наш Vercel-домен.
  const res = await fetch(`${DIRECT_PREFIX}/upload-pdf`, {
    method: 'POST',
    body: fd,
    headers,
    credentials: 'include',
  });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Не авторизован');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `Upload failed: ${res.status}`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
}

export function toAssetUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/assets')) return API_BASE ? `${API_BASE}${p}` : p;
  return p;
}

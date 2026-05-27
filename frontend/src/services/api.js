const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
const PREFIX = `${API_BASE}/api`;
const TOKEN_KEY = 'legirus.auth.token';

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
      throw new Error('Превышено время ожидания. Проверьте интернет-соединение.');
    }
    throw new Error('Не удалось связаться с сервером. Проверьте интернет.');
  }

  if (res.status === 401) {
    setToken(null);
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Не авторизован');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `API ${res.status}: ${res.statusText}`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  // Пустой ответ (204) — возвращаем null
  if (res.status === 204) return null;
  return res.json();
}

// Публичный helper для модулей, которым нужен авторизованный fetch (push.js и т.п.)
export const apiFetch = (path, opts) => fetchJson(path, opts);

// Auth
export async function login(username, password) {
  let res;
  try {
    res = await fetchWithTimeout(`${PREFIX}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
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
  setToken(data.token);
  return data.user;
}
export async function fetchMe() { return fetchJson('/auth/me'); }
export function logout() { setToken(null); }
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

export async function uploadPdf(file, teamId, tournament) {
  const fd = new FormData();
  fd.append('file', file);
  if (teamId) fd.append('teamId', teamId);
  if (tournament) fd.append('tournament', tournament);
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${PREFIX}/upload-pdf`, { method: 'POST', body: fd, headers });
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

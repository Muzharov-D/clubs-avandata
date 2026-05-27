// Управление личным набором команд родителя в localStorage.
//
// Модель:
//   myTeams    — массив возрастных групп (например ['2012', '2014']).
//                Команды в порядке добавления, без дублей.
//   activeTeam — какая команда сейчас открыта (одна из myTeams).
//
// Зачем: родитель с двумя детьми (один в 2012, другой в 2014) хочет
// держать обе команды в личном «избранном» и переключаться между ними табами.
//
// Миграция: при первом запуске на новой версии берём legacy `legirus.public.lastAge`
// и кладём в myTeams[lastAge] + activeTeam = lastAge.

import { AGE_GROUPS } from './ageRating';
import { useSyncExternalStore } from 'react';

const KEY_MY_TEAMS    = 'legirus.public.myTeams';
const KEY_ACTIVE_TEAM = 'legirus.public.activeTeam';
const KEY_LEGACY_LAST = 'legirus.public.lastAge';

// Кастомный event для подписки внутри одной вкладки. localStorage 'storage' event
// не стреляет в той же вкладке где было setItem, поэтому используем CustomEvent.
const EVT = 'legirus-myteams-changed';

function isValidAge(age) {
  return typeof age === 'string' && AGE_GROUPS.includes(age);
}

function emitChange() {
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch (_) {}
}

// ─────── низкоуровневое чтение/запись ───────

export function readMyTeams() {
  // Сначала проверяем новый ключ
  try {
    const raw = localStorage.getItem(KEY_MY_TEAMS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidAge);
      }
    }
  } catch (_) {}

  // Миграция со старого lastAge
  try {
    const legacy = localStorage.getItem(KEY_LEGACY_LAST);
    if (legacy && isValidAge(legacy)) {
      const seeded = [legacy];
      localStorage.setItem(KEY_MY_TEAMS, JSON.stringify(seeded));
      localStorage.setItem(KEY_ACTIVE_TEAM, legacy);
      // legacy ключ не удаляем сразу — пусть полежит на случай отката
      return seeded;
    }
  } catch (_) {}

  return [];
}

export function readActiveTeam() {
  try {
    const v = localStorage.getItem(KEY_ACTIVE_TEAM);
    if (v && isValidAge(v)) return v;
  } catch (_) {}
  // Fallback на первую из myTeams
  const teams = readMyTeams();
  return teams[0] || null;
}

export function writeMyTeams(teams) {
  try {
    const clean = (teams || []).filter(isValidAge);
    // unique, сохраняя порядок
    const uniq = [...new Set(clean)];
    localStorage.setItem(KEY_MY_TEAMS, JSON.stringify(uniq));
    emitChange();
  } catch (_) {}
}

export function writeActiveTeam(age) {
  try {
    if (!isValidAge(age)) return;
    localStorage.setItem(KEY_ACTIVE_TEAM, age);
    emitChange();
  } catch (_) {}
}

// ─────── мутации ───────

// Добавить команду (если новой нет — добавит в конец) + сделать активной.
export function addAndActivate(age) {
  if (!isValidAge(age)) return;
  const cur = readMyTeams();
  const next = cur.includes(age) ? cur : [...cur, age];
  writeMyTeams(next);
  writeActiveTeam(age);
}

// Просто переключить активную (без добавления — age должен быть в myTeams).
export function switchActive(age) {
  if (!isValidAge(age)) return;
  writeActiveTeam(age);
}

// Удалить команду из myTeams. Если она была активной — выбираем первую оставшуюся.
export function removeTeam(age) {
  const cur = readMyTeams();
  const next = cur.filter((t) => t !== age);
  writeMyTeams(next);
  const active = readActiveTeam();
  if (active === age) {
    writeActiveTeam(next[0] || null);
  }
}

// ─────── React-хук с подпиской на изменения ───────

function subscribe(cb) {
  const onLocal = () => cb();
  const onStorage = (e) => {
    if (!e.key || e.key === KEY_MY_TEAMS || e.key === KEY_ACTIVE_TEAM) cb();
  };
  window.addEventListener(EVT, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVT, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot() {
  // Возвращаем стабильный JSON-строку как identity для useSyncExternalStore
  return JSON.stringify({
    teams: readMyTeams(),
    active: readActiveTeam(),
  });
}

function getServerSnapshot() {
  return JSON.stringify({ teams: [], active: null });
}

export function useMyTeams() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { teams, active } = JSON.parse(snap);
  return { teams, active };
}

// Конструктор кабинета — провайдер видимости блоков (per-user, backend-хранение).
//
// Грузит конфиг 1 раз после логина (тренеру), читает localStorage-кеш для
// мгновенной корректной отрисовки (без мигания скрытых блоков), бэкенд — источник
// истины. Изменения оптимистичны + debounce-PUT всего конфига.
//
// Модель: layout = { [pageId]: { [blockId]: false } }. Храним только СКРЫТОЕ
// (false); отсутствие ключа = блок видим (дефолт). isVisible = !== false.

import {
  createContext, useContext, useEffect, useRef, useState, useCallback, useMemo,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchDashboardLayout, saveDashboardLayout } from '../services/api';

const Ctx = createContext(null);

const SAVE_DEBOUNCE_MS = 500;
const cacheKey = (userId) => `avandata.dashboard.layout.${userId || 'anon'}`;

function readCache(userId) {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
function writeCache(userId, layout) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(layout)); } catch { /* quota */ }
}

// Безопасный дефолт для компонентов вне провайдера (публичные экраны): всё видимо.
const FALLBACK = {
  layout: {},
  isVisible: () => true,
  toggle: () => {},
  setBlock: () => {},
  resetPage: () => {},
  resetAll: () => {},
  editMode: false,
  setEditMode: () => {},
  canEdit: false,
};

export function DashboardLayoutProvider({ children }) {
  const { user, isCoach } = useAuth();
  const userId = user?.id || null;
  const { pathname } = useLocation();

  const [layout, setLayout] = useState({});
  const [editMode, setEditMode] = useState(false);
  const saveTimer = useRef(null);

  // Загрузка конфига — только тренеру (фича его кабинета; у остальных всё видимо).
  useEffect(() => {
    if (!userId || !isCoach) { setLayout({}); return; }
    const cached = readCache(userId);
    if (cached) setLayout(cached);
    let cancelled = false;
    fetchDashboardLayout()
      .then((res) => {
        if (cancelled) return;
        const next = res?.layout && typeof res.layout === 'object' && !Array.isArray(res.layout)
          ? res.layout : {};
        setLayout(next);
        writeCache(userId, next);
      })
      .catch(() => { /* остаёмся на кеше / дефолте */ });
    return () => { cancelled = true; };
  }, [userId, isCoach]);

  // При уходе со страницы выключаем режим редактирования.
  useEffect(() => { setEditMode(false); }, [pathname]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Сохранение отделено от чистых state-updater'ов: мутаторы лишь помечают dirty,
  // а эффект ниже дебаунсит PUT. Так нет сайд-эффектов внутри setState (StrictMode
  // и конкурентный режим могут вызвать updater дважды) и мы НЕ сохраняем обратно
  // конфиг, который только что пришёл с сервера при загрузке.
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    if (!userId) return;
    writeCache(userId, layout);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDashboardLayout(layout).catch(() => { /* fetchJson уже стостил ошибку */ });
    }, SAVE_DEBOUNCE_MS);
  }, [layout, userId]);

  // Иммутабельно проставить видимость блока (visible=true → удаляем ключ: дефолт).
  const applyBlock = useCallback((prev, page, id, visible) => {
    const pageCfg = { ...(prev[page] || {}) };
    if (visible) delete pageCfg[id];
    else pageCfg[id] = false;
    const next = { ...prev };
    if (Object.keys(pageCfg).length > 0) next[page] = pageCfg;
    else delete next[page];
    return next;
  }, []);

  const setBlock = useCallback((page, id, visible) => {
    dirtyRef.current = true;
    setLayout((prev) => applyBlock(prev, page, id, visible));
  }, [applyBlock]);

  const toggle = useCallback((page, id) => {
    dirtyRef.current = true;
    // visible-arg = «сейчас скрыт» → переключаемся в видимый, и наоборот.
    setLayout((prev) => applyBlock(prev, page, id, prev?.[page]?.[id] === false));
  }, [applyBlock]);

  const resetPage = useCallback((page) => {
    dirtyRef.current = true;
    setLayout((prev) => {
      if (!prev[page]) return prev;
      const next = { ...prev };
      delete next[page];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    dirtyRef.current = true;
    setLayout({});
  }, []);

  const isVisible = useCallback(
    (page, id) => layout?.[page]?.[id] !== false,
    [layout],
  );

  const value = useMemo(() => ({
    layout,
    isVisible,
    toggle,
    setBlock,
    resetPage,
    resetAll,
    editMode: isCoach ? editMode : false,
    setEditMode,
    canEdit: isCoach,
  }), [layout, isVisible, toggle, setBlock, resetPage, resetAll, editMode, isCoach]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardLayout() {
  return useContext(Ctx) || FALLBACK;
}

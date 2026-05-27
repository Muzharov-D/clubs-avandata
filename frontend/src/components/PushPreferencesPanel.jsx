// Модалка-панель «Настройки уведомлений».
// Показывает список kinds с тумблерами. PATCH'ит на /api/push/preferences.

import { useEffect, useState } from 'react';
import {
  checkExistingSubscription,
  fetchPushPreferences,
  setPushPreference,
  fetchPushPreferencesPublic,
  setPushPreferencePublic,
  sendTestPushPublic,
} from '../services/push';
import './PushPreferencesPanel.css';

// Человекочитаемые названия + описания. Ключи должны совпадать с TOGGLEABLE_KINDS
// в backend/routes/push.js.
const KIND_LABELS = {
  'match-reminder-24h':     { title: 'Напоминание за сутки',      desc: 'Пинг за 24 часа до игры.' },
  'match-lineup-published': { title: 'Состав на матч',            desc: 'Когда судья опубликует заявку.' },
  'match-kickoff':          { title: 'Старт матча',               desc: 'Команды вышли на поле.' },
  'match-events-first':     { title: 'Голы и карточки',           desc: 'Когда в протоколе появятся события.' },
  'match-final':            { title: 'Финальный счёт',            desc: 'Победа / ничья / поражение и итог.' },
  'match-coach-comment':    { title: 'Комментарий тренера',       desc: 'Когда тренер напишет разбор матча.' },
};

export default function PushPreferencesPanel({ onClose, publicMode = false }) {
  const [endpoint, setEndpoint] = useState(null);
  const [kinds, setKinds] = useState([]);
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const fetchFn = publicMode ? fetchPushPreferencesPublic : fetchPushPreferences;
  const saveFn  = publicMode ? setPushPreferencePublic   : setPushPreference;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sub = await checkExistingSubscription();
        if (cancelled) return;
        if (!sub?.endpoint) {
          setErr('Нет активной подписки. Сначала включите уведомления.');
          setLoading(false);
          return;
        }
        setEndpoint(sub.endpoint);
        const data = await fetchFn(sub.endpoint);
        if (cancelled) return;
        setKinds(data.kinds || []);
        setPrefs(data.prefs || {});
      } catch (e) {
        setErr(e.message || 'Не удалось загрузить настройки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc — закрыть.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function toggle(kind) {
    if (!endpoint) return;
    const next = !(prefs[kind] !== false);
    // Optimistic update
    setPrefs((p) => ({ ...p, [kind]: next }));
    try {
      await saveFn(endpoint, kind, next);
    } catch (e) {
      // Откат
      setPrefs((p) => ({ ...p, [kind]: !next }));
      setErr(e.message || 'Ошибка сохранения');
    }
  }

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);
  async function sendTest() {
    if (!endpoint || !publicMode) return;
    setTesting(true);
    setTestMsg(null);
    try {
      await sendTestPushPublic(endpoint);
      setTestMsg('Тест отправлен — должно прийти за пару секунд');
    } catch (e) {
      setTestMsg('Не получилось: ' + (e.message || 'неизвестная ошибка'));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="push-prefs-backdrop" onClick={onClose}>
      <div className="push-prefs-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="push-prefs-close" onClick={onClose} aria-label="Закрыть">✕</button>
        <h3 className="push-prefs-title">Уведомления</h3>
        <p className="push-prefs-hint">Выберите, о чём вы хотите получать уведомления.</p>

        {loading && <div className="push-prefs-status">Загружаю…</div>}
        {err && <div className="push-prefs-err">{err}</div>}

        {!loading && !err && kinds.length === 0 && (
          <div className="push-prefs-status">Нет доступных типов уведомлений.</div>
        )}

        {!loading && !err && publicMode && (
          <div className="push-prefs-test">
            <button
              type="button"
              className="push-prefs-test-btn"
              onClick={sendTest}
              disabled={testing || !endpoint}
            >
              {testing ? 'Отправляю…' : '🔔 Прислать тестовое уведомление'}
            </button>
            {testMsg && <div className="push-prefs-test-msg">{testMsg}</div>}
          </div>
        )}

        {!loading && !err && kinds.length > 0 && (
          <ul className="push-prefs-list">
            {kinds.map((k) => {
              const meta = KIND_LABELS[k] || { title: k, desc: '' };
              const on = prefs[k] !== false;
              return (
                <li key={k} className="push-prefs-row">
                  <div className="push-prefs-row__text">
                    <div className="push-prefs-row__title">{meta.title}</div>
                    {meta.desc && <div className="push-prefs-row__desc">{meta.desc}</div>}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    className={`push-prefs-toggle${on ? ' push-prefs-toggle--on' : ''}`}
                    onClick={() => toggle(k)}
                  >
                    <span className="push-prefs-toggle__knob" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

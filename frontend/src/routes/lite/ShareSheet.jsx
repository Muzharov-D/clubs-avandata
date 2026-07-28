// Настройка «что видит игрок» + выдача входа — отдельным листом поверх экрана.
//
// ПОЧЕМУ ЛИСТОМ. Раньше семь галочек, статус доступа и приглашение висели прямо
// в карточке игрока — тренер открывал разбор и упирался в стену контролов.
// Частый путь (посмотреть игрока и написать ему) должен быть сверху, настройка —
// на уровень глубже. Открывается редко, поэтому и живёт отдельно.
//
// Лист — модальная задача: со скримом, фокус уводим внутрь, Esc закрывает.

import { useEffect, useRef, useState } from 'react';
import { fetchPlayerShare, savePlayerShare, invitePlayer } from '../../services/api';

const ACCESS_TEXT = {
  none: 'Ссылки пока нет — игрок не увидит ни показателей, ни разбора.',
  issued: 'Ссылка выдана, игрок по ней ещё не заходил.',
  active: 'Игрок заходит в свой кабинет по ссылке.',
};

/**
 * Копирование в буфер. НИКОГДА не ждать этот промис в основном потоке действия:
 * в неактивной вкладке Chrome держит `writeText` нерешённым до возврата фокуса —
 * не отклоняет, а висит. Поймано живьём: кнопка навсегда застревала в «Готовим…».
 */
function copy(text) {
  const write = (async () => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  })();
  return Promise.race([write, new Promise((r) => { setTimeout(() => r(false), 1500); })]);
}

export default function ShareSheet({ age, player, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState([]);
  const [overall, setOverall] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchPlayerShare(age, player.id)
      .then((d) => {
        if (!alive) return;
        setData(d); setPicked(d?.metrics ?? []); setOverall(Boolean(d?.showOverall));
      })
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [age, player.id]);

  // Esc закрывает, фокус уводим в лист — иначе табом уходишь в экран под ним.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Сохраняем сразу по клику: отдельная кнопка «Применить» — лишний шаг,
  // а тренер закрывает лист и уходит писать разбор.
  const persist = async (metrics, showOverall) => {
    setSaving(true); setErr('');
    try {
      await savePlayerShare(age, player.id, metrics, showOverall);
      onSaved?.({ metrics, showOverall });
    } catch (e) {
      setErr(`Не сохранилось: ${String(e?.message ?? e)}`);
    } finally { setSaving(false); }
  };

  const toggle = (key) => {
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
    setPicked(next); persist(next, overall);
  };
  const toggleOverall = () => { const n = !overall; setOverall(n); persist(picked, n); };

  const doInvite = async () => {
    setInviting(true); setErr(''); setCopied(false);
    try {
      const r = await invitePlayer(age, player.id);
      setInvite(r);
      fetchPlayerShare(age, player.id)
        .then((d) => setData((p) => ({ ...(p ?? {}), access: d?.access })))
        .catch(() => { /* ссылка уже показана, статус подтянется позже */ });
      copy(r.link).then(setCopied);   // без await: см. copy()
    } catch (e) {
      setErr(`Не удалось выдать доступ: ${String(e?.message ?? e)}`);
    } finally { setInviting(false); }
  };

  const axes = data?.axes ?? [];
  const access = data?.access;

  return (
    <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Что видит ${player.fullName}`}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="sheet__head">
          <div>
            <h2 className="sheet__t">Что видит игрок</h2>
            <p className="sheet__sub">{player.fullName}</p>
          </div>
          <button type="button" className="sheet__x" onClick={onClose} aria-label="Закрыть">✕</button>
        </header>

        <div className="sheet__body">
          {!data && !err && <p className="lite-note">Загружаем…</p>}

          {axes.length > 0 && (
            <>
              <p className="sheet__hint">
                Отмеченное появится в кабинете игрока. Остальное останется только у вас —
                сервер этих чисел ему даже не отдаёт.
              </p>
              <div className="sheet__grid">
                {axes.map((a) => (
                  <label key={a.key} className={`sw${picked.includes(a.key) ? ' sw--on' : ''}`}>
                    <input type="checkbox" checked={picked.includes(a.key)} onChange={() => toggle(a.key)} />
                    <span className="sw__label">{a.label}</span>
                    {a.focus && <span className="sw__tag">главный</span>}
                  </label>
                ))}
              </div>
              <label className={`sw sw--wide${overall ? ' sw--on' : ''}`}>
                <input type="checkbox" checked={overall} onChange={toggleOverall} />
                <span className="sw__label">Общий индекс за сезон</span>
                <span className="sw__note">скрыт по умолчанию</span>
              </label>
              {picked.length === 0 && (
                <p className="lite-note">Не открыто ничего — игрок увидит только ваш разбор.</p>
              )}
            </>
          )}

          {data && axes.length === 0 && (
            <p className="lite-note">
              У игрока не определено амплуа — показывать по позиции нечего. Разбор он всё равно получит.
            </p>
          )}

          <div className="sheet__access">
            <div className="sheet__access-t">Вход в кабинет</div>
            <p className="sheet__access-s">
              {access ? ACCESS_TEXT[access.status] : '—'}
              {' '}Пароля у игрока нет: ссылка и есть ключ.
            </p>
            <button type="button" className="lite-btn lite-btn--ghost" onClick={doInvite} disabled={inviting}>
              {inviting ? 'Готовим…' : access?.status === 'none' ? 'Создать ссылку' : 'Обновить ссылку'}
            </button>

            {invite && (
              <div className="sheet__invite">
                <p className="sheet__invite-t">
                  {copied ? 'Ссылка скопирована — отправьте её игроку.' : 'Скопируйте ссылку и отправьте её игроку.'}
                  {' '}Она постоянная: пусть сохранит и открывает когда захочет.
                </p>
                <input className="sheet__link" readOnly value={invite.link} onFocus={(e) => e.target.select()} />
                <p className="lite-note">
                  Открыл — сразу в своём кабинете, пароль не нужен. Ссылка личная,
                  пересылать её дальше не стоит.
                  {invite.renewed && ' Прежняя ссылка больше не работает.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className="sheet__foot">
          <span className="sheet__state">
            {saving ? 'Сохраняем…' : err ? <span className="lite-fb__err">{err}</span> : 'Изменения сохраняются сразу'}
          </span>
          <button type="button" className="lite-btn" onClick={onClose}>Готово</button>
        </footer>
      </div>
    </div>
  );
}

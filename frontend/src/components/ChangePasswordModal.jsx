// Модалка «Сменить пароль» — открывается из AppHeader.
// POST /api/auth/change-password { currentPassword, newPassword }.

import { useEffect, useState } from 'react';
import { changePassword } from '../services/api';
import './ChangePasswordModal.css';

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (!current || !next) { setErr('Заполните оба пароля'); return; }
    if (next.length < 6) { setErr('Новый пароль минимум 6 символов'); return; }
    if (next !== confirm) { setErr('Пароли не совпадают'); return; }
    if (next === current) { setErr('Новый пароль совпадает с текущим'); return; }
    setBusy(true);
    try {
      await changePassword(current, next);
      setOk(true);
      setTimeout(onClose, 1400);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cpm-backdrop" onClick={onClose}>
      <form className="cpm-sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="cpm-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <h3 className="cpm-title">Сменить пароль</h3>
        <div className="cpm-sub">После смены потребуется ввести новый пароль при следующем входе.</div>

        {ok ? (
          <div className="cpm-success">✓ Пароль обновлён</div>
        ) : (
          <>
            <label className="cpm-field">
              <span>Текущий пароль</span>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </label>
            <label className="cpm-field">
              <span>Новый пароль</span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={6}
              />
            </label>
            <label className="cpm-field">
              <span>Повторите новый</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {err && <div className="cpm-err">{err}</div>}

            <div className="cpm-actions">
              <button type="button" onClick={onClose} disabled={busy}>Отмена</button>
              <button type="submit" className="cpm-primary" disabled={busy}>
                {busy ? 'Сохранение...' : 'Сменить'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

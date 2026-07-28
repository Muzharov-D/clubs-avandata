import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { setPassword } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './Login.css';

export default function SetPassword() {
  useDocumentTitle('Установка пароля');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  // Игрока приглашает тренер ссылкой, без почты — логин он узнаёт только здесь.
  // Поэтому при наличии username не уводим на вход по таймеру: сначала показать.
  const [login, setLogin] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!token) { setError('Ссылка недействительна — нет токена.'); return; }
    if (pwd.length < 8) { setError('Пароль минимум 8 символов.'); return; }
    if (pwd !== pwd2) { setError('Пароли не совпадают.'); return; }
    setBusy(true);
    try {
      const r = await setPassword(token, pwd);
      const name = r?.username || r?.email || null;
      setLogin(name);
      setDone(true);
      if (!r?.username) setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err) {
      setError(err?.message || 'Не удалось установить пароль.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/assets/logos/log-3_white.png" alt="АванDата" />
        </div>
        <h1 className="login-title">Установка пароля</h1>

        {done ? (
          <div role="status" style={{ textAlign: 'center', margin: '16px 0' }}>
            <p style={{ color: 'var(--brand-success, #4ade80)', margin: 0 }}>Пароль установлен.</p>
            {login ? (
              <>
                <p style={{ margin: '12px 0 0', fontSize: 14 }}>
                  Твой логин для входа:{' '}
                  <b style={{ userSelect: 'all' }}>{login}</b>
                </p>
                <p style={{ margin: '6px 0 16px', fontSize: 13, opacity: .75 }}>
                  Запиши его — он понадобится каждый раз вместе с паролем.
                </p>
                <button type="button" onClick={() => navigate('/login', { replace: true })}>
                  Войти
                </button>
              </>
            ) : (
              <p style={{ margin: '8px 0 0' }}>Перенаправляем на вход…</p>
            )}
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            <label>Новый пароль</label>
            <input
              type="password" value={pwd} autoComplete="new-password" autoFocus
              onChange={(e) => setPwd(e.target.value)} disabled={busy || !token} required
            />
            <label>Повторите пароль</label>
            <input
              type="password" value={pwd2} autoComplete="new-password"
              onChange={(e) => setPwd2(e.target.value)} disabled={busy || !token} required
            />
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" disabled={busy || !token}>
              {busy ? 'Сохраняем…' : 'Сохранить пароль'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

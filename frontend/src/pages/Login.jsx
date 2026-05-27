import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Если уже залогинен — перекидываем по роли (без захода в форму).
  if (user) {
    const dest = user.role === 'platform_admin' ? '/admin' : '/club';
    return <Navigate to={dest} replace />;
  }

  async function submit(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      // Email сохраняется case-as-entered (e.g. Muzharov26@gmail.com), а username
      // в Легирусе — lowercase-нормализован. Различаем по наличию '@'.
      const value = u.trim();
      const normalized = value.includes('@') ? value : value.toLowerCase();
      const loggedUser = await login(normalized, p);
      // Куда перенаправить: platform_admin — в админку платформы,
      // остальные — в кабинет клуба (или туда откуда пришли).
      let target;
      if (loggedUser?.role === 'platform_admin') {
        target = '/admin';
      } else {
        target = location.state?.from?.pathname || '/club';
      }
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message || 'Ошибка входа');
    } finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/assets/logos/log-3_white.png" alt="АванDата" />
        </div>
        <h1 className="login-title">Вход в систему</h1>
        <form className="login-form" onSubmit={submit}>
          <label>Логин</label>
          <input
            type="text"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <label>Пароль</label>
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Проверка…' : 'Войти'}
          </button>
        </form>
        <div className="login-help">
          Нет учётной записи? Обратитесь к тренеру.
        </div>
      </div>
    </div>
  );
}

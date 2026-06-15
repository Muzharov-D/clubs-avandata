import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './Login.css';

export default function Login() {
  useDocumentTitle('Вход');
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Если уже залогинен — перекидываем по роли (без захода в форму).
  if (user) {
    const dest =
      user.role === 'platform_admin' ? '/admin'
      : user.role === 'federation_admin' ? '/federation'
      : '/club';
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
      } else if (loggedUser?.role === 'federation_admin') {
        target = '/federation';
      } else if (loggedUser?.role === 'player' && loggedUser?.playerId) {
        target = `/players/${loggedUser.playerId}`;
      } else {
        target = location.state?.from?.pathname || '/club';
      }
      const greeting = loggedUser?.fullName ? `Здравствуй, ${loggedUser.fullName}!` : 'Вход выполнен';
      toast.success(greeting);
      navigate(target, { replace: true });
    } catch (err) {
      const msg = err?.message || 'Ошибка входа';
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/icons/avandata.png" alt="АванDата" />
        </div>
        <h1 className="login-title">Вход в систему</h1>
        <form className={`login-form${busy ? ' login-form--busy' : ''}`} onSubmit={submit} aria-busy={busy}>
          <div className="login-field">
            <label htmlFor="login-username">Логин</label>
            <input
              id="login-username"
              type="text"
              value={u}
              onChange={(e) => setU(e.target.value)}
              autoComplete="username"
              spellCheck={false}
              autoFocus
              required
              disabled={busy}
              data-testid="login-username"
            />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Пароль</label>
            <input
              id="login-password"
              type="password"
              value={p}
              onChange={(e) => setP(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
              data-testid="login-password"
            />
          </div>
          {error && <div className="login-error" role="alert" aria-live="assertive" data-testid="login-error">{error}</div>}
          <button type="submit" className="login-submit" disabled={busy} data-testid="login-submit">
            {busy && <span className="login-spinner" aria-hidden="true" />}
            {busy ? 'Проверка…' : 'Войти'}
          </button>
        </form>
        <div className="login-help">
          Нет доступа? Свяжитесь с администратором клуба или напишите в
          {' '}
          <a className="login-link" href="mailto:support@avandata.ru?subject=Доступ%20к%20кабинету">
            поддержку Avandata
          </a>.
        </div>
        <div className="login-help login-help--secondary">
          <a className="login-link" href="mailto:support@avandata.ru?subject=Восстановление%20пароля">
            Забыли пароль?
          </a>
        </div>
      </div>
    </div>
  );
}

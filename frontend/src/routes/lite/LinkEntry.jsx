// Вход игрока по личной ссылке — `/p/:token`.
//
// Пароля у игрока нет вовсе (решение владельца): ссылка и есть ключ. Открыл —
// оказался в своём кабинете. Ребёнку не нужно ничего придумывать и помнить.
//
// Токен из адреса убираем сразу после входа (`replace`): иначе он остаётся в
// адресной строке и в истории браузера на общем телефоне.

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import '../../pages/Login.css';

export default function LinkEntry() {
  useDocumentTitle('Вход');
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { loginByLink } = useAuth();
  const [err, setErr] = useState('');
  // React 19 в режиме разработки монтирует дважды — вход должен быть один.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) { setErr('Ссылка неполная — попросите тренера прислать её заново.'); return; }
    loginByLink(token)
      .then(() => navigate('/me', { replace: true }))
      .catch((e) => {
        const raw = String(e?.message ?? e);
        setErr(/недействительна|401|unauthorized/i.test(raw)
          ? 'Ссылка больше не работает — попросите у тренера новую.'
          : `Не удалось войти: ${raw}`);
      });
  }, [token, loginByLink, navigate]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/assets/logos/log-3_white.png" alt="АванDата" />
        </div>
        {err ? (
          <>
            <h1 className="login-title">Вход не получился</h1>
            <p className="login-error" role="alert" style={{ textAlign: 'center' }}>{err}</p>
          </>
        ) : (
          <>
            <h1 className="login-title">Заходим…</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Секунду — открываем твой разбор.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

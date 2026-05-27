// Корневая страница на legirus.sportdata.tech (клубный домен) для неавторизованных.
// Три большие кнопки: «Я тренер» / «Я игрок» → /login, «Я родитель» → mobile.*
// Тренер и игрок логинятся одной формой, role различается на бэке (users.role),
// и в Login.jsx после успешного входа делается redirect по роли.
//
// Если пользователь уже залогинен — редирект на /club (управление клубом).
// Маршрутизация происходит в App.jsx через RootRoute → проверяет hostname и user.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './ClubLanding.css';

const PARENTS_URL = 'https://mobile.legirus.sportdata.tech/';

export default function ClubLanding() {
  useEffect(() => {
    const orig = document.title;
    document.title = 'ФК Легирус · Платформа клуба';
    let themeColor = document.querySelector('meta[name="theme-color"]');
    const originalTheme = themeColor?.getAttribute('content') || null;
    if (themeColor) themeColor.setAttribute('content', '#1a0606');
    return () => {
      document.title = orig;
      if (themeColor && originalTheme) themeColor.setAttribute('content', originalTheme);
    };
  }, []);

  return (
    <div className="clublanding">
      <div className="clublanding__container">
        <div className="clublanding__hero">
          <img src="/icons/legirus.png" alt="ФК Легирус" className="clublanding__logo" />
          <div className="clublanding__title">ФК&nbsp;Легирус</div>
          <div className="clublanding__subtitle">Платформа клуба</div>
        </div>

        <div className="clublanding__cards">
          <Link to="/login" className="clublanding__card clublanding__card--coach">
            <div className="clublanding__card-icon" aria-hidden>👤</div>
            <div className="clublanding__card-title">Я тренер</div>
            <div className="clublanding__card-desc">Управление командами,<br />тренировки, вызовы</div>
            <div className="clublanding__card-cta">Войти →</div>
          </Link>

          <Link to="/login" className="clublanding__card clublanding__card--player">
            <div className="clublanding__card-icon" aria-hidden>⚽</div>
            <div className="clublanding__card-title">Я игрок</div>
            <div className="clublanding__card-desc">Личная статистика,<br />свои матчи и тренировки</div>
            <div className="clublanding__card-cta">Войти →</div>
          </Link>

          <a href={PARENTS_URL} className="clublanding__card clublanding__card--parent">
            <div className="clublanding__card-icon" aria-hidden>👨‍👩‍👧</div>
            <div className="clublanding__card-title">Я родитель</div>
            <div className="clublanding__card-desc">Расписание матчей<br />и тренировок ребёнка</div>
            <div className="clublanding__card-cta">Перейти →</div>
          </a>
        </div>

        <div className="clublanding__hint">
          АванDата · аналитическая платформа для футбольных школ
        </div>
      </div>
    </div>
  );
}

// Корневая landing-страница для родителей: рассылка short-link → выбор команды.
// Если в localStorage есть activeTeam (или myTeams[]) → автоматический редирект.
// Иначе — две секции карточек: «Младшие» (3 шт) и «Старшие» (5 шт).

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AGE_GROUPS,
  AGE_GROUPS_YOUNGER,
  AGE_GROUPS_OLDER,
  tierForAge,
  displayAge,
} from '../utils/ageRating';
import { readActiveTeam, addAndActivate } from '../utils/myTeams';
import OfflineBanner from '../components/OfflineBanner';
import './PublicLanding.css';

export default function PublicLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    // Если родитель уже выбирал команду — редирект на активную (с миграцией с lastAge внутри readActiveTeam).
    const active = readActiveTeam();
    if (active) {
      navigate(`/public/team/${active}`, { replace: true });
      return; // редирект — prefetch не нужен
    }

    // Подменяем title и theme-color на public-вариант
    const orig = document.title;
    document.title = 'ФК Легирус · Расписание';
    let themeColor = document.querySelector('meta[name="theme-color"]');
    const originalTheme = themeColor?.getAttribute('content') || null;
    if (themeColor) themeColor.setAttribute('content', '#1a0606');

    // Prefetch публичных эндпойнтов всех 8 команд в фоне.
    // Brotli-сжатые ответы по 11-15 КБ суммарно ~100 КБ — терпимо даже на 4G.
    // К моменту тапа на карточку всё в HTTP-cache → мгновенный рендер.
    const ac = new AbortController();
    const prefetch = () => {
      AGE_GROUPS.forEach((a) => {
        ['calendar', 'standings', 'trainings'].forEach((kind) => {
          fetch(`/api/public/${kind}/${a}`, {
            signal: ac.signal,
            priority: 'low',
            credentials: 'omit',
          }).catch(() => {});
        });
      });
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(prefetch, { timeout: 1500 });
    } else {
      setTimeout(prefetch, 300);
    }

    return () => {
      ac.abort();
      document.title = orig;
      if (themeColor && originalTheme) themeColor.setAttribute('content', originalTheme);
    };
  }, [navigate]);

  function pick(age) {
    addAndActivate(age);
    navigate(`/public/team/${age}`);
  }

  return (
    <div className="landing">
      <OfflineBanner />
      <div className="landing__container">
        <div className="landing__hero">
          <img src="/icons/legirus.png" alt="ФК Легирус" className="landing__logo" />
          <div className="landing__title">ФК&nbsp;Легирус</div>
          <div className="landing__subtitle">Выберите год рождения ребёнка</div>
        </div>

        <div className="landing__section">
          <div className="landing__section-title">Младшие</div>
          <div className="landing__grid landing__grid--younger">
            {AGE_GROUPS_YOUNGER.map((a) => (
              <button
                key={a}
                type="button"
                className="landing__card"
                onClick={() => pick(a)}
              >
                <div className="landing__card-year">{displayAge(a)}</div>
                <div className="landing__card-tier">{tierForAge(a)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="landing__section">
          <div className="landing__section-title">Старшие</div>
          <div className="landing__grid landing__grid--older">
            {AGE_GROUPS_OLDER.map((a) => (
              <button
                key={a}
                type="button"
                className="landing__card"
                onClick={() => pick(a)}
              >
                <div className="landing__card-year">{displayAge(a)}</div>
                <div className="landing__card-tier">{tierForAge(a)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="landing__hint">Расписание матчей и тренировок в одном месте</div>
      </div>
    </div>
  );
}

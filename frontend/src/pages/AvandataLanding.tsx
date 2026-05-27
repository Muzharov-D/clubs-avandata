import { Link } from 'react-router-dom';
import './AvandataLanding.css';

export function AvandataLanding() {
  return (
    <div className="av-landing">
      <header className="av-landing__nav">
        <div className="av-landing__brand">
          <img src="/icons/avandata.png" alt="Avandata" className="av-landing__logo" />
          <div>
            <div className="av-landing__name">Avandata</div>
            <div className="av-landing__tagline">Clubs Platform</div>
          </div>
        </div>
        <Link to="/login" className="av-landing__login-btn">Войти</Link>
      </header>

      <main className="av-landing__hero">
        <h1 className="av-landing__title">
          SaaS-платформа для футбольных клубов
        </h1>
        <p className="av-landing__lead">
          Расписание, статистика, состав, тренировки, push родителям —
          всё в одном кабинете. Один кодbase, любое количество клубов.
        </p>

        <div className="av-landing__features">
          <Feature
            icon="📊"
            title="Аналитика матчей"
            text="SportVisor-разборы, рейтинги игроков, формации, тепловые карты"
          />
          <Feature
            icon="📅"
            title="Календарь и тренировки"
            text="Расписание, отметка явки, RSVP игроком, ICS-подписка"
          />
          <Feature
            icon="🔔"
            title="Push-уведомления"
            text="За 24ч до матча, при публикации состава, после финального свистка"
          />
          <Feature
            icon="👨‍👩‍👧"
            title="Экран родителя"
            text="Без логина — открой по ссылке и подпишись на команду ребёнка"
          />
        </div>

        <div className="av-landing__cta">
          <Link to="/login" className="av-landing__cta-btn">Войти в кабинет клуба →</Link>
        </div>
      </main>

      <footer className="av-landing__footer">
        <div>clubs.avandata.ru · multi-tenant sports platform</div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="av-feature">
      <div className="av-feature__icon">{icon}</div>
      <div className="av-feature__title">{title}</div>
      <div className="av-feature__text">{text}</div>
    </div>
  );
}

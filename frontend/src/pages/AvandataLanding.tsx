import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './AvandataLanding.css';

export function AvandataLanding() {
  useDocumentTitle('Clubs Avandata — платформа для футбольных клубов');
  return (
    <div className="av-landing">
      {/* Animated background gradients */}
      <div className="av-landing__gradient" aria-hidden>
        <div className="av-landing__gradient-bar" />
        <div className="av-landing__gradient-bar" />
        <div className="av-landing__gradient-bar" />
      </div>
      <div className="av-landing__gradient av-landing__gradient--two" aria-hidden>
        <div className="av-landing__gradient-bar" />
        <div className="av-landing__gradient-bar" />
        <div className="av-landing__gradient-bar" />
      </div>
      <div className="av-landing__gradient av-landing__gradient--three" aria-hidden>
        <div className="av-landing__gradient-bar" />
        <div className="av-landing__gradient-bar" />
        <div className="av-landing__gradient-bar" />
      </div>
      <div className="av-landing__glow-bottom" aria-hidden />

      {/* Navigation */}
      <header className="av-nav">
        <div className="av-nav__brand">
          <img src="/icons/avandata.png" alt="Avandata" className="av-nav__logo" />
          <div>
            <div className="av-nav__name">Avandata</div>
            <div className="av-nav__tagline">Clubs Platform</div>
          </div>
        </div>
        <Link to="/login" className="av-nav__login">Войти</Link>
      </header>

      {/* Hero */}
      <main className="av-hero">
        <div className="av-hero__badge">
          <span className="av-hero__badge-dot" />
          <span>Платформа в продакшене · обновлено сегодня</span>
        </div>

        <h1 className="av-hero__title">
          Цифровой кабинет<br />
          для <span className="av-hero__title-accent">футбольного клуба</span>
        </h1>

        <p className="av-hero__lead">
          Расписание, статистика матчей, аналитика SportVisor, тренировки, push-уведомления родителям —
          всё в одном кабинете. Одна кодовая база, любое количество клубов.
        </p>

        <div className="av-hero__cta-row">
          <Link to="/login" className="av-hero__cta">
            Войти в кабинет
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <a href="#features" className="av-hero__cta-secondary">Узнать больше</a>
        </div>

        <div className="av-stats">
          <div className="av-stat">
            <div className="av-stat__num">2</div>
            <div className="av-stat__label">Клуба</div>
          </div>
          <div className="av-stat">
            <div className="av-stat__num">32+</div>
            <div className="av-stat__label">Игрока</div>
          </div>
          <div className="av-stat">
            <div className="av-stat__num">22+</div>
            <div className="av-stat__label">Матча</div>
          </div>
          <div className="av-stat">
            <div className="av-stat__num">99.9%</div>
            <div className="av-stat__label">Аптайм</div>
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="av-features" id="features">
        <h2 className="av-features__title">Всё что нужно футбольному клубу</h2>
        <p className="av-features__sub">
          От синхронизации календаря с регламентом турнира до публичного экрана для родителей —
          платформа покрывает каждый сценарий.
        </p>

        <div className="av-features__grid">
          <Feature
            icon="analytics"
            title="Аналитика матчей"
            text="SportVisor-разборы, рейтинги игроков по 15 метрикам, формации, тепловые карты"
          />
          <Feature
            icon="calendar"
            title="Календарь и тренировки"
            text="Расписание лиги, отметка явки, RSVP игроком, ICS-подписка в Apple/Google Calendar"
          />
          <Feature
            icon="push"
            title="Push родителям"
            text="За 24 часа до матча, при публикации состава, после финального свистка"
          />
          <Feature
            icon="parent"
            title="Экран родителя"
            text="Без логина — открой ссылку и подпишись на команду ребёнка. PWA + offline"
          />
          <Feature
            icon="trophy"
            title="Турнирная таблица"
            text="Авто-синк FFSPB/ЮФЛ + история таблиц по дням, дельта позиции команды"
          />
          <Feature
            icon="multiclub"
            title="Мульти-клуб"
            text="Один кодбейс, любое количество клубов — каждый со своим брендом, ролями, данными"
          />
        </div>
      </section>

      {/* Tenants showcase */}
      <section className="av-tenants">
        <div className="av-tenants__title">Сейчас в продакшене</div>
        <div className="av-tenants__row">
          <div className="av-tenant-badge">
            <div className="av-tenant-badge__color" style={{ background: '#001489' }} />
            <span className="av-tenant-badge__name">ФК Зенит</span>
          </div>
          <div className="av-tenant-badge">
            <div className="av-tenant-badge__color" style={{ background: '#87CEEB' }} />
            <span className="av-tenant-badge__name">СШОР Зенит</span>
          </div>
        </div>
      </section>

      <footer className="av-footer">
        clubs.avandata.ru · Multi-tenant sports platform · {new Date().getFullYear()}
        {' · '}
        <a href="mailto:hello@avandata.ru?subject=Хочу%20подключить%20клуб" style={{ color: '#22d3ee' }}>
          подключить клуб
        </a>
      </footer>
    </div>
  );
}

/* Брендированные тонкие SVG-иконки фич (вместо эмодзи) — единый stroke-стиль,
   наследуют цвет от .av-feature__icon-wrap (фирменный cyan). Правка #4. */
const FEATURE_ICONS: Record<string, ReactNode> = {
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4M8 13h2M14 13h2M8 17h2M14 17h2" />
    </svg>
  ),
  push: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  parent: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.2" /><path d="M16 20a4.5 4.5 0 0 1 5-4.2" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  ),
  multiclub: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
};

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="av-feature">
      <div className="av-feature__icon-wrap" aria-hidden>{FEATURE_ICONS[icon] ?? null}</div>
      <div className="av-feature__title">{title}</div>
      <div className="av-feature__text">{text}</div>
    </div>
  );
}

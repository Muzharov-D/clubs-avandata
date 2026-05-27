// Hero-блок «Ближайший матч» — самое первое что видит родитель на главной.
// Показывает: тур / соперник / дата человеко-понятно / тикающий countdown /
// CTA «Маршрут» (открывает Я.Карты на venue).
//
// Если ближайшего матча нет (или все прошедшие) — компонент не рендерится.

import { useEffect, useMemo, useState } from 'react';
import { fmtRelative, fmtCountdown } from '../utils/dates';
import { shieldFor, isLegirus } from '../utils/legirus';
import { hasCoords, openYandexRoute } from '../utils/map';
import UiIcon from './UiIcon';
import './HeroNextMatch.css';

function shortTeamName(name) {
  if (!name) return '—';
  return String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').slice(0, 3).join(' ');
}

export default function HeroNextMatch({ match, venue, onOpen }) {
  // Live countdown — обновляется раз в минуту (без секунд).
  // Раньше тикал каждую секунду в окне 24ч, но мобильный браузер throttle'ит
  // setInterval(1s) когда вкладка в фоне или экран приглушён → секунды
  // «прыгали» хаотично, а не убывали ровно. Минутный интервал стабилен,
  // батарею не сажает, для родителя «3 ч 14 мин» вместо «3:14:22»
  // совершенно достаточно.
  const [now, setNow] = useState(() => new Date());
  const matchDate = useMemo(() => (match?.date ? new Date(match.date) : null), [match?.date]);

  useEffect(() => {
    if (!match) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [match]);

  if (!match || !matchDate) return null;

  const homeIsUs = isLegirus(match.home);
  const opp = homeIsUs ? match.away : match.home;
  const oppShield = homeIsUs ? match.awayShield : match.homeShield;
  const placeLabel = homeIsUs ? 'Дома' : 'В гостях';

  const countdownStr = fmtCountdown(matchDate, now);
  // Маршрут — ТОЛЬКО при наличии координат. Без text-fallback, иначе уедет
  // не к тому стадиону (одних «Локомотивов» в России 7+).
  const canRoute = hasCoords(venue);

  return (
    <div
      className="hero-next"
      onClick={() => onOpen && onOpen(match)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onOpen && onOpen(match); } }}
    >
      <div className="hero-next__topline">
        <span className="hero-next__chip">
          <UiIcon name={match.tournament === 'cup' ? 'trophy' : 'ball'} size={11} />
          {match.tournament === 'cup' ? 'Кубок' : 'Лига'}
          {match.round ? ` · ${match.round}` : ''}
        </span>
        <span className="hero-next__when">{fmtRelative(matchDate, now)}</span>
      </div>

      <div className="hero-next__matchup">
        <div className="hero-next__us">
          <img
            src="/icons/legirus.png"
            alt="ФК Легирус"
            className="hero-next__shield"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
          <span className="hero-next__us-name">Легирус</span>
        </div>
        <div className="hero-next__vs">vs</div>
        <div className="hero-next__opp">
          <span className="hero-next__opp-name">{shortTeamName(opp)}</span>
          <img
            src={shieldFor(opp, oppShield)}
            alt=""
            className="hero-next__shield"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        </div>
      </div>

      {countdownStr && (
        <div className="hero-next__countdown" aria-label="До начала матча">
          <span className="hero-next__countdown-label">До начала</span>
          <span className="hero-next__countdown-time">{countdownStr}</span>
        </div>
      )}

      <span className="hero-next__where">
        <UiIcon name="pin" size={12} />
        <span className="hero-next__where-text">{match.venue || 'Стадион уточняется'} · {placeLabel}</span>
      </span>
      {canRoute && (
        <button
          type="button"
          className="hero-next__route"
          onClick={(e) => { e.stopPropagation(); openYandexRoute(venue); }}
        >
          <UiIcon name="map" size={16} /> Маршрут в Я.Картах
        </button>
      )}
    </div>
  );
}

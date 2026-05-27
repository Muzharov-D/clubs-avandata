// Bottom-sheet с деталями матча для родителя.
// Открывается по клику на карточку матча. Главная фича — кнопка маршрута в Я.Картах.

import { useEffect, useState } from 'react';
import useModalBack from '../utils/useModalBack';
import { shieldFor, isLegirus } from '../utils/legirus';
import UiIcon from './UiIcon';
import MatchStatsBlock from './MatchStatsBlock';
import MatchLineupsBlock from './MatchLineupsBlock';
import MatchWeather from './MatchWeather';
import { buildMapViewUrl, buildStaticMapUrl, hasCoords, openYandexRoute } from '../utils/map';
import './MatchDetailSheet.css';

function shortName(name) {
  if (!name) return '—';
  const cleaned = String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .replace(/\bрайон\b/gi, 'р-н')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').slice(0, 3).join(' ');
}

// shieldFor() и isLegirus() — из utils/legirus (single source of truth)

// Центр СПб — используем для прогноза погоды всех матчей. Все наши площадки
// в пределах города (~15 км радиус), разница в погоде минимальна.
const SPB_CENTER = { lat: 59.9343, lng: 30.3351 };

// Маппинг типа события матча → имя UI-иконки в /icons/ui/
const EVENT_KIND_TO_ICON = {
  goal: 'ball',
  goal_special: 'ball',
  penalty: 'ball',
  penalty_missed: 'ball', // мяч + CSS-перечёркивание поверх (см. .mds-tl-icon-wrap--strike)
  own_goal: 'ball',
  yellow_card: 'yellow-card',
  yellow: 'yellow-card',
  red_card: 'red-card',
  red: 'red-card',
  substitution: 'substitution',
  substitution_in: 'substitution',
  substitution_out: 'substitution',
  sub: 'substitution',
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

// Маршрут только когда есть координаты — text-search возвращает не тот
// стадион (одних «Локомотивов» по России 7+). См. utils/map.js

export default function MatchDetailSheet({ match, venue, age, onClose, theme = 'default', extra = null }) {
  // Esc для закрытия
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  // Android back / swipe-back — закрывает модалку
  useModalBack(onClose, !!match);

  // SportVisor-разбор, lineups и коммент тренера — ТОЛЬКО для наших матчей.
  // У чужих матчей в приложении эти данные не появляются никогда: stats не
  // парсятся, lineups хоть и синкаются FFSPB-кроном для leaderboard'а, но
  // показывать их родителю чужого матча смысла нет, а коммент пишет только
  // наш тренер. Двойная защита: даже если backend по ошибке вернёт чужие
  // данные (как было с teamSummaryStats до фикса LEFT JOIN в dataRepo.js) —
  // фронт их не отобразит. Для чужих остаётся одна вкладка «Обзор» с
  // LeagueMatchPreview (формы команд, позиции, h2h).
  const isOurs = !!match?.isOurMatch;
  const statsHome = isOurs ? match?.teamSummaryStats?.home : null;
  const hasStats = !!(statsHome && typeof statsHome === 'object' && Object.keys(statsHome).length > 0);

  const lineupsData = isOurs ? match?.lineups : null;
  const hasLineups = !!(lineupsData && ((lineupsData.home || []).length > 0 || (lineupsData.away || []).length > 0));

  const coachComment = isOurs && typeof match?.coachComment === 'string' ? match.coachComment.trim() : '';
  const hasCoachComment = coachComment.length > 0;

  // События матча (ход игры) — наоборот, показываем для всех матчей: и для
  // нашего, и для чужого (events_data синкается FFSPB-кроном для всех past
  // league-матчей подгруппы, для лидерборда).

  const [tab, setTab] = useState('overview');
  // Если активный таб стал недоступен — переключаем на 'overview'.
  useEffect(() => {
    if (tab === 'stats' && !hasStats) setTab('overview');
    if (tab === 'lineups' && !hasLineups) setTab('overview');
    if (tab === 'comment' && !hasCoachComment) setTab('overview');
  }, [hasStats, hasLineups, hasCoachComment, tab]);

  if (!match) return null;

  const past = match.isPast;
  const tournamentLabel = match.tournament === 'cup' ? 'Кубок' : 'Лига';
  const canRoute = hasCoords(venue);

  // Single-event ICS для скачивания (только если есть matchId и age)
  const apiBase = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const icsUrl = (match.matchId && age)
    ? apiBase.replace(/\/+$/, '') + '/api/public/match/' + age + '/' + match.matchId + '.ics'
    : null;

  return (
    <div className={`mds-backdrop mds-theme--${theme}`} onClick={onClose}>
      <div className="mds-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="mds-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="mds-header">
          <div className="mds-header-left">
            <span className={`mds-badge mds-badge--${match.tournament || 'league'}`}>
              <UiIcon name={match.tournament === 'cup' ? 'trophy' : 'ball'} size={12} /> {tournamentLabel}
            </span>
            {match.round && (
              <span className="mds-round">{match.round}</span>
            )}
          </div>
          <div className="mds-date">
            {match.date ? fmtDate(match.date) : <span className="mds-no-date">Дата уточняется</span>}
          </div>
        </div>

        <div className="mds-teams">
          <div className="mds-team mds-team--home">
            <img
              src={shieldFor(match.home, match.homeShield)}
              alt=""
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            />
            <span>{shortName(match.home)}</span>
          </div>
          <div className="mds-vs">
            {past && match.score
              ? <span><b>{match.score.home}</b> : <b>{match.score.away}</b></span>
              : <span className="mds-vs-text">vs</span>}
          </div>
          <div className="mds-team mds-team--away">
            <img
              src={shieldFor(match.away, match.awayShield)}
              alt=""
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            />
            <span>{shortName(match.away)}</span>
          </div>
        </div>

        {/* Табы: Обзор / Статистика / Состав / Комментарий. Показываем если есть хотя бы один из «доп» табов. */}
        {(hasStats || hasLineups || hasCoachComment) && (
          <div className="mds-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'overview'}
              className={`mds-tab${tab === 'overview' ? ' mds-tab--active' : ''}`}
              onClick={() => setTab('overview')}
            >Обзор</button>
            {hasStats && (
              <button
                role="tab"
                aria-selected={tab === 'stats'}
                className={`mds-tab${tab === 'stats' ? ' mds-tab--active' : ''}`}
                onClick={() => setTab('stats')}
              >Статистика</button>
            )}
            {hasLineups && (
              <button
                role="tab"
                aria-selected={tab === 'lineups'}
                className={`mds-tab${tab === 'lineups' ? ' mds-tab--active' : ''}`}
                onClick={() => setTab('lineups')}
              >Состав</button>
            )}
            {hasCoachComment && (
              <button
                role="tab"
                aria-selected={tab === 'comment'}
                className={`mds-tab${tab === 'comment' ? ' mds-tab--active' : ''}`}
                onClick={() => setTab('comment')}
              >Комментарий</button>
            )}
          </div>
        )}

        {/* Комментарий тренера — публичный текст для родителей */}
        {hasCoachComment && tab === 'comment' && (
          <div className="mds-comment">
            <div className="mds-comment__caption">От тренера ФК Легирус</div>
            <div className="mds-comment__body">{coachComment}</div>
          </div>
        )}

        {/* Стат-блок (SportVisor): командная стата host vs guest.
            Цветовая логика: Легирус всегда красный, соперник всегда белый. */}
        {past && hasStats && tab === 'stats' && (
          <MatchStatsBlock
            home={match.teamSummaryStats.home}
            away={match.teamSummaryStats.away}
            hostName={shortName(match.home)}
            guestName={shortName(match.away)}
            homeIsUs={isLegirus(match.home)}
          />
        )}

        {/* Составы (FFSPB lineups): pre-match за 6ч и итоговый после игры */}
        {hasLineups && tab === 'lineups' && (
          <MatchLineupsBlock
            lineups={lineupsData}
            hostName={shortName(match.home)}
            guestName={shortName(match.away)}
            homeIsUs={isLegirus(match.home)}
          />
        )}

        {/* События матча в виде 2 колонок: home слева, away справа, минута по центру */}
        {past && tab === 'overview' && Array.isArray(match.events) && match.events.length > 0 && (
          <div className="mds-events">
            <div className="mds-events__title"><UiIcon name="ball" size={12} /> Ход матча</div>
            <div className="mds-tl-list">
              {[...match.events]
                .sort((a, b) => (a.minute || 0) - (b.minute || 0))
                .map((e, i) => {
                  const side = (e.team === 'away' || e.team === 'guest') ? 'away' : 'home';
                  return (
                    <div key={i} className={`mds-tl-row mds-tl-row--${e.kind} mds-tl-row--${side}`}>
                      <div className="mds-tl-side mds-tl-side--home">
                        {side === 'home' && (
                          <span className="mds-tl-event">
                            <span className="mds-tl-text">
                              {e.kind === 'sub' && e.in?.name && e.out?.name ? (
                                <b className="mds-tl-sub-pair">
                                  <span className="mds-tl-sub-in">↑ {e.in.name}</span>
                                  <span className="mds-tl-sub-out">↓ {e.out.name}</span>
                                </b>
                              ) : (
                                <>
                                  <b>{e.playerName || ''}</b>
                                  {e.kind === 'penalty_missed' && <small className="mds-tl-label-missed"> — Незабитый пенальти</small>}
                                  {e.assistName && <small> · ассист: {e.assistName}</small>}
                                  {e.comment && <small> — {e.comment}</small>}
                                </>
                              )}
                            </span>
                            {EVENT_KIND_TO_ICON[e.kind] ? (
                              <span className={`mds-tl-icon-wrap${e.kind === 'penalty_missed' ? ' mds-tl-icon-wrap--strike' : ''}`}>
                                <UiIcon name={EVENT_KIND_TO_ICON[e.kind]} size={16} className="mds-tl-icon" />
                              </span>
                            ) : (
                              <span className="mds-tl-icon mds-tl-icon--emoji" aria-hidden>{e.icon || '·'}</span>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="mds-tl-minute">{e.minute ? e.minute + "'" : '—'}</div>
                      <div className="mds-tl-side mds-tl-side--away">
                        {side === 'away' && (
                          <span className="mds-tl-event">
                            {EVENT_KIND_TO_ICON[e.kind] ? (
                              <span className={`mds-tl-icon-wrap${e.kind === 'penalty_missed' ? ' mds-tl-icon-wrap--strike' : ''}`}>
                                <UiIcon name={EVENT_KIND_TO_ICON[e.kind]} size={16} className="mds-tl-icon" />
                              </span>
                            ) : (
                              <span className="mds-tl-icon mds-tl-icon--emoji" aria-hidden>{e.icon || '·'}</span>
                            )}
                            <span className="mds-tl-text">
                              {e.kind === 'sub' && e.in?.name && e.out?.name ? (
                                <b className="mds-tl-sub-pair">
                                  <span className="mds-tl-sub-in">↑ {e.in.name}</span>
                                  <span className="mds-tl-sub-out">↓ {e.out.name}</span>
                                </b>
                              ) : (
                                <>
                                  <b>{e.playerName || ''}</b>
                                  {e.kind === 'penalty_missed' && <small className="mds-tl-label-missed"> — Незабитый пенальти</small>}
                                  {e.assistName && <small> · ассист: {e.assistName}</small>}
                                  {e.comment && <small> — {e.comment}</small>}
                                </>
                              )}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Погода на момент матча — всегда по центру СПб, без привязки к venue.
            Раньше использовали coords стадиона, но это требовало успешного venue
            lookup, и для матчей с неизвестной площадкой погода не показывалась.
            Микро-точность (±2-3 км по городу) для прогноза не важна — разница
            температур между Купчино и Васильевским ≈ 1°. */}
        {tab === 'overview' && !past && (
          <MatchWeather
            lat={SPB_CENTER.lat}
            lng={SPB_CENTER.lng}
            atIso={match.date}
          />
        )}

        {/* Стадион, маршрут в карты и .ics — показываем только на табе «Обзор»,
            чтобы не мозолили глаза на Статистике / Составе / Комментарии. */}
        {tab === 'overview' && match.venue && (
          <div className="mds-venue">
            <div className="mds-venue-icon">📍</div>
            <div className="mds-venue-text">
              <div className="mds-venue-name">{match.venue}</div>
              {venue && venue.fullName && venue.fullName !== match.venue && (
                <div className="mds-venue-sub">{venue.fullName}</div>
              )}
            </div>
          </div>
        )}

        {/* Mini-map стадиона — Я.Карты static-snapshot, только при наличии координат */}
        {tab === 'overview' && hasCoords(venue) && (
          <a
            className="mds-map"
            href={buildMapViewUrl(venue)}
            target="_blank"
            rel="noopener noreferrer"
            title="Открыть в Я.Картах"
          >
            <img
              alt={`Карта · ${match.venue}`}
              loading="lazy"
              src={buildStaticMapUrl(venue)}
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
            />
          </a>
        )}

        {tab === 'overview' && canRoute && !past && (
          <button
            type="button"
            className="mds-cta"
            onClick={() => openYandexRoute(venue)}
          >
            <UiIcon name="map" size={20} className="mds-cta-icon" />
            <span>Маршрут в Яндекс.Картах</span>
          </button>
        )}

        {tab === 'overview' && icsUrl && !past && (
          <a className="mds-cta-secondary" href={icsUrl}>
            <UiIcon name="calendar" size={18} />
            <span>В мой календарь</span>
          </a>
        )}

        {tab === 'overview' && !match.venue && (
          <div className="mds-no-venue">
            Адрес стадиона пока не указан. Уточните у тренера в чате команды.
          </div>
        )}

        {extra}

        <div className="mds-footer">
          {past
            ? 'Матч уже сыгран. Тренер выложит разбор после анализа.'
            : 'Сбор обычно за 30 минут до начала. Уточните точное время у тренера.'}
        </div>
      </div>
    </div>
  );
}

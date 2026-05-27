// Полный календарь лиги — все матчи возраста, не только Легируса.
// URL: /public/team/:age/league
//
// Источник: тот же /api/public/calendar/:age — там УЖЕ лежат все матчи
// турнира (фронт PublicTeamSchedule просто фильтровал по isOurMatch).
// Здесь — наоборот, показываем всё, наш матч просто подсвечен.
//
// Группировка по турам (round). Без раунда — отдельная секция «Без тура».
// Клик на матч → MatchDetailSheet (он умеет показывать любой матч,
// для не-нашего покажет минимум: счёт, дата, стадион).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAutoRefresh, bustCache } from '../hooks/useAutoRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import MatchDetailSheet from '../components/MatchDetailSheet';
import LeagueMatchPreview from '../components/LeagueMatchPreview';
import OfflineBanner from '../components/OfflineBanner';
import UiIcon from '../components/UiIcon';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { shieldFor, isLegirus, normalizeTeamName } from '../utils/legirus';
import { fmtRelative } from '../utils/dates';
import './LeagueFixture.css';
import './PublicTeamSchedule.css';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
const PREFIX = `${API_BASE}/api/public`;

function shortName(name) {
  if (!name) return '—';
  return String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .trim()
    .split(' ').slice(0, 3).join(' ');
}

// Парсим номер тура из строки «Тур 10» / «10 тур» / «10» → 10. Используется
// для сортировки секций.
function roundNum(round) {
  if (!round) return Infinity;
  const m = String(round).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

export default function LeagueFixture() {
  const { age } = useParams();
  const navigate = useNavigate();
  const [cal, setCal] = useState(null);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openMatch, setOpenMatch] = useState(null);
  const [view, setView] = useState('league'); // league | cup | scorers
  const [filter, setFilter] = useState('all'); // all | past | upcoming

  const [standings, setStandings] = useState(null);
  const [leaders, setLeaders] = useState(null);
  const [leadersLoading, setLeadersLoading] = useState(false);
  const tournament = view === 'cup' ? 'cup' : 'league'; // backward-compat для grouped

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(bustCache(`${PREFIX}/calendar/${age}`)).then((r) => r.ok ? r.json() : null),
      fetch(bustCache(`${PREFIX}/venues`)).then((r) => r.ok ? r.json() : { venues: [] }),
      fetch(bustCache(`${PREFIX}/standings/${age}`)).then((r) => r.ok ? r.json() : null),
    ])
      .then(([cd, vd, sd]) => {
        if (!cd) { setError('Календарь недоступен'); setLoading(false); return; }
        setCal(cd);
        setVenues(vd?.venues || []);
        setStandings(sd);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, [age]);
  useAutoRefresh(load, 30 * 60 * 1000); // 30 мин

  // Лидеры лиги (бомбардиры) — отдельный fetch, только когда юзер открыл вкладку.
  // На бэке агрегация делается из events_data всех past-матчей подгруппы (см.
  // backend/services/leagueLeadersService.js). CDN-кеш 5 мин, нагрузки нет.
  useEffect(() => {
    if (view !== 'scorers') return;
    if (leaders !== null) return; // уже загружали
    setLeadersLoading(true);
    fetch(bustCache(`${PREFIX}/league-leaders/${age}?metric=goals&limit=30`))
      .then((r) => r.ok ? r.json() : { leaders: [] })
      .then((data) => { setLeaders(data.leaders || []); setLeadersLoading(false); })
      .catch(() => { setLeaders([]); setLeadersLoading(false); });
  }, [view, age, leaders]);

  // Сбрасываем кеш лидеров при смене возраста (other team)
  useEffect(() => { setLeaders(null); }, [age]);

  function findVenue(matchVenue) {
    if (!matchVenue) return null;
    const key = String(matchVenue).toLowerCase().trim();
    for (const v of venues) {
      const vname = String(v.name || '').toLowerCase().trim();
      if (key === vname || key.startsWith(vname) || key.includes(vname)) return v;
    }
    return null;
  }

  // Список команд нашей подгруппы — из standings (бэк уже отдаёт только нашу
  // подгруппу 10 команд, отфильтрованную по конфигу ourClubMatcher). Это
  // НАДЁЖНЕЕ чем фильтр по m.group, потому что 2-я лига часто разбита на
  // подгруппы 2010 А/Б с одинаковым именем «Вторая лига» — по тексту
  // group их не различить, по списку команд — да.
  const leagueTeamNames = useMemo(() => {
    const list = standings?.table || [];
    return new Set(list.map((r) => normalizeTeamName(r.team)).filter(Boolean));
  }, [standings]);

  // Фильтруем по турниру + статусу + нашей подгруппе, группируем по round
  const grouped = useMemo(() => {
    const matches = (cal?.matches || []).filter((m) => {
      if (m.tournament && m.tournament !== tournament) return false;
      if (filter === 'past' && !m.isPast) return false;
      if (filter === 'upcoming' && m.isPast) return false;
      // Для лиги — обе команды должны быть в standings.table (наша подгруппа).
      // Имена нормализуем — FFSPB пишет «ФК Легирус» / «Легирус» вразнобой,
      // standings без префикса. Наш матч (isOurMatch) пропускаем всегда —
      // соперник там точно из нашей подгруппы.
      // Для кубка — без ограничения (одна сетка всех команд).
      if (tournament === 'league' && leagueTeamNames.size > 0 && !m.isOurMatch) {
        const h = normalizeTeamName(m.home);
        const a = normalizeTeamName(m.away);
        if (!leagueTeamNames.has(h) || !leagueTeamNames.has(a)) return false;
      }
      return true;
    });
    const byRound = new Map();
    for (const m of matches) {
      const key = m.round || 'Без тура';
      if (!byRound.has(key)) byRound.set(key, []);
      byRound.get(key).push(m);
    }
    // Сортируем туры — по номеру (Тур 1, Тур 2…), потом «Без тура» в конец
    const sorted = [...byRound.entries()].sort(([a], [b]) => {
      const na = roundNum(a), nb = roundNum(b);
      return na - nb;
    });
    // Внутри тура сортируем по дате
    for (const [, list] of sorted) {
      list.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : Infinity;
        const db = b.date ? new Date(b.date).getTime() : Infinity;
        return da - db;
      });
    }
    return sorted;
  }, [cal, tournament, filter]);

  const totalMatches = useMemo(
    () => grouped.reduce((sum, [, list]) => sum + list.length, 0),
    [grouped],
  );

  // Актуальный тур: первый по порядку у которого есть хоть один НЕ сыгранный
  // матч. Если все сыграны (сезон закончен) — последний тур. Используется
  // для авто-скролла при первой загрузке и для кнопки «К текущему туру».
  const currentRoundKey = useMemo(() => {
    if (grouped.length === 0) return null;
    const withFuture = grouped.find(([, list]) => list.some((m) => !m.isPast));
    if (withFuture) return withFuture[0];
    // Все туры прошли — берём последний
    return grouped[grouped.length - 1][0];
  }, [grouped]);

  // Ref на текущий тур + auto-scroll при первой загрузке.
  // Не используем плавный скролл при первой отрисовке — он визуально мигает.
  // Скроллим инстантно к актуальному туру, дальше user скроллит сам.
  const currentRef = useRef(null);
  const scrolledOnceRef = useRef(false);
  useEffect(() => {
    if (loading || scrolledOnceRef.current || !currentRoundKey) return;
    if (view === 'scorers') return; // на вкладке лидеров скроллить нечего
    // requestAnimationFrame — даём React закончить рендер списка
    const id = requestAnimationFrame(() => {
      if (currentRef.current) {
        // 'start' с небольшим отступом — чтобы заголовок тура был виден сверху
        currentRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
        // Небольшой подъём, чтобы под header'ом тур не прятался
        window.scrollBy({ top: -80, behavior: 'auto' });
        scrolledOnceRef.current = true;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [loading, currentRoundKey, tournament, filter]);

  // Сброс «скроллил один раз» при смене таба турнира / фильтра —
  // чтобы при переключении тоже прыгало к актуальному туру.
  useEffect(() => { scrolledOnceRef.current = false; }, [view, filter]);

  function scrollToCurrent() {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setTimeout(() => window.scrollBy({ top: -80, behavior: 'smooth' }), 50);
    }
  }

  return (
    <div className="league-fixture public-page">
      <OfflineBanner />

      <div className="league-fixture__topbar">
        <button className="league-fixture__back" onClick={() => navigate(`/public/team/${age}`)}>
          ← К моей команде
        </button>
        <div className="league-fixture__title">
          {cal?.title || 'Календарь лиги'}
        </div>
      </div>

      {loading && (
        <div className="league-fixture__skeleton">
          <Skeleton h={44} br={10} />
          <Skeleton.List count={6} h={68} gap={8} br={10} />
        </div>
      )}

      {error && (
        <div className="public-page__empty public-page__empty--error">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Сегмент: лига / кубок / бомбардиры */}
          <div className="league-fixture__tournament">
            <button
              className={`league-fixture__seg ${view === 'league' ? 'is-active' : ''}`}
              onClick={() => setView('league')}
            >
              <UiIcon name="ball" size={14} /> Лига
            </button>
            <button
              className={`league-fixture__seg ${view === 'cup' ? 'is-active' : ''}`}
              onClick={() => setView('cup')}
            >
              <UiIcon name="trophy" size={14} /> Кубок
            </button>
            <button
              className={`league-fixture__seg ${view === 'scorers' ? 'is-active' : ''}`}
              onClick={() => setView('scorers')}
            >
              ⚽ Бомбардиры
            </button>
          </div>

          {view === 'scorers' ? (
            <ScorersView leaders={leaders} loading={leadersLoading} />
          ) : (
            <>
          {/* Фильтр прошедшие/будущие/все — только для календаря */}
          <div className="public-page__filters">
            {[
              { key: 'all',      label: 'Все' },
              { key: 'past',     label: 'Прошедшие' },
              { key: 'upcoming', label: 'Будущие' },
            ].map((f) => (
              <button
                key={f.key}
                className={`public-page__filter ${filter === f.key ? 'is-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >{f.label}</button>
            ))}
            <span className="league-fixture__count">{totalMatches}</span>
          </div>

          {/* Список матчей по турам */}
          {totalMatches === 0 ? (
            <EmptyState icon="📋" title="Нет матчей" subtitle="Календарь пуст для выбранного фильтра." />
          ) : (
            <div className="league-fixture__list">
              {grouped.map(([roundKey, list]) => (
                <div
                  key={roundKey}
                  className={`league-fixture__round ${roundKey === currentRoundKey ? 'is-current' : ''}`}
                  ref={roundKey === currentRoundKey ? currentRef : null}
                >
                  <div className="league-fixture__round-head">
                    <span className="league-fixture__round-name">{roundKey}</span>
                    {roundKey === currentRoundKey && (
                      <span className="league-fixture__round-badge">сейчас</span>
                    )}
                    <span className="league-fixture__round-count">{list.length}</span>
                  </div>
                  <div className="league-fixture__round-list">
                    {list.map((m, i) => (
                      <article
                        key={m.matchId || i}
                        className={
                          'lf-card'
                          + (m.isOurMatch ? ' lf-card--ours' : '')
                          + (m.isPast ? ' lf-card--past' : ' lf-card--upcoming')
                        }
                        onClick={() => setOpenMatch(m)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="lf-card__date">
                          {m.date ? fmtRelative(m.date) : 'Дата уточняется'}
                        </div>
                        <div className="lf-card__teams">
                          <div className={`lf-card__team lf-card__team--home ${isLegirus(m.home) ? 'lf-card__team--us' : ''}`}>
                            <img
                              src={shieldFor(m.home, m.homeShield)}
                              alt=""
                              className="lf-card__shield"
                              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                            />
                            <span className="lf-card__name">{shortName(m.home)}</span>
                          </div>
                          <div className="lf-card__score">
                            {m.isPast && m.score
                              ? <span><b>{m.score.home}</b>:<b>{m.score.away}</b></span>
                              : <span className="lf-card__vs">vs</span>}
                          </div>
                          <div className={`lf-card__team lf-card__team--away ${isLegirus(m.away) ? 'lf-card__team--us' : ''}`}>
                            <span className="lf-card__name">{shortName(m.away)}</span>
                            <img
                              src={shieldFor(m.away, m.awayShield)}
                              alt=""
                              className="lf-card__shield"
                              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                            />
                          </div>
                        </div>
                        {m.venue && <div className="lf-card__venue">{m.venue}</div>}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </>
      )}

      {openMatch && (
        <MatchDetailSheet
          match={openMatch}
          venue={findVenue(openMatch.venue)}
          age={age}
          onClose={() => setOpenMatch(null)}
          extra={
            <LeagueMatchPreview
              match={openMatch}
              allMatches={cal?.matches || []}
              standings={standings}
            />
          }
        />
      )}

      {/* Плавающая кнопка «К текущему туру» — появляется при списке от 4 туров.
          Полезна когда юзер ушёл скроллом далеко вперёд/назад от current.
          На вкладке «Бомбардиры» прячем — там нечего скроллить к туру. */}
      {!loading && view !== 'scorers' && currentRoundKey && grouped.length >= 4 && (
        <button
          type="button"
          className="league-fixture__jump-btn"
          onClick={scrollToCurrent}
          aria-label="К текущему туру"
        >
          ⚽ К текущему туру
        </button>
      )}
    </div>
  );
}

// Лидеры лиги (пока только бомбардиры). Backend агрегирует goals из events_data
// всех past-матчей подгруппы. Top 30 — больше показывать незачем, длинный хвост
// с 1 голом размывает leaderboard.
function ScorersView({ leaders, loading }) {
  if (loading) {
    return (
      <div className="lf-scorers__skeleton">
        <Skeleton.List count={8} h={48} gap={6} br={8} />
      </div>
    );
  }
  if (!leaders || leaders.length === 0) {
    return <EmptyState icon="⚽" title="Пока нет голов" subtitle="Бомбардиры появятся после первых протоколированных матчей лиги." />;
  }
  return (
    <ol className="lf-scorers">
      {leaders.map((p) => (
        <li key={p.playerId || `${p.playerName}-${p.teamName}`} className={`lf-scorers__row ${p.rank <= 3 ? 'lf-scorers__row--top' : ''}`}>
          <span className={`lf-scorers__rank ${p.rank === 1 ? 'is-gold' : p.rank === 2 ? 'is-silver' : p.rank === 3 ? 'is-bronze' : ''}`}>
            {p.rank}
          </span>
          <div className="lf-scorers__name-block">
            <span className="lf-scorers__name">{p.playerName}</span>
            <span className="lf-scorers__team">
              {p.teamShield && (
                <img
                  src={p.teamShield}
                  alt=""
                  className="lf-scorers__team-shield"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
              )}
              {shortName(p.teamName)}
            </span>
          </div>
          <span className="lf-scorers__goals">
            <b>{p.goals}</b>
            <span className="lf-scorers__goals-label">{p.goals === 1 ? 'гол' : (p.goals >= 2 && p.goals <= 4) ? 'гола' : 'голов'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

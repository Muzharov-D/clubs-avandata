// Шапка public-страницы:
//   [длинный лого АванDата]  ——  [ФК Легирус U17 + щит + «+»]
// Левый блок — clickable → TG-канал АванDата.
// Правый блок — название клуба, тир (U11..U19) и щит Легируса.
// Под шапкой — горизонтальные табы команд из myTeams (если >1) + ранг-блоки.
// Кнопка «+» открывает AddTeamSheet с двумя страницами (Младшие / Старшие).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tierForAge, leaguePosClass, clubPosClass, displayAge } from '../utils/ageRating';
import { useMyTeams, switchActive, removeTeam } from '../utils/myTeams';
import AddTeamSheet from './AddTeamSheet';
import PushOptInButton from './PushOptInButton';
import PushBellTab from './PushBellTab';
import StreakBadge from './StreakBadge';
import RankDelta from './RankDelta';
import './PublicTeamHeader.css';

const API_BASE = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return String(base).replace(/\/+$/, '');
})();

const TG_AVANDATA = 'https://t.me/AvanData';

export default function PublicTeamHeader({
  age,
  ourLeagueRow,
  clubRank,
  onOpenLeague,
  onOpenClub,
  matches, // для StreakBadge
}) {
  const navigate = useNavigate();
  const tier = tierForAge(age);
  const { teams: myTeams } = useMyTeams();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Дельта позиций за неделю (с прошлого понедельника 23:00 МСК).
  // Если бэк не отдал — RankDelta просто не нарисует стрелку.
  const [delta, setDelta] = useState(null);
  useEffect(() => {
    if (!age) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/public/team-rank-delta/${age}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setDelta(d); })
      .catch(() => { /* тихо игнорим — без стрелок ничего страшного */ });
    return () => { cancelled = true; };
  }, [age]);

  function tabClick(targetAge) {
    if (String(targetAge) === String(age)) return;
    switchActive(targetAge);
    navigate(`/public/team/${targetAge}`);
  }

  // Первая в myTeams — это «своя» команда, та что родитель выбрал в самом начале.
  // Её нельзя удалить никогда (защита и в UI, и в handleRemove).
  const primaryTeam = myTeams[0];

  // Удалить конкретную команду по клику на крестик в её табе.
  // Если удаляем текущую активную — навигация на первую из оставшихся.
  function handleRemove(targetAge, e) {
    e.stopPropagation(); // не триггерим tabClick на родительском <button>
    if (String(targetAge) === String(primaryTeam)) return; // primary защищена
    removeTeam(String(targetAge));
    if (String(targetAge) === String(age)) {
      // Активную убрали — переключаемся на первую оставшуюся (она всегда есть, т.к. primary не трогали).
      setTimeout(() => {
        const first = JSON.parse(localStorage.getItem('legirus.public.myTeams') || '[]')[0];
        if (first) navigate(`/public/team/${first}`, { replace: true });
        else navigate('/', { replace: true });
      }, 0);
    }
  }

  return (
    <header className="public-header">
      <div className="public-header__row">
        {/* Слева — лого АванData (clickable → TG канал) */}
        <a
          className="public-header__platform"
          href={TG_AVANDATA}
          target="_blank"
          rel="noreferrer"
          title="Канал АванDата в Telegram"
        >
          <img
            src="/icons/avandata.png"
            onError={(e) => { e.currentTarget.src = '/assets/logos/log-3_white.png'; }}
            alt="АванDата"
            className="public-header__platform-logo"
          />
        </a>

        {/* Push UI временно скрыт — на iOS Safari Web Push нестабилен без
            установленного PWA, пользователи жалуются на не доходящие уведомления.
            Backend (notifCron + matchNotifications + db) живой, можно вернуть
            убрав `false &&` ниже когда iOS-issue решим (либо если переходим
            на сторонний push-сервис). */}
        {false && <PushOptInButton publicMode age={age} />}

        {/* Справа — клуб (название + тир + щит) */}
        <button
          type="button"
          className="public-header__club"
          onClick={() => onOpenClub && onOpenClub()}
          title="Профиль клуба"
        >
          <div className="public-header__club-text">
            <div className="public-header__club-name">ФК&nbsp;Легирус</div>
            <div className="public-header__club-tier">{tier}</div>
          </div>
          <img
            src="/icons/legirus.png"
            onError={(e) => { e.currentTarget.src = '/assets/logos/legirus.png'; }}
            alt="ФК Легирус"
            className="public-header__club-logo"
          />
        </button>
      </div>

      {/* ───── Табы личного набора команд ───── */}
      <nav className="public-header__myteams" aria-label="Мои команды">
        {myTeams.map((t) => (
          <button
            key={t}
            type="button"
            className={
              'public-header__myteam'
              + (String(t) === String(age) ? ' is-active' : '')
              + (String(t) === String(primaryTeam) ? ' is-primary' : '')
            }
            onClick={() => tabClick(t)}
            title={
              String(t) === String(primaryTeam)
                ? `Своя команда — ${displayAge(t)}`
                : (t === String(age) ? 'Активная команда' : `Переключиться на ${displayAge(t)}`)
            }
          >
            <span className="public-header__myteam-tier">{tierForAge(t)}</span>
            <span className="public-header__myteam-year">{displayAge(t)}</span>
            {/* Per-team колокольчик скрыт вместе с PushOptInButton выше.
                Раскомментировать когда push-доставка будет стабильной. */}
            {false && <PushBellTab age={t} />}
            {/* Крестик показываем только для НЕ-primary (первой выбранной команды нельзя удалить — это «своя» команда родителя). */}
            {String(t) !== String(primaryTeam) && (
              <span
                role="button"
                tabIndex={-1}
                className="public-header__myteam-x"
                onClick={(e) => handleRemove(t, e)}
                aria-label={`Убрать ${displayAge(t)}`}
                title={`Убрать ${displayAge(t)} из избранного`}
              >×</span>
            )}
          </button>
        ))}

        <button
          type="button"
          className="public-header__addbtn"
          onClick={() => setSheetOpen(true)}
          aria-label="Добавить или переключить команду"
          title="Добавить ещё одну команду"
        >
          +
        </button>
      </nav>

      <div className="public-header__ranks">
        {ourLeagueRow && (
          <button
            type="button"
            className={`public-header__rank ${leaguePosClass(ourLeagueRow.pos)}`}
            onClick={onOpenLeague}
            title="Открыть таблицу лиги"
          >
            <div className="public-header__rank-pos">
              {ourLeagueRow.pos}
              {ourLeagueRow.pos <= 3 && (
                <span className="public-header__rank-medal">
                  {ourLeagueRow.pos === 1 ? '🥇' : ourLeagueRow.pos === 2 ? '🥈' : '🥉'}
                </span>
              )}
              <RankDelta delta={delta?.leagueDelta} />
            </div>
            <div className="public-header__rank-meta">
              в лиге {tier}
              <small>
                {ourLeagueRow.points} очк · {ourLeagueRow.wins}-{ourLeagueRow.draws}-{ourLeagueRow.losses}
              </small>
            </div>
          </button>
        )}
        {clubRank?.ourClubRank && (
          <button
            type="button"
            className={`public-header__rank public-header__rank--club ${clubPosClass(clubRank.ourClubRank)}`}
            onClick={onOpenClub}
            title="Открыть клубный зачёт"
          >
            <div className="public-header__rank-pos">
              {clubRank.ourClubRank}
              {clubRank.ourClubRank <= 2 && (
                <span className="public-header__rank-medal">
                  {clubRank.ourClubRank === 1 ? '🥇' : '🥈'}
                </span>
              )}
              <RankDelta delta={delta?.clubDelta} />
            </div>
            <div className="public-header__rank-meta">
              клубный зачёт
              <small>сумма мест: {clubRank.ourClubStats?.posSum ?? '—'}</small>
            </div>
          </button>
        )}
      </div>

      {/* Серия команды — последние результаты W/L/D */}
      {matches && (
        <div className="public-header__streak-row">
          <StreakBadge matches={matches} />
        </div>
      )}

      {/* Bottom sheet выбора команды */}
      <AddTeamSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </header>
  );
}

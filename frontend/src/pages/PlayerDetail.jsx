import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchMatches, fetchMetrics, fetchPlayer, fetchPlayersSeason, fetchPlayerTrend } from '../services/api';
import { compoundAt, matchMinutes, per90, seasonPercentile } from '../utils/analytics';
import PlayerAdvancedCard from '../components/analytics/PlayerAdvancedCard';
import SeasonPercentileCard from '../components/analytics/SeasonPercentileCard';
import SeasonProfileCard from '../components/analytics/SeasonProfileCard';
import PlayerDnaCard from '../components/analytics/PlayerDnaCard';
import { SplitText, Reveal } from '../components/motion';
import PlayerFormCard from '../components/analytics/PlayerFormCard';
import RoleFitCard from '../components/analytics/RoleFitCard';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PlayerPhoto from '../components/PlayerPhoto';
import AttendanceBlock from '../components/AttendanceBlock';
import RatingCard from '../components/RatingCard';
import RatingPill from '../components/RatingPill';
import SoccerFieldImageMap from '../components/SoccerFieldImageMap';
import PizzaChart from '../components/PizzaChart';
import PlayerTrendCard from '../components/PlayerTrendCard';
import HalfSplitChart from '../components/HalfSplitChart';
import SpeedZones from '../components/SpeedZones';
import PassProfile from '../components/PassProfile';
import { num, percentileRank, formatRaw } from '../utils/num';
import { POSITION_OPTIONS, PIZZA_VS_LABEL, TEMPLATES, getStatValue, positionGroup, CIES_GROUPS, CIES_METRIC_BY_KEY } from '../utils/pizzaTemplates';
import './PlayerDetail.css';

import { trimAgeSuffix as trimAge } from '../utils/teamName';
function fmtMatchShort(m) {
  if (!m) return '';
  const d = m.match_date || m.matchDate || m.date;
  const dt = d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
  const opp = trimAge(m.opponent || m.away || m.home || '');
  const score = (m.scoreHome != null && m.scoreAway != null) ? ` ${m.scoreHome}:${m.scoreAway}` : '';
  return `${dt}${score ? ' ·' + score : ''}${opp ? ' — ' + opp : ''}`.trim();
}

// Ключевые метрики для бейджей "Лучший в команде" — топ-3 ранг по матчу.
const RANK_METRICS = [
  { id: 'goal',         label: 'голам',                getter: (p) => p.stats?.attack4?.goal },
  { id: 'shot',         label: 'ударам в створ',       getter: (p) => p.stats?.attack4?.shot },
  { id: 'assist',       label: 'ассистам',             getter: (p) => p.stats?.attack1?.assist },
  { id: 'keyPass',      label: 'ключевым пасам',       getter: (p) => p.stats?.attack1?.keyPass },
  { id: 'progPass',     label: 'прогрессивным пасам',  getter: (p) => p.stats?.attack2?.progressivePass },
  { id: 'finalThird',   label: 'передачам в финальную треть', getter: (p) => p.stats?.attack2?.passToFinalThird },
  { id: 'tackle',       label: 'отборам',              getter: (p) => p.stats?.defence1?.tackle },
  { id: 'interception', label: 'перехватам',           getter: (p) => p.stats?.defence1?.interception },
  { id: 'pressing',     label: 'прессингу',            getter: (p) => p.stats?.defence2?.pressing },
  { id: 'save',         label: 'сейвам',               getter: (p) => p.stats?.defence3?.save },
  { id: 'distance',     label: 'дистанции',            getter: (p) => p.stats?.fitness?.totalDistance },
  { id: 'sprints',      label: 'спринтам',             getter: (p) => p.stats?.fitness?.sprintsCount },
];

const RANK_ICONS = ['🏆', '🥈', '🥉'];

// Splits keys grouped (used to render Атака / Защита tables).
const ATTACK_SPLIT_KEYS = [
  'Goal', 'Shot', 'Shot by head', 'Free kick shot', 'Free kick with shot',
  'Assist', 'Second assist', 'Third assist', 'Shot on target assist', 'Key pass',
  'Pass with packing', 'Pass into pen. area', 'Cross', 'Entries in box',
  'Sprint forward', 'Progressive pass', 'Pass to final third',
  'Pass', 'Pass forward', 'Pass back', 'Pass sideways',
  'Pass short', 'Pass middle', 'Pass long',
  'Touches in pen. area', 'Received pass',
  'Dribble', 'Dribble packing', 'Goal actions',
  'Penalty', 'Throwing', 'Direct free kick',
  'Lose on own half', 'Dangerous loses on own half', 'Lost ball',
  'Technical mistake', 'Autogoal', 'Offside', 'Fouls suffered',
];

const DEFENCE_SPLIT_KEYS = [
  'Tackle', 'Sliding tackles', 'Tackle & recovery', 'Tackle & recovery on opp. half',
  'Interception', 'Recovery', 'Sprint back', 'Return', 'Return on opp. half',
  'Clearance', 'Blocked shot', 'Foul', 'Yellow card', 'Red card',
  'Duel', 'Ariel duel', 'Pressing', 'Contrpressing', 'Dribble against',
  'Save', 'Shots against', 'Goalkeeper exits', 'Goal kick',
  'Short goal kicks', 'Long goal kicks',
];

// Fitness comes from stats.fitness, not splits.
const FITNESS_ROWS = [
  ['Минут на поле',                'minutes'],
  ['Общая дистанция, м',           'totalDistance'],
  ['Дистанция 4–5.5 м/с, м',       'speed_4_5_5'],
  ['Дистанция 5.5–7 м/с, м',       'speed_5_5_7'],
  ['Дистанция 7+ м/с, м',          'speed_7plus'],
  ['Спринтерская дистанция, м',    'sprintDistance'],
  ['Спринты',                      'sprintsCount'],
  ['Интенсивный бег',              'intenseRunning'],
  ['Средняя скорость, м/с',        'averageSpeed'],
];

function fmtNum(v, digits = 0) {
  const n = num(v);
  if (n === null || isNaN(n)) return '—';
  if (Number.isInteger(n) && digits === 0) return n.toString();
  return n.toFixed(digits);
}

function deltaArrow(first, second) {
  const f = num(first);
  const s = num(second);
  if (f === null || s === null || isNaN(f) || isNaN(s)) return null;
  if (Math.abs(s - f) < 0.001) return { dir: 'eq', text: '=' };
  if (s > f) return { dir: 'up', text: `+${(s - f).toFixed(s - f >= 1 ? 0 : 1)}` };
  return { dir: 'down', text: `${(s - f).toFixed(s - f <= -1 ? 0 : 1)}` };
}

export default function PlayerDetail() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { user, isPlayer } = useAuth();

  useEffect(() => {
    if (isPlayer && user?.playerId && user.playerId !== playerId) {
      navigate(`/players/${user.playerId}`, { replace: true });
    }
  }, [isPlayer, user, playerId, navigate]);

  const { selectedTeamId, selectedTeam, select } = useTeam();

  // Сначала тянем самого игрока (по нему узнаём teamId), потом синхронизируем
  // выбранную команду в шапке. Это чинит навигацию head_coach'а с КЛУБА на игрока
  // другой возрастной группы.
  const playerLookupRes = useApi(() => fetchPlayer(playerId).catch(() => null), [playerId]);
  const lookedUpPlayer = playerLookupRes.data?.player;

  useEffect(() => {
    if (lookedUpPlayer?.teamId && lookedUpPlayer.teamId !== selectedTeamId) {
      select(lookedUpPlayer.teamId);
    }
  }, [lookedUpPlayer, selectedTeamId, select]);

  // teamId, по которому тянем матчи — приоритет: teamId игрока, затем выбранная в шапке.
  const effectiveTeamId = lookedUpPlayer?.teamId || selectedTeamId;
  const matchesRes = useApi(
    () => (effectiveTeamId ? fetchMatches(effectiveTeamId) : Promise.resolve({ matches: [] })),
    [effectiveTeamId]
  );
  const allMatches = matchesRes.data?.matches || [];

  // Селектор матча: дефолтно последний, юзер может переключать (вкладка «Матчи»).
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const currentMatchId = selectedMatchId || allMatches[0]?.id;
  const matchRes = useApi(() => (currentMatchId ? fetchMatch(currentMatchId) : Promise.resolve(null)), [currentMatchId]);
  const metricsRes = useApi(fetchMetrics, []);

  // Сезонные агрегаты по всем игрокам — основа сезонного профиля/перцентилей.
  // Эндпоинт только для тренеров → defensively .catch(null), сезонные карточки
  // (профиль/перцентиль) деградируют, тренд/форма работают и для игрока.
  const seasonRes = useApi(
    () => (effectiveTeamId ? fetchPlayersSeason(effectiveTeamId).catch(() => null) : Promise.resolve(null)),
    [effectiveTeamId],
  );
  const seasonPlayers = seasonRes.data?.players || [];

  // Тренд игрока за сезон — на уровне страницы, чтобы посчитать сезонные итоги в
  // шапке и переиспользовать в карточках тренда/формы (без второго запроса).
  const trendRes = useApi(() => (playerId ? fetchPlayerTrend(playerId).catch(() => null) : Promise.resolve(null)), [playerId]);
  const series = trendRes.data?.series || [];

  // Вкладки: «Сезон» (общий профиль) по умолчанию · «Матчи» (разбор конкретного матча).
  const [tab, setTab] = useState('season');
  useEffect(() => { setSelectedMatchId(null); setTab('season'); }, [playerId]);

  const metrics = metricsRes.data || {};
  const labels = metrics.metricLabels || {};
  const match = matchRes.data;

  // Личность игрока для сезонной шапки: приоритет fetchPlayer (работает для всех
  // ролей), затем запись из состава матча.
  const matchPlayer = useMemo(
    () => (match?.players || []).find((p) => p.id === playerId),
    [match, playerId]
  );
  // Позиция игрока живёт в разборах SportVisor (positionFull per-player), а в
  // роли/сезонном агрегате её часто нет. Берём из последнего матча, где игрок
  // выходил — иначе профиль (ДНК/био) и список матчей расходятся в позиции
  // (на ТОП-5 «Правый нападающий», а в профиле — пусто/выдуманный «полузащитник»).
  const positionFromMatches = useMemo(() => {
    for (const m of allMatches) {
      const rec = (m.players || []).find((p) => p.id === playerId);
      if (rec?.positionFull || rec?.position) return rec.positionFull || rec.position;
    }
    return null;
  }, [allMatches, playerId]);
  const identity = useMemo(() => {
    const base = lookedUpPlayer || matchPlayer || null;
    if (!base) return null;
    if (base.positionFull || base.position) return base;
    return positionFromMatches ? { ...base, positionFull: positionFromMatches } : base;
  }, [lookedUpPlayer, matchPlayer, positionFromMatches]);

  useDocumentTitle(identity?.fullName ? `${identity.fullName} — Игрок` : 'Профиль игрока');

  // Сезонные итоги: из агрегата (тренеры) либо из серии тренда (игрок видит свою).
  const meSeason = useMemo(
    () => seasonPlayers.find((s) => s.id === playerId) || null,
    [seasonPlayers, playerId]
  );
  const seasonTotals = useMemo(() => {
    if (meSeason) {
      return {
        matches: meSeason.matches, minutes: meSeason.minutes,
        goals: meSeason.goals, assists: meSeason.assists, avgOverall: meSeason.avgOverall,
      };
    }
    if (series.length) {
      const rated = series.filter((s) => Number(s.overall) > 0).map((s) => Number(s.overall));
      return {
        matches: series.length,
        minutes: series.reduce((a, s) => a + (Number(s.minutes) || 0), 0),
        goals: series.reduce((a, s) => a + (Number(s.goals) || 0), 0),
        assists: series.reduce((a, s) => a + (Number(s.assists) || 0), 0),
        avgOverall: rated.length ? Number((rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(2)) : 0,
      };
    }
    return null;
  }, [meSeason, series]);

  // Базис нормализации = длина матча по возрасту команды (U18/17→80, U16/15→70, U14→60).
  const basis = matchMinutes(selectedTeam?.year);

  if (playerLookupRes.loading && matchesRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!identity && !matchesRes.loading && !matchRes.loading) return <div className="empty-state">Игрок не найден</div>;
  if (!identity) return <div className="empty-state">Загрузка…</div>;

  return (
    <div className="page player-detail">
      {/* Вкладки: Сезон / Матчи */}
      <div className="player-detail__tabs" role="tablist">
        <button
          type="button" role="tab"
          aria-selected={tab === 'season'}
          className={`player-detail__tab${tab === 'season' ? ' is-active' : ''}`}
          onClick={() => setTab('season')}
        >Сезон</button>
        <button
          type="button" role="tab"
          aria-selected={tab === 'matches'}
          className={`player-detail__tab${tab === 'matches' ? ' is-active' : ''}`}
          onClick={() => setTab('matches')}
        >Матчи{allMatches.length ? <span className="player-detail__tab-count">{allMatches.length}</span> : null}</button>
      </div>

      {tab === 'season' ? (
        <SeasonTab
          identity={identity}
          playerId={playerId}
          teamId={identity.teamId || effectiveTeamId}
          teamName={selectedTeam?.name || ''}
          seasonPlayers={seasonPlayers}
          series={series}
          seasonTotals={seasonTotals}
          basis={basis}
        />
      ) : (
        <MatchTab
          playerId={playerId}
          match={match}
          loading={matchRes.loading || matchesRes.loading}
          allMatches={allMatches}
          currentMatchId={currentMatchId}
          setSelectedMatchId={setSelectedMatchId}
          labels={labels}
          basis={basis}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── ВКЛАДКА «СЕЗОН» ─────────────────────────────
   Общий профиль игрока в стиле скаут-овервью (референс TheAnalyst): компактная
   шапка, ряд из 3 карточек (инфо · статистика плитками · авто-биография),
   радар-витрина и сезонная динамика. */
function SeasonTab({ identity, playerId, teamId, teamName, seasonPlayers, series, seasonTotals, basis = 90 }) {
  const avg = seasonTotals?.avgOverall;
  const bio = useMemo(
    () => seasonBio(identity, seasonTotals, series, seasonPlayers, basis),
    [identity, seasonTotals, series, seasonPlayers, basis],
  );

  // Позиционная строка героя ДНК: №7 · полузащитник · Легирус.
  const positionLine = [
    identity.number != null ? `№${identity.number}` : null,
    identity.positionFull || identity.position || null,
    teamName ? trimAge(teamName) : null,
  ].filter(Boolean).join(' · ');

  // ДНК-карта строится только при наличии сезонного пула (4+ игроков). Если её
  // нет — показываем компактную сезонную шапку как fallback, чтобы экран не пустел.
  const dnaCard = (
    <PlayerDnaCard
      subject={identity}
      seasonPlayers={seasonPlayers}
      basis={basis}
      className="dna-card--hero"
      showStatsInline
      stats={seasonTotals}
      positionLine={positionLine}
      photo={<PlayerPhoto player={identity} size={120} />}
    />
  );

  return (
    <>
      {/* ГЕРОЙ-ЦЕНТР: расширенная ДНК-карта — сразу после вкладок, до инфо-блоков */}
      <Reveal variant="slide-up" duration={0.4}>{dnaCard}</Reveal>

      {/* Fallback-шапка, если сезонного пула для ДНК недостаточно */}
      {(!Array.isArray(seasonPlayers) || seasonPlayers.length < 4) && (
        <div className="card player-detail__hero player-detail__hero--season">
          <PlayerPhoto player={identity} size={120} />
          <div className="player-detail__hero-info">
            <h1 className="player-detail__hero-name"><SplitText text={identity.fullName} /></h1>
            <div className="player-detail__hero-pos">{positionLine}</div>
          </div>
          <div className="player-detail__hero-rating">
            <RatingPill value={avg} size="xl" />
            <div className="player-detail__hero-rating-100">средний за сезон</div>
          </div>
        </div>
      )}

      {/* ОВЕРВЬЮ: 2 карточки в ряд (инфо · авто-биография) */}
      <Reveal variant="slide-up" duration={0.5}>
        <div className="player-detail__overview player-detail__overview--duo">
          <PlayerInfoCard identity={identity} teamName={teamName} />
          <div className="card pd-bio">
            <div className="page-section-title">Профиль</div>
            {bio ? <p className="pd-bio__text">{bio}</p> : <div className="pd-bio__empty">Сезонная сводка появится после разбора матчей.</div>}
          </div>
        </div>
      </Reveal>

      {/* Посещаемость тренировок — появляется только если есть данные */}
      <AttendanceBlock teamId={teamId} playerId={playerId} />

      {/* Радар-витрина: сезонная пицца (за матч vs позиционный пул) */}
      <Reveal variant="slide-up" duration={0.5} delay={0.2}><SeasonProfileCard subject={identity} seasonPlayers={seasonPlayers} basis={basis} /></Reveal>

      {/* Динамика по сезону — спарклайны рейтингов + лента матчей */}
      <Reveal variant="slide-up" duration={0.5} delay={0.3}><PlayerTrendCard playerId={playerId} series={series} /></Reveal>

      {/* Форма: индекс свежих матчей, vs своё среднее, серия, траектория */}
      <Reveal variant="slide-up" duration={0.5} delay={0.35}><PlayerFormCard playerId={playerId} series={series} /></Reveal>

      {/* Перцентиль vs сезонный позиционный пул (за матч) — детальные полосы */}
      <Reveal variant="slide-up" duration={0.5} delay={0.4}><SeasonPercentileCard subject={identity} seasonPlayers={seasonPlayers} basis={basis} /></Reveal>

      {series.length < 2 && (!seasonPlayers || seasonPlayers.length < 4) && (
        <div className="empty-state">
          Сезонная статистика появится после разбора 2+ матчей.
          Перейдите во вкладку «Матчи», чтобы посмотреть разбор конкретной игры.
        </div>
      )}
    </>
  );
}

// Возраст из даты рождения (академия — юноши; в браузере new Date() допустим).
function ageFrom(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 100 ? age : null;
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Карточка-идентичность игрока (референс «Player Information»).
function PlayerInfoCard({ identity, teamName }) {
  const age = ageFrom(identity.birthDate);
  const dob = fmtDate(identity.birthDate);
  const rows = [
    ['Имя', identity.fullName],
    ['Дата рождения', dob],
    ['Возраст', age != null ? `${age} ${plural(age, 'год', 'года', 'лет')}` : null],
    ['Команда', teamName ? trimAge(teamName) : null],
    ['Позиция', identity.positionFull || identity.position],
    ['Номер', identity.number != null ? `№${identity.number}` : null],
  ].filter(([, v]) => v != null && v !== '');
  return (
    <div className="card pd-info">
      <div className="page-section-title">Информация об игроке</div>
      <div className="pd-info__rows">
        {rows.map(([label, val]) => (
          <div className="pd-info__row" key={label}>
            <span className="pd-info__label">{label}</span>
            <span className="pd-info__val">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Метрики для «сильных сторон» в био — те же, что в сезонном перцентиле.
const BIO_METRICS = [
  { label: 'гол+пас',             get: (s) => (s.goals || 0) + (s.assists || 0) },
  { label: 'удары',               get: (s) => s.shots || 0 },
  { label: 'ключевые передачи',   get: (s) => s.keyPass || 0 },
  { label: 'обводки',             get: (s) => s.dribble || 0 },
  { label: 'отборы',              get: (s) => s.tackle || 0 },
  { label: 'перехваты',           get: (s) => s.interception || 0 },
  { label: 'возвраты',            get: (s) => s.recovery || 0 },
  { label: 'единоборства',        get: (s) => s.duel || 0 },
  { label: 'прессинг',            get: (s) => s.pressing || 0 },
  { label: 'дистанцию',           get: (s) => s.distance || 0 },
];

// Топ-2 сильные стороны: перцентиль ≥ 70 vs позиционный пул (за матч).
function bioStrengths(subject, seasonPlayers, basis) {
  if (!Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return [];
  const me = seasonPlayers.find((s) => s.id === subject.id);
  if (!me || !(me.minutes > 0)) return [];
  const out = [];
  for (const m of BIO_METRICS) {
    const poolMax = Math.max(0, ...seasonPlayers.map((s) => Number(m.get(s)) || 0));
    if (poolMax <= 0) continue;
    const my = per90(m.get(me), me.minutes, 1, basis);
    const res = seasonPercentile(subject, seasonPlayers, (s) => per90(m.get(s), s.minutes, 1, basis), my);
    if (res.pct != null && res.pct >= 70) out.push({ label: m.label, pct: res.pct });
  }
  out.sort((a, b) => b.pct - a.pct);
  return out.slice(0, 2).map((s) => `${s.label} (${s.pct}-й перцентиль)`);
}

// Заметка о форме по серии тренда (последние vs своё среднее).
function bioFormNote(series) {
  const rated = (series || []).filter((s) => Number(s.overall) > 0).map((s) => Number(s.overall));
  if (rated.length < 3) return null;
  const mean = rated.reduce((a, b) => a + b, 0) / rated.length;
  const recent = rated.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, rated.length);
  const d = recent - mean;
  if (d > 0.15) return 'Сейчас на ходу — форма выше своего сезонного среднего.';
  if (d < -0.15) return 'Небольшой спад — форма ниже своего сезонного среднего.';
  return 'Форма стабильная.';
}

// Когда позиция в данных пустая — берём роль из той же группировки, что и
// карточка «ДНК игрока» (positionGroup), чтобы био и архетип НЕ противоречили
// друг другу («Атакующий полузащитник» сверху и «защитник» в тексте — это и есть
// «разные вселенные»). Без данных о позиции группа = MID → «полузащитник».
function inferRoleNoun(identity) {
  switch (positionGroup(identity)) {
    case 'GK': return 'вратарь';
    case 'DEF': return 'защитник';
    case 'FWD': return 'нападающий';
    default: return 'полузащитник';
  }
}

// Авто-биография по сезону (референс «Player Bio») — скаут-абзац из данных:
// кто игрок, объём, результативность, сильные стороны, форма, последний матч.
function seasonBio(identity, totals, series, seasonPlayers, basis = 90) {
  if (!totals || !totals.matches) return null;
  const explicitPos = identity.positionFull || identity.position;
  const pos = (explicitPos || inferRoleNoun(identity) || 'полевой игрок').toLowerCase();
  const age = ageFrom(identity.birthDate);
  const parts = [];

  parts.push(
    age != null
      ? `${identity.fullName} — ${pos}, ${age} ${plural(age, 'год', 'года', 'лет')}.`
      : `${identity.fullName} — ${pos}.`,
  );
  parts.push(
    `В сезоне — ${totals.matches} ${plural(totals.matches, 'матч', 'матча', 'матчей')} ` +
    `(${totals.minutes} ${plural(totals.minutes, 'минута', 'минуты', 'минут')} на поле).`,
  );

  const gi = (totals.goals || 0) + (totals.assists || 0);
  if (gi > 0) {
    parts.push(
      `${totals.goals} ${plural(totals.goals, 'гол', 'гола', 'голов')} ` +
      `и ${totals.assists} ${plural(totals.assists, 'ассист', 'ассиста', 'ассистов')} — ` +
      `${gi} ${plural(gi, 'результативное действие', 'результативных действия', 'результативных действий')}.`,
    );
  } else {
    parts.push('Результативными действиями в сезоне пока не отметился.');
  }

  const strengths = bioStrengths(identity, seasonPlayers, basis);
  if (strengths.length) parts.push(`Среди лучших в команде по: ${strengths.join(', ')}.`);

  const form = bioFormNote(series);
  if (form) parts.push(form);

  const last = Array.isArray(series) && series.length ? series[series.length - 1] : null;
  if (last && last.date) {
    const d = new Date(last.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const res = last.result === 'W' ? 'победа' : last.result === 'L' ? 'поражение' : last.result === 'D' ? 'ничья' : null;
    const opp = trimAge(last.opponent || 'соперника');
    parts.push(`Последний матч — ${d} против ${opp}${last.score ? ` (${last.score})` : ''}${res ? `, ${res}` : ''}.`);
  }
  if (totals.avgOverall > 0) parts.push(`Средний рейтинг — ${totals.avgOverall.toFixed(1)}.`);

  return parts.join(' ');
}

/* ──────────────────────────── ВКЛАДКА «МАТЧИ» ──────────────────────────────
   Разбор конкретного матча: рейтинги, продвинутые метрики, пицца по составу,
   role-fit, фитнес, тепловая карта, сплиты по таймам. */
function MatchTab({ playerId, match, loading, allMatches, currentMatchId, setSelectedMatchId, labels, basis = 90 }) {
  // Pizza chart: выбор позиционного шаблона и фильтр группы — состояние вкладки.
  const player = useMemo(
    () => (match?.players || []).find((p) => p.id === playerId),
    [match, playerId]
  );
  const [pizzaPos, setPizzaPos] = useState('MID');
  const [pizzaGroup, setPizzaGroup] = useState('all');
  // Режим пиццы: 'template' (быстрый шаблон по позиции) или 'custom' (свои метрики по CIES).
  const [pizzaMode, setPizzaMode] = useState('template');
  const [customKeys, setCustomKeys] = useState(() => new Set());
  useEffect(() => {
    setPizzaPos(positionGroup(player) || 'MID');
    setPizzaGroup('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, player?.position]);

  const toggleCustomKey = (key) => {
    setCustomKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const matchPicker = allMatches.length > 1 && (
    <div className="player-detail__match-picker">
      <label htmlFor="pd-match-select">Матч:</label>
      <select
        id="pd-match-select"
        value={currentMatchId || ''}
        onChange={(e) => setSelectedMatchId(e.target.value)}
      >
        {allMatches.map((m) => (
          <option key={m.id} value={m.id}>{fmtMatchShort(m) || `Матч ${m.id}`}</option>
        ))}
      </select>
    </div>
  );

  if (loading) return <>{matchPicker}<div className="empty-state">Загрузка…</div></>;
  if (!match) return <>{matchPicker}<div className="empty-state">Нет данных о матче</div></>;
  if (!player) return <>{matchPicker}<div className="empty-state">Игрок не выходил на поле в этом матче</div></>;

  const ratings = player.ratings || {};
  const splits = player.splits || {};
  const fitnessStats = player.stats?.fitness || {};

  const attackRows = ATTACK_SPLIT_KEYS.filter((k) => splits[k]);
  const defenceRows = DEFENCE_SPLIT_KEYS.filter((k) => splits[k]);

  // Бейджи «Лучший в команде» — топ-3 ранг по матчу.
  const all = match.players;
  const badges = [];
  for (const m of RANK_METRICS) {
    const ranked = [...all]
      .map((p) => ({ p, v: num(m.getter(p)) }))
      .filter((r) => r.v !== null && !isNaN(r.v) && r.v > 0)
      .sort((a, b) => b.v - a.v);
    const idx = ranked.findIndex((r) => r.p.id === player.id);
    if (idx >= 0 && idx < 3) {
      badges.push({ rank: idx + 1, label: m.label, value: ranked[idx].v, icon: RANK_ICONS[idx] });
    }
  }
  badges.sort((a, b) => a.rank - b.rank);

  // Ключевые метрики для визуала «по таймам» (момент игры).
  const HALF_VIZ = [
    ['Pass', 'Передачи'], ['Shot', 'Удары'], ['Dribble', 'Обводки'], ['Key pass', 'Ключевые пасы'],
    ['Cross', 'Кроссы'], ['Entries in box', 'Входы в штрафную'], ['Touches in pen. area', 'Касания в штрафной'],
    ['Tackle', 'Отборы'], ['Interception', 'Перехваты'], ['Recovery', 'Возвраты'], ['Duel', 'Единоборства'],
  ];
  const halfRows = HALF_VIZ
    .map(([k, label]) => ({ label, first: splits[k]?.first, second: splits[k]?.second }))
    .filter((r) => (Number(r.first) || 0) + (Number(r.second) || 0) > 0);

  // Pizza slices: для каждой метрики шаблона percentile vs ВСЕЙ команды матча.
  const pizzaTemplate = TEMPLATES[pizzaPos];
  const peers = match.players || [];
  const allSlicesRaw = pizzaTemplate
    ? pizzaTemplate.slices.map((s) => {
        const myValue = getStatValue(player, s.key);
        const allValues = peers.map((p) => getStatValue(p, s.key));
        const pct = percentileRank(myValue, allValues, !!s.inverse);
        const teamMax = Math.max(0, ...allValues.map((v) => Number(num(v) ?? 0)));
        return { axis: s.axis, group: s.group, value: pct ?? 0, displayValue: formatRaw(myValue), _key: s.key, _teamMax: teamMax };
      })
    : [];
  const allSlices = allSlicesRaw.filter((s) => s._teamMax > 0);
  const pizzaSlices = pizzaGroup === 'all' ? allSlices : allSlices.filter((s) => s.group === pizzaGroup);
  const groupCounts = allSlices.reduce(
    (acc, s) => { acc[s.group] = (acc[s.group] || 0) + 1; return acc; },
    { attack: 0, defence: 0, fitness: 0 },
  );
  const GROUP_TABS = [
    { value: 'all',     label: 'Все',     count: allSlices.length },
    { value: 'attack',  label: 'Атака',   count: groupCounts.attack },
    { value: 'defence', label: 'Оборона', count: groupCounts.defence },
    { value: 'fitness', label: 'Фитнес',  count: groupCounts.fitness },
  ];

  // Свои метрики (CIES): пицца из выбранных тренером показателей.
  const customSlices = Array.from(customKeys)
    .map((key) => {
      const meta = CIES_METRIC_BY_KEY[key];
      if (!meta) return null;
      const myValue = getStatValue(player, key);
      const allValues = peers.map((p) => getStatValue(p, key));
      const pct = percentileRank(myValue, allValues, meta.inverse);
      const teamMax = Math.max(0, ...allValues.map((v) => Number(num(v) ?? 0)));
      return { axis: meta.axis, group: meta.color, value: pct ?? 0, displayValue: formatRaw(myValue), _key: key, _teamMax: teamMax };
    })
    .filter(Boolean);
  // Метрики, по которым в этом матче нет данных у всей команды — помечаем, чтобы
  // не вводить тренера в заблуждение пустыми слайсами.
  const customSlicesWithData = customSlices.filter((s) => s._teamMax > 0);
  const usingCustom = pizzaMode === 'custom';
  const activeSlices = usingCustom ? customSlicesWithData : pizzaSlices;

  // Присутствие секций — для sticky-навигации и условного рендера групп.
  const hasHeatmap = !!player.maps?.fitnessHeatmap;
  const hasFitness = FITNESS_ROWS.some(([, k]) => Number(num(fitnessStats[k]) ?? 0) > 0);
  const zz1 = num(fitnessStats.speed_4_5_5), zz2 = num(fitnessStats.speed_5_5_7), zz3 = num(fitnessStats.speed_7plus);
  const hasZones = (zz1 || 0) + (zz2 || 0) + (zz3 || 0) > 0 || (num(fitnessStats.totalDistance) || 0) > 0;
  const pa3 = player.stats?.attack3 || {};
  const dirSum = (num(pa3.passForward) || 0) + (num(pa3.passSideways) || 0) + (num(pa3.passBack) || 0);
  const lenSum = (num(pa3.passShort) || 0) + (num(pa3.passMiddle) || 0) + (num(pa3.passLong) || 0);
  const hasPass = dirSum + lenSum > 0;
  const hasHalves = halfRows.length > 0;
  const hasSplits = attackRows.length > 0 || defenceRows.length > 0;
  const navSections = [
    { id: 'pd-overview', label: 'Обзор',   show: true },
    { id: 'pd-profile',  label: 'Профиль', show: peers.length >= 2 || badges.length > 0 },
    { id: 'pd-physical', label: 'Фитнес',  show: hasHeatmap || hasFitness || hasZones },
    { id: 'pd-passing',  label: 'Пас',     show: hasPass || hasHalves },
    { id: 'pd-details',  label: 'Детали',  show: hasSplits },
  ].filter((s) => s.show);

  return (
    <>
      {matchPicker}
      {navSections.length > 1 && (
        <nav className="pd-nav" aria-label="Разделы матча">
          {navSections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="pd-nav__link">{s.label}</a>
          ))}
        </nav>
      )}

      <section id="pd-overview" className="pd-section">
      {/* HEADER — игрок в контексте выбранного матча */}
      <div className="card player-detail__hero">
        <PlayerPhoto player={player} size={132} />
        <div className="player-detail__hero-info">
          <div className="player-detail__hero-pos">№{player.number} · {player.positionFull}</div>
          <h1 className="player-detail__hero-name">{player.fullName}</h1>
          {match && <div className="player-detail__hero-match">по матчу {fmtMatchShort(match)}</div>}
          <div className="player-detail__hero-meta">
            {Number(player.minutes ?? 0) === 0 ? (
              <span style={{ color: 'var(--text-muted)' }}>Не выходил на поле в этом матче</span>
            ) : (
              <>
                <span>Минут на поле: <b>{player.minutes}</b></span>
                <span>Голы: <b>{num(player.stats?.attack4?.goal) || 0}</b></span>
                <span>Ассисты: <b>{num(player.stats?.attack1?.assist) || 0}</b></span>
                <span>Перехваты: <b>{num(player.stats?.defence1?.interception) || 0}</b></span>
              </>
            )}
          </div>
        </div>
        <div className="player-detail__hero-rating">
          <RatingPill value={ratings.overall} size="xl" />
          <div className="player-detail__hero-rating-100">
            {ratings.overall ? Math.round(ratings.overall * 10) : '—'}/100
          </div>
        </div>
      </div>

      {/* 4 RATING CARDS */}
      <div className="player-detail__ratings reveal">
        <RatingCard label="Общий" value={ratings.overall} />
        <RatingCard label="Фитнес" value={ratings.fitness} />
        <RatingCard label="Атака" value={ratings.attack} />
        <RatingCard label="Защита" value={ratings.defence} />
      </div>

      {/* Продвинутые модельные метрики за матч (xG/xT/xA/packing/PAdj/win%) */}
      <PlayerAdvancedCard player={player} squad={match.players} match={match} basis={basis} />

      </section>

      <section id="pd-profile" className="pd-section">
      {/* RIBBON: Лучший в команде (в этом матче) */}
      {badges.length > 0 && (
        <div className="card player-detail__ribbon reveal">
          <div className="page-section-title">Лучший в команде <span className="an-model-tag">в этом матче</span></div>
          <div className="player-detail__ribbon-row">
            {badges.map((b, i) => (
              <div className={`badge badge--rank-${b.rank}`} key={i}>
                <span className="badge__icon">{b.icon}</span>
                <div className="badge__body">
                  <div className="badge__rank">{b.rank === 1 ? 'Лучший по' : `#${b.rank} по`}</div>
                  <div className="badge__label">{b.label}</div>
                </div>
                <div className="badge__value">{Number.isInteger(b.value) ? b.value : b.value.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PIZZA CHART — профиль по составу матча */}
      <div className="card player-detail__pizza">
        <div className="player-detail__pizza-head">
          <div className="page-section-title">Профиль в матче</div>
          <div className="player-detail__pizza-mode" role="tablist" aria-label="Режим пиццы">
            <button
              type="button" role="tab" aria-selected={pizzaMode === 'template'}
              className={`player-detail__pizza-modebtn${pizzaMode === 'template' ? ' is-active' : ''}`}
              onClick={() => setPizzaMode('template')}
            >
              Шаблон позиции
            </button>
            <button
              type="button" role="tab" aria-selected={pizzaMode === 'custom'}
              className={`player-detail__pizza-modebtn${pizzaMode === 'custom' ? ' is-active' : ''}`}
              onClick={() => setPizzaMode('custom')}
            >
              Свои метрики{customKeys.size > 0 ? ` · ${customKeys.size}` : ''}
            </button>
          </div>
        </div>

        {pizzaMode === 'template' ? (
          <>
            <div className="player-detail__pizza-pos">
              <label htmlFor="pizza-pos">Шаблон:</label>
              <select
                id="pizza-pos"
                value={pizzaPos}
                onChange={(e) => { setPizzaPos(e.target.value); setPizzaGroup('all'); }}
              >
                {POSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="player-detail__pizza-tabs" role="tablist">
              {GROUP_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={pizzaGroup === t.value}
                  className={`player-detail__pizza-tab player-detail__pizza-tab--${t.value}${pizzaGroup === t.value ? ' is-active' : ''}`}
                  onClick={() => setPizzaGroup(t.value)}
                  disabled={t.count === 0}
                >
                  {t.label}<span className="player-detail__pizza-tab-count">{t.count}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="player-detail__cies">
            <div className="player-detail__cies-hint">
              Соберите свою пиццу — отметьте любые показатели. Группировка — по областям CIES.
              {customKeys.size > 0 && (
                <button type="button" className="player-detail__cies-clear" onClick={() => setCustomKeys(new Set())}>
                  Сбросить
                </button>
              )}
            </div>
            <div className="player-detail__cies-groups">
              {CIES_GROUPS.map((g) => (
                <div className="player-detail__cies-group" key={g.id}>
                  <div className={`player-detail__cies-group-title player-detail__cies-group-title--${g.color}`}>{g.label}</div>
                  {g.metrics.map((m) => {
                    const hasData = peers.some((p) => Number(num(getStatValue(p, m.key)) ?? 0) > 0);
                    return (
                      <label
                        key={m.key}
                        className={`player-detail__cies-opt${customKeys.has(m.key) ? ' is-on' : ''}${hasData ? '' : ' is-empty'}`}
                        title={hasData ? '' : 'В этом матче нет данных у команды'}
                      >
                        <input
                          type="checkbox"
                          checked={customKeys.has(m.key)}
                          onChange={() => toggleCustomKey(m.key)}
                        />
                        {m.axis}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {peers.length < 2 ? (
          <div className="empty-state">
            Недостаточно данных для сравнения с командой (нужны рейтинги хотя бы 2 игроков матча).
          </div>
        ) : usingCustom && activeSlices.length < 3 ? (
          <div className="empty-state">
            Отметьте минимум 3 показателя с данными, чтобы построить пиццу
            {customKeys.size > 0 && activeSlices.length < customKeys.size
              ? ' (часть выбранных метрик в этом матче пуста).'
              : '.'}
          </div>
        ) : (
          <PizzaChart
            subjectName={`${player.fullName} · ${player.positionFull || ''} · ${player.minutes ?? '?'} мин`}
            subjectMeta={`Цифры — реальные значения, длина слайса — перцентиль среди ${PIZZA_VS_LABEL} (${peers.length} чел.)`}
            vsLabel={PIZZA_VS_LABEL}
            slices={activeSlices}
          />
        )}
      </div>

      {/* Ролевой профиль — к какому архетипу ближе игрок */}
      <RoleFitCard player={player} squad={match.players} />

      </section>

      <section id="pd-physical" className="pd-section">
      {/* MAPS — тепловая карта движения */}
      {player.maps?.fitnessHeatmap && (
        <div className="player-detail__maps">
          <div className="card player-detail__map-card player-detail__map-card--heat">
            <SoccerFieldImageMap src={player.maps.fitnessHeatmap} title="Тепловая карта движения" height={420} />
          </div>
        </div>
      )}

      <div className="pd-grid-2">
      {/* FITNESS — скрываем целиком если ни одна метрика не считалась (бенч) */}
      {FITNESS_ROWS.some(([, k]) => Number(num(fitnessStats[k]) ?? 0) > 0) && (
        <div className="card">
          <div className="page-section-title">Фитнес</div>
          <div className="player-detail__fitness-grid">
            {FITNESS_ROWS.map(([label, key]) => (
              <div className="fitness-cell" key={key}>
                <div className="fitness-cell__value">
                  {fmtNum(fitnessStats[key], key === 'averageSpeed' || key === 'intenseRunning' ? 2 : 0)}
                </div>
                <div className="fitness-cell__label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Зоны интенсивности */}
      {(() => {
        const z1 = num(fitnessStats.speed_4_5_5), z2 = num(fitnessStats.speed_5_5_7), z3 = num(fitnessStats.speed_7plus);
        if ((z1 || 0) + (z2 || 0) + (z3 || 0) <= 0 && (num(fitnessStats.totalDistance) || 0) <= 0) return null;
        return (
          <div className="card reveal">
            <div className="page-section-title">Зоны интенсивности</div>
            <SpeedZones
              z1={z1} z2={z2} z3={z3}
              total={num(fitnessStats.totalDistance)}
              sprintDist={num(fitnessStats.sprintDistance)}
              sprints={num(fitnessStats.sprintsCount)}
            />
          </div>
        );
      })()}

      </div>
      </section>

      <section id="pd-passing" className="pd-section">
      <div className="pd-grid-2">
      {/* Профиль передач */}
      {(() => {
        const a3 = player.stats?.attack3 || {};
        const a2 = player.stats?.attack2 || {};
        const dirSum = num(a3.passForward) + num(a3.passSideways) + num(a3.passBack);
        const lenSum = num(a3.passShort) + num(a3.passMiddle) + num(a3.passLong);
        if ((dirSum || 0) + (lenSum || 0) <= 0) return null;
        return (
          <div className="card reveal">
            <div className="page-section-title">Профиль передач</div>
            <PassProfile
              forward={a3.passForward} sideways={a3.passSideways} back={a3.passBack}
              short={a3.passShort} middle={a3.passMiddle} long={a3.passLong}
              total={a2.pass}
              accuracy={compoundAt(player, 'attack', 'pass').accuracy}
            />
          </div>
        );
      })()}

      {halfRows.length > 0 && (
        <div className="card">
          <div className="page-section-title">По таймам — момент игры</div>
          <HalfSplitChart rows={halfRows} hint="Длина полос — доля действий в каждом тайме. ▲/▼ — изменение во 2-м тайме." />
        </div>
      )}

      </div>
      </section>

      <section id="pd-details" className="pd-section">
      {(attackRows.length > 0 || defenceRows.length > 0) && (
        <details className="card player-detail__splits-toggle">
          <summary className="player-detail__splits-summary">
            <span>Раскрыть полную таблицу метрик</span>
            <span className="player-detail__splits-summary-meta">
              {attackRows.length} атака · {defenceRows.length} защита · по таймам
            </span>
          </summary>
          <div className="player-detail__splits-body">
            <SplitsTable title="Атака — раскладка по таймам" keys={attackRows} splits={splits} labels={labels} />
            <SplitsTable title="Защита — раскладка по таймам" keys={defenceRows} splits={splits} labels={labels} />
          </div>
        </details>
      )}
      </section>
    </>
  );
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function SplitsTable({ title, keys, splits, labels }) {
  if (!keys.length) return null;
  return (
    <div className="card splits-table">
      <div className="page-section-title">{title}</div>
      <div className="splits-table__head">
        <span>Метрика</span>
        <span className="splits-table__col-num">Матч</span>
        <span className="splits-table__col-num">1 тайм</span>
        <span className="splits-table__col-num">2 тайм</span>
        <span className="splits-table__col-num">Дельта</span>
      </div>
      <div className="splits-table__body">
        {keys.map((k) => {
          const row = splits[k];
          const m = num(row.match);
          const f = num(row.first);
          const s = num(row.second);
          const d = deltaArrow(row.first, row.second);
          return (
            <div className="splits-table__row" key={k}>
              <span className="splits-table__label">{labels[k] || k}</span>
              <span className="splits-table__val splits-table__val--match">{m === null || isNaN(m) ? '—' : m}</span>
              <span className="splits-table__val">{f === null || isNaN(f) ? '—' : f}</span>
              <span className="splits-table__val">{s === null || isNaN(s) ? '—' : s}</span>
              <span className={`splits-table__delta splits-table__delta--${d?.dir || 'eq'}`}>
                {d ? d.text : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

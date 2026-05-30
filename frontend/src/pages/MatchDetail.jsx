import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchPlayers, fetchMatches, deleteMatch, updateMatchNote } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import FormationField from '../components/FormationField';
import MatchTimeline from '../components/MatchTimeline';
import StatCompareBar from '../components/StatCompareBar';
import DonutComparisonCard from '../components/DonutComparisonCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import RatingCard from '../components/RatingCard';
import SoccerFieldImageMap from '../components/SoccerFieldImageMap';
import DataQualityBadge from '../components/DataQualityBadge';
import HalfSplitChart from '../components/HalfSplitChart';
import RatingBeeswarm from '../components/RatingBeeswarm';
import SpeedZones from '../components/SpeedZones';
import SquadHeatmap from '../components/SquadHeatmap';
import TwoWayScatter from '../components/TwoWayScatter';
import { shieldFor } from '../utils/legirus';
import { shortNameFromPlayer } from '../utils/players';
import { matchInsights } from '../utils/insights';
import { downloadCsv } from '../utils/exportCsv';
import './MatchDetail.css';

const SECTION_MAPS = [
  { id: 'shooting',              title: 'Удары' },
  { id: 'setPieces',             title: 'Стандарты' },
  { id: 'passes',                title: 'Передачи' },
  { id: 'attacks',               title: 'Атаки' },
  { id: 'recoveriesAndTackling', title: 'Отборы и возвраты' },
  { id: 'duels',                 title: 'Единоборства' },
  { id: 'pressing',              title: 'Прессинг' },
  { id: 'positioning',           title: 'Оборона' },
];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

// Убирает «U15» / «U-15» / «2011» из названия команды для display
function trimAgeStr(s) {
  return String(s || '')
    .replace(/\s*[Uu]-?\s*\d{1,3}\s*/g, ' ')
    .replace(/\s+20\d{2}\s*/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function bestPlayer(match) {
  if (!match?.players?.length) return null;
  // Только реально играшие с положительным рейтингом — иначе MotM = бенч с 0.0
  const eligible = match.players.filter((p) => Number(p.ratings?.overall ?? 0) > 0);
  if (!eligible.length) return null;
  return eligible.sort(
    (a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0)
  )[0];
}

// Безопасный рендер строки счёта/процента с fallback на «—»
function fmtNumOrDash(v, suffix = '') {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${v}${suffix}`;
}

function topByMetric(players, getter, n = 3) {
  return [...players]
    .map((p) => ({ player: p, value: num(getter(p)) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .filter((r) => r.value > 0);
}

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const { selectedTeamId } = useTeam();
  const { user } = useAuth();
  const canDelete = user?.role === 'head_coach' || user?.role === 'team_coach';
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMatch(matchId);
      toast.success('Отчёт удалён');
      navigate('/matches', { replace: true });
    } catch (e) {
      setDeleting(false);
      setConfirmingDelete(false);
      toast.error(e?.message || 'Не удалось удалить отчёт');
    }
  }
  const matchRes = useApi(() => fetchMatch(matchId), [matchId]);
  const playersRes = useApi(() => fetchPlayers(selectedTeamId), [selectedTeamId]);

  const match = matchRes.data;
  const players = playersRes.data?.players || [];

  const matchTitle = match
    ? `${match.home || ''} ${match.scoreHome ?? ''}:${match.scoreAway ?? ''} ${match.away || ''}`.trim()
    : 'Матч';
  useDocumentTitle(matchTitle);
  const home = match?.teamSummaryStats?.home || {};
  const away = match?.teamSummaryStats?.away || {};
  const ta = match?.teamAggregates || {};
  const motm = bestPlayer(match);
  const teamRatings = match?.teamAvgRatings || {};

  const attackingActions = useMemo(() => {
    const pos = ta.attacks?.positional?.withShot || 0;
    const cnt = ta.attacks?.counterattacks?.withShot || 0;
    return pos + cnt;
  }, [ta]);

  const insights = useMemo(() => matchInsights(match), [match]);

  // Командная динамика по таймам — суммируем сплиты игроков (1/2 тайм).
  const teamHalf = useMemo(() => {
    const TEAM_HALF = [
      ['Shot', 'Удары'], ['Pass', 'Передачи'], ['Dribble', 'Обводки'], ['Cross', 'Кроссы'],
      ['Tackle', 'Отборы'], ['Interception', 'Перехваты'], ['Recovery', 'Возвраты'],
      ['Duel', 'Единоборства'], ['Pressing', 'Прессинг'],
    ];
    const ps = match?.players || [];
    return TEAM_HALF.map(([k, label]) => {
      let f = 0, s = 0, any = false;
      for (const p of ps) {
        const r = p.splits?.[k];
        if (r) { f += Number(r.first) || 0; s += Number(r.second) || 0; any = true; }
      }
      return any ? { label, first: f, second: s } : null;
    }).filter((r) => r && r.first + r.second > 0);
  }, [match]);

  // Физическая нагрузка: интенсивный бег по зонам скорости (сортировка по сумме HSR).
  const intensity = useMemo(() => {
    const f = (p, k) => num(p.stats?.fitness?.[k]) || 0;
    const list = (match?.players || [])
      .filter((p) => (p.minutes ?? 0) > 0)
      .map((p) => {
        const z1 = f(p, 'speed_4_5_5'), z2 = f(p, 'speed_5_5_7'), z3 = f(p, 'speed_7plus');
        return { p, z1, z2, z3, hsr: z1 + z2 + z3 };
      })
      .filter((r) => r.hsr > 0)
      .sort((a, b) => b.hsr - a.hsr);
    return { list, max: Math.max(1, ...list.map((r) => r.hsr)) };
  }, [match]);

  // Хроника матча показывается ТОЛЬКО если голы в событиях сходятся с финальным
  // счётом — иначе парсер поймал не всё (для победы 4:0 один гол вводит в
  // заблуждение). И привязываем гол к команде по фамилии нашего состава.
  const timeline = useMemo(() => {
    const evs = match?.events || [];
    if (!evs.length) return [];
    const goalTypes = new Set(['goal', 'penalty', 'own_goal']);
    const goalsInEvents = evs.filter((e) => goalTypes.has(e.type)).length;
    const totalGoals = (match.score?.home || 0) + (match.score?.away || 0);
    if (!totalGoals || goalsInEvents !== totalGoals) return []; // неполная/недостоверная — скрываем
    const ourLast = (match.players || [])
      .map((p) => (p.lastName || String(p.fullName || '').split(' ').slice(-1)[0] || '').toLowerCase())
      .filter(Boolean);
    return evs.map((e) => {
      if (!goalTypes.has(e.type)) return e;
      const who = String(e.player || '').toLowerCase();
      const scoredByUs = ourLast.some((ln) => ln.length > 2 && who.includes(ln));
      // автогол идёт в пользу соперника, поэтому сторона инвертируется
      const side = e.type === 'own_goal' ? (scoredByUs ? 'opp' : 'our') : (scoredByUs ? 'our' : 'opp');
      return { ...e, side };
    });
  }, [match]);

  // CSV-экспорт метрик матча по игрокам (для тренерского совета).
  function handleExport() {
    if (!match) return;
    const cols = [
      { label: 'Игрок', get: (p) => shortNameFromPlayer(p) },
      { label: '№', get: (p) => p.number ?? '' },
      { label: 'Позиция', get: (p) => p.positionFull || p.position || '' },
      { label: 'Минуты', get: (p) => p.minutes ?? '' },
      { label: 'Общий', get: (p) => p.ratings?.overall ?? '' },
      { label: 'Атака', get: (p) => p.ratings?.attack ?? '' },
      { label: 'Защита', get: (p) => p.ratings?.defence ?? '' },
      { label: 'Фитнес', get: (p) => p.ratings?.fitness ?? '' },
      { label: 'Голы', get: (p) => num(p.stats?.attack4?.goal) ?? '' },
      { label: 'Ассисты', get: (p) => num(p.stats?.attack1?.assist) ?? '' },
      { label: 'Удары', get: (p) => num(p.stats?.attack4?.shot) ?? '' },
      { label: 'Отборы', get: (p) => num(p.stats?.defence1?.tackle) ?? '' },
      { label: 'Дистанция, м', get: (p) => num(p.stats?.fitness?.totalDistance) ?? '' },
    ];
    downloadCsv(`match-${(trimAgeStr(match.away) || matchId).slice(0, 24)}`, match.players || [], cols);
  }

  const topGoals = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.attack4?.goal), [match]);
  const topAssists = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.attack1?.assist), [match]);
  const topTackles = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.defence1?.tackle), [match]);

  // Накопленный сезонный средний — догружаем все матчи для сравнения с текущим
  const matchesListRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const seasonMatches = matchesListRes.data?.matches || [];
  const seasonIdsKey = useMemo(() => seasonMatches.map((m) => m.id).join('|'), [seasonMatches]);
  const [allMatchData, setAllMatchData] = useState([]);

  useEffect(() => {
    if (!seasonMatches.length) { setAllMatchData([]); return; }
    let cancelled = false;
    // Defer на 1.5 сек — даём первой отрисовке (счёт/формация/командные ratings)
    // завершиться без блокировки сеть N параллельными fetch'ами. Без этого
    // браузер на /matches/:id «висел» 13+ сек пока грузил все матчи сезона
    // для блока «vs средний по сезону» — а его юзер видит только при скролле.
    const handle = setTimeout(() => {
      Promise.all(seasonMatches.map((m) => fetchMatch(m.id).catch(() => null)))
        .then((results) => {
          if (cancelled) return;
          setAllMatchData(results.filter(Boolean));
        });
    }, 1500);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonIdsKey]);

  const seasonAvg = useMemo(() => {
    if (!allMatchData.length) return null;
    const acc = { overall: [], fitness: [], attack: [], defence: [] };
    allMatchData.forEach((m) => {
      const t = m?.teamAvgRatings || {};
      Object.keys(acc).forEach((k) => {
        const v = num(t[k]);
        if (v != null && !isNaN(v)) acc[k].push(v);
      });
    });
    const out = {};
    Object.entries(acc).forEach(([k, arr]) => {
      out[k] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    });
    out._games = allMatchData.length;
    return out;
  }, [allMatchData]);

  if (matchRes.error) return <div className="empty-state">Ошибка: {matchRes.error.message}</div>;
  if (!match) return (
    <div className="page match-detail" role="status" aria-busy="true">
      <div className="md-skel md-skel--bar" />
      <div className="md-skel md-skel--hero" />
      <div className="md-skel md-skel--ratings" />
      <div className="md-skel md-skel--card" />
      <div className="md-skel md-skel--card" />
      <span className="md-sr-only">Загрузка разбора матча…</span>
    </div>
  );

  return (
    <div className="page match-detail">
      <div className="match-detail__topbar">
        <button className="match-detail__back" onClick={() => navigate('/matches')}>← К матчам</button>
        {match.dataQuality && <DataQualityBadge dq={match.dataQuality} />}
        <div className="match-detail__tools">
          <button className="md-tool-btn" onClick={handleExport} title="Скачать метрики матча в CSV">⤓ CSV</button>
          <button className="md-tool-btn" onClick={() => window.print()} title="Печать / сохранить в PDF">🖨 PDF</button>
          {canDelete && !confirmingDelete && (
            <button className="md-tool-btn md-tool-btn--danger" onClick={() => setConfirmingDelete(true)} title="Удалить загруженный отчёт">
              🗑 Удалить
            </button>
          )}
          {canDelete && confirmingDelete && (
            <span className="md-confirm" role="group" aria-label="Подтвердите удаление">
              <span className="md-confirm__q">Удалить отчёт?</span>
              <button className="md-tool-btn md-tool-btn--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Удаление…' : 'Да, удалить'}
              </button>
              <button className="md-tool-btn" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Отмена</button>
            </span>
          )}
        </div>
      </div>

      {/* HERO: счёт и команды */}
      <div className="match-detail__hero">
        <div className="match-detail__team match-detail__team--home">
          <img
            src={shieldFor(match.homeTeam?.name, match.homeTeam?.shield)}
            alt={match.homeTeam?.name || ''}
            className="match-detail__team-logo-img"
            onError={(e) => {
              e.currentTarget.outerHTML = `<div class="match-detail__team-logo team-logo--home">${(match.homeTeam?.name || '?').charAt(0)}</div>`;
            }}
          />
          <div className="match-detail__team-name">{trimAgeStr(match.homeTeam?.name)}</div>
        </div>
        <div className="match-detail__score-block">
          <div className="match-detail__date">{fmtDate(match.date)}</div>
          <div className="match-detail__score">
            {match.score?.home}:{match.score?.away}
          </div>
          <div className="match-detail__status">МАТЧ РАЗОБРАН</div>
        </div>
        <div className="match-detail__team match-detail__team--away">
          {(() => {
            const src = shieldFor(match.awayTeam?.name, match.awayTeam?.shield);
            return src ? (
              <img
                src={src}
                alt={match.awayTeam?.name || ''}
                className="match-detail__team-logo-img"
                onError={(e) => {
                  // Fallback на инициал клуба если щит не загрузился
                  e.currentTarget.outerHTML = `<div class="match-detail__team-logo team-logo--away">${(match.awayTeam?.name || '?').charAt(0)}</div>`;
                }}
              />
            ) : (
              <div className="match-detail__team-logo team-logo--away">
                {(match.awayTeam?.name || '?').charAt(0)}
              </div>
            );
          })()}
          <div className="match-detail__team-name">{trimAgeStr(match.awayTeam?.name)}</div>
        </div>
      </div>

      {/* Внутристраничная навигация по разделам разбора */}
      <nav className="md-secnav" aria-label="Разделы разбора">
        {[
          ['md-ratings', 'Рейтинги'],
          ['md-roles', 'Состав и роли'],
          ['md-insights', 'Выводы'],
          ['md-half', 'По таймам'],
          ['md-fitness', 'Физика'],
          ['md-heatmap', 'Хитмап'],
          ['md-detail', 'Детали'],
          ['md-maps', 'Карты'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="md-secnav__link">{label}</a>
        ))}
      </nav>

      {/* 4 рейтинга команды */}
      <div className="match-detail__ratings" id="md-ratings">
        <RatingCard label="Общий" value={teamRatings.overall} />
        <RatingCard label="Фитнес" value={teamRatings.fitness} />
        <RatingCard label="Атака" value={teamRatings.attack} />
        <RatingCard label="Защита" value={teamRatings.defence} />
      </div>

      {/* Beeswarm рейтингов состава (StatsBomb-style) */}
      {(match.players || []).filter((p) => (p.minutes ?? 0) > 0 && (p.ratings?.overall ?? 0) > 0).length >= 3 && (
        <div className="card md-anchor" id="md-roles">
          <div className="page-section-title">Рейтинги состава — распределение</div>
          <RatingBeeswarm players={match.players} />
          <div className="md-insights__note" style={{ marginTop: 8 }}>Точка — игрок; цвет по оценке, пунктир — средний по команде. Наведи для имени.</div>
        </div>
      )}

      {/* Роли игроков: атака vs оборона (StatsBomb-style scatter) */}
      {(match.players || []).filter((p) => (p.minutes ?? 0) > 0 && ((p.ratings?.attack || 0) > 0 || (p.ratings?.defence || 0) > 0)).length >= 3 && (
        <div className="card">
          <div className="page-section-title">Роли — атака vs оборона</div>
          <TwoWayScatter players={match.players} />
          <div className="md-insights__note" style={{ marginTop: 8 }}>X — рейтинг атаки, Y — обороны. Правый-верхний квадрант — двусторонние игроки.</div>
        </div>
      )}

      {/* Авто-инсайты по матчу (Phase 5) */}
      {insights.length > 0 && (
        <div className="card match-detail__insights md-anchor" id="md-insights">
          <div className="page-section-title">Ключевые выводы</div>
          <ul className="md-insights">
            {insights.map((it, i) => (
              <li key={i} className={`md-insight md-insight--${it.tone}`}>
                <span className="md-insight__mark" aria-hidden="true">
                  {it.tone === 'positive' ? '▲' : it.tone === 'negative' ? '▼' : '•'}
                </span>
                {it.text}
              </li>
            ))}
          </ul>
          <div className="md-insights__note">Автоматически по данным матча — не заменяет разбор тренера.</div>
        </div>
      )}

      {/* Хроника матча — только если голы сходятся со счётом (см. timeline) */}
      <MatchTimeline events={timeline} />

      {/* Командная динамика по таймам (Phase: by-half) */}
      {teamHalf.length > 0 && (
        <div className="card md-anchor" id="md-half">
          <div className="page-section-title">Динамика по таймам — команда</div>
          <HalfSplitChart rows={teamHalf} hint="Как команда распределила действия между таймами. ▲/▼ — изменение во 2-м тайме." />
        </div>
      )}

      {/* Физическая нагрузка: интенсивный бег по зонам скорости */}
      {intensity.list.length > 0 && (
        <div className="card md-anchor" id="md-fitness">
          <div className="page-section-title">Физическая нагрузка — интенсивный бег</div>
          <div className="md-intensity">
            {intensity.list.map((r) => (
              <SpeedZones key={r.p.id} compact label={shortNameFromPlayer(r.p)} z1={r.z1} z2={r.z2} z3={r.z3} scaleMax={intensity.max} />
            ))}
          </div>
          <div className="sz__legend" style={{ marginTop: 10 }}>
            <span><i className="sz__sw sz__sw--1" />4–5.5 м/с</span>
            <span><i className="sz__sw sz__sw--2" />5.5–7 м/с</span>
            <span><i className="sz__sw sz__sw--3" />7+ м/с (спринт)</span>
          </div>
        </div>
      )}

      {/* Хитмап состава — игрок × метрика (StatsBomb data-table) */}
      {(match.players || []).filter((p) => (p.minutes ?? 0) > 0).length >= 3 && (
        <div className="card md-anchor" id="md-heatmap">
          <div className="page-section-title">Хитмап состава</div>
          <SquadHeatmap players={match.players} />
          <div className="md-insights__note" style={{ marginTop: 8 }}>Заливка ячейки — относительно лучшего в столбце. Рейтинг — по цветовой шкале оценки.</div>
        </div>
      )}

      <div className="match-detail__grid md-anchor" id="md-detail">
        <div className="match-detail__left">
          <FormationField
            formation={match.formation}
            /* Передаём match.players (с adapter'ом и photoUrl) вместо team-wide,
               чтобы PlayerPhoto в pitch получил реальные YFL-фото */
            players={(match.players || []).length ? match.players : players}
            ourTeamName={trimAgeStr(match.homeTeam?.name)}
            imageSrc={match.formationImage}
            imageFullSrc={match.formationImageFull}
          />
          <div className="card guest-placeholder">
            <div className="page-section-title">Состав соперника</div>
            <div className="guest-placeholder__msg">
              {match.guestTeamPlaceholder ||
                'SportVisor разбор содержит per-player статистику только нашей команды. Состав соперника появится, когда соперник загрузит свой отчёт.'}
            </div>
          </div>
        </div>

        <div className="match-detail__center">
          <div className="card">
            <div className="page-section-title">Командная статистика</div>
            <div className="match-detail__stats">
              <StatCompareBar label="Владение"          home={fmtNumOrDash(home.possessionPct, '%')} away={fmtNumOrDash(away.possessionPct, '%')} />
              <StatCompareBar label="Удары"             home={fmtNumOrDash(home.shots?.total)}       away={fmtNumOrDash(away.shots?.total)} />
              <StatCompareBar label="Удары в створ"     home={fmtNumOrDash(home.shots?.onTarget)}    away={fmtNumOrDash(away.shots?.onTarget)} />
              <StatCompareBar label="xG"                home={fmtNumOrDash(home.expectedGoals)}      away={fmtNumOrDash(away.expectedGoals)} />
              <StatCompareBar label="Передачи"          home={fmtNumOrDash(home.passes?.total)}      away={fmtNumOrDash(away.passes?.total)} />
              <StatCompareBar label="Точные передачи"   home={fmtNumOrDash(home.passes?.successful)} away={fmtNumOrDash(away.passes?.successful)} />
              <StatCompareBar label="Удары со штрафных" home={fmtNumOrDash(home.freeKickShots)}      away={fmtNumOrDash(away.freeKickShots)} />
              <StatCompareBar label="Угловые"           home={fmtNumOrDash(home.corners?.total)}     away={fmtNumOrDash(away.corners?.total)} />
              <StatCompareBar label="Нарушения"         home={fmtNumOrDash(home.fouls)}              away={fmtNumOrDash(away.fouls)} />
              <StatCompareBar label="Жёлтые карточки"   home={fmtNumOrDash(home.yellowCards)}        away={fmtNumOrDash(away.yellowCards)} />
              <StatCompareBar label="Красные карточки"  home={fmtNumOrDash(home.redCards)}           away={fmtNumOrDash(away.redCards)} />
              <StatCompareBar label="Офсайды"           home={fmtNumOrDash(home.offsides)}           away={fmtNumOrDash(away.offsides)} />
            </div>
          </div>

          <div className="card">
            <div className="page-section-title">Лидеры матча — наша команда</div>
            <div className="match-detail__breakdowns">
              <PlayerBreakdown title="Голы" rows={topGoals} navigate={navigate} />
              <PlayerBreakdown title="Ассисты" rows={topAssists} navigate={navigate} />
              <PlayerBreakdown title="Отборы" rows={topTackles} navigate={navigate} />
            </div>
          </div>

          {/* Donuts: рендерим только метрики с реальным значением > 0 у нас */}
          {(() => {
            const cards = [
              { label: 'Удары в створ',         home: home.shots?.onTarget,        away: away.shots?.onTarget },
              { label: 'Прогрессивные передачи', home: ta.passes?.progressive,      away: null },
              { label: 'Отборы',                home: ta.duels?.totalDuels ?? ta.recoveriesAndTackling?.tackle, away: null },
              { label: 'Перехваты',             home: ta.positioning?.interceptions ?? ta.recoveriesAndTackling?.interception, away: null },
              { label: 'Атаки с ударом',        home: attackingActions,             away: null },
              { label: 'Кроссы',                home: ta.passes?.crosses,           away: null },
            ].filter((c) => {
              const v = num(c.home);
              return v != null && Number(v) > 0;
            });
            if (cards.length === 0) return null;
            return (
              <div className="match-detail__donuts">
                {cards.map((c) => (
                  <DonutComparisonCard key={c.label} label={c.label} home={c.home} away={c.away} />
                ))}
              </div>
            );
          })()}
        </div>

        <div className="match-detail__right">
          {motm && motm.ratings?.overall != null && (
            <div className="card best-player" onClick={() => navigate(`/players/${motm.id}`)}>
              <div className="page-section-title">Игрок матча</div>
              <div className="best-player__body">
                <PlayerPhoto player={motm} size={80} />
                <div className="best-player__info">
                  <div className="best-player__name">{shortNameFromPlayer(motm)}</div>
                  <div className="best-player__pos">№{motm.number} · {motm.positionFull}</div>
                </div>
                <RatingPill value={motm.ratings?.overall} size="xl" />
              </div>
            </div>
          )}
          {seasonAvg && Number(seasonAvg._games || 0) > 1 && (
            <div className="card mvs">
              <div className="page-section-title">
                Этот матч vs средний по сезону
                <span className="mvs__hint"> · по {seasonAvg._games} матчам</span>
              </div>
              <div className="mvs__list">
                {[
                  ['Общий', 'overall'],
                  ['Фитнес', 'fitness'],
                  ['Атака', 'attack'],
                  ['Защита', 'defence'],
                ].map(([label, key]) => {
                  const m = num(teamRatings[key]);
                  const s = seasonAvg[key];
                  if (m == null || s == null) return null;
                  const d = m - s;
                  const dir = d > 0.1 ? 'up' : d < -0.1 ? 'down' : 'flat';
                  const arrow = d > 0.1 ? '▲' : d < -0.1 ? '▼' : '=';
                  return (
                    <div className="mvs-row" key={key}>
                      <div className="mvs-row__label">{label}</div>
                      <div className="mvs-row__pair">
                        <span className="mvs-row__cap">матч</span>
                        <span className="mvs-row__val mvs-row__val--match">{m.toFixed(1)}</span>
                      </div>
                      <div className="mvs-row__pair">
                        <span className="mvs-row__cap">сезон</span>
                        <span className="mvs-row__val mvs-row__val--season">{s.toFixed(1)}</span>
                      </div>
                      <div className={`mvs-row__delta mvs-row__delta--${dir}`}>
                        <span className="mvs-row__delta-arrow">{arrow}</span>
                        <span>{d > 0 ? '+' : ''}{d.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Заметка тренера к разбору (Phase 3) — только тренеры */}
      {canDelete && <CoachNoteCard key={matchId} matchId={matchId} initial={match.coachNote} />}

      {/* Командные карты — рендерим всю секцию только если хотя бы 1 карта есть */}
      {SECTION_MAPS.some((sec) => ta[sec.id]?.mapImage) && (
      <div className="card match-detail__maps-card md-anchor" id="md-maps">
        <div className="page-section-title">Командные тепловые карты</div>
        <div className="match-detail__maps-grid">
          {SECTION_MAPS.map((sec) => {
            const map = ta[sec.id]?.mapImage;
            if (!map) return null;
            return (
              <div className="match-detail__map-cell" key={sec.id}>
                <SoccerFieldImageMap src={map} title={sec.title} height={220} />
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

function CoachNoteCard({ matchId, initial }) {
  const [note, setNote] = useState(initial || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await updateMatchNote(matchId, note);
      setSaved(true);
      toast.success('Заметка сохранена');
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast.error(e?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="card match-detail__note">
      <div className="page-section-title">Заметка тренера</div>
      <textarea
        className="md-note__area"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Выводы по матчу, что отработать на тренировке, на кого обратить внимание…"
        aria-label="Заметка тренера к матчу"
      />
      <div className="md-note__actions">
        <button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
        {saved && <span className="md-note__saved">✓ сохранено</span>}
      </div>
    </div>
  );
}

function PlayerBreakdown({ title, rows, navigate }) {
  return (
    <div className="player-breakdown">
      <div className="player-breakdown__title">{title}</div>
      {rows.length === 0 && <div className="empty-state">Нет данных</div>}
      {rows.map(({ player, value }, i) => (
        <div
          key={player.id}
          className="player-breakdown__row"
          onClick={() => navigate(`/players/${player.id}`)}
        >
          <span className="player-breakdown__rank">{i + 1}</span>
          <PlayerPhoto player={player} size={36} />
          <div className="player-breakdown__info">
            <div className="player-breakdown__name">{shortNameFromPlayer(player)}</div>
            <div className="player-breakdown__pos">№{player.number} · {player.position}</div>
          </div>
          <span className="player-breakdown__val">{value}</span>
        </div>
      ))}
    </div>
  );
}

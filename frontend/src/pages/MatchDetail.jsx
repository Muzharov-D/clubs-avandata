import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useReveal, useCountUp } from '../hooks/useReveal';
import './matchKinetic.css';
import { fetchMatch, fetchPlayers, fetchMatches, deleteMatch, updateMatchNote } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import FormationField from '../components/FormationField';
import MatchTimeline from '../components/MatchTimeline';
import StatCompareBar from '../components/StatCompareBar';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import RatingCard from '../components/RatingCard';
import SoccerFieldImageMap from '../components/SoccerFieldImageMap';
import HalfSplitChart from '../components/HalfSplitChart';
import RatingBeeswarm from '../components/RatingBeeswarm';
import SpeedZones from '../components/SpeedZones';
import SquadHeatmap from '../components/SquadHeatmap';
import TwoWayScatter from '../components/TwoWayScatter';
import { shieldFor } from '../utils/legirus';
import { shortNameFromPlayer } from '../utils/players';
import { matchInsights } from '../utils/insights';
import XgPanel from '../components/analytics/XgPanel';
import PressingCard from '../components/analytics/PressingCard';
import MomentumStrip from '../components/analytics/MomentumStrip';
import ImpactMotm from '../components/analytics/ImpactMotm';
import MatchLeaders from '../components/analytics/MatchLeaders';
import SetPieceShotCard from '../components/analytics/SetPieceShotCard';
import { coachDigest, matchMinutes } from '../utils/analytics';
import { teamXg, ourSideKey, expectedPoints } from '../utils/analytics/xg';
import { Reveal } from '../components/motion';
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

// Единая обрезка возрастной группы — см. utils/teamName.
import { trimAgeSuffix as trimAgeStr } from '../utils/teamName';

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

  // Kinetic-эталон: scroll-reveal секций + count-up счёта.
  const pageRef = useRef(null);
  useReveal(pageRef, [match?.id, players.length]);
  const homeScore = useCountUp(match?.score?.home ?? 0, 850);
  const awayScore = useCountUp(match?.score?.away ?? 0, 850);

  const matchTitle = match
    ? `${match.home || ''} ${match.scoreHome ?? ''}:${match.scoreAway ?? ''} ${match.away || ''}`.trim()
    : 'Матч';
  useDocumentTitle(matchTitle);
  const home = match?.teamSummaryStats?.home || {};
  const away = match?.teamSummaryStats?.away || {};
  const ta = match?.teamAggregates || {};
  const motm = bestPlayer(match);
  const teamRatings = match?.teamAvgRatings || {};

  // insights считаем после seasonAvg (объявлен ниже) — пересчёт при его готовности.

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

  // Аналитические выводы: учитываем сезонный средний (для «vs обычного») и
  // короткие имена. Пересчитываются, когда дозагрузился сезонный контекст.
  const insights = useMemo(
    () => matchInsights(match, { seasonAvg, nameOf: shortNameFromPlayer }),
    [match, seasonAvg],
  );

  // Объединяем rule-based выводы с модельным дайджестом (xG/PPDA/реализация/
  // momentum/угроза) — дедуп по тексту, топ-9 (улучшения 28/46/77/99).
  const allInsights = useMemo(() => {
    const model = coachDigest(match, { nameOf: shortNameFromPlayer });
    const seen = new Set();
    const merged = [];
    for (const it of [...insights, ...model]) {
      if (!it?.text || seen.has(it.text)) continue;
      seen.add(it.text);
      merged.push(it);
    }
    return merged.slice(0, 9);
  }, [insights, match]);

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

  // Ориентация: какая сторона — наша (для подсветки кинетик-имени и счёта).
  const homeIsUs = match.homeTeam?.isOurTeam ?? !match.awayTeam?.isOurTeam;
  const usScore = homeIsUs ? (match.score?.home ?? 0) : (match.score?.away ?? 0);
  const themScore = homeIsUs ? (match.score?.away ?? 0) : (match.score?.home ?? 0);

  // Нарративная строка вердикта: первый рядовой инсайт (rule-based / модельный),
  // словесный вывод вместо сырых чисел (контракт UI). Fallback по счёту.
  const verdictText = allInsights[0]?.text
    || (usScore > themScore ? 'Победа в матче'
      : usScore < themScore ? 'Поражение в матче'
      : 'Ничейный результат');

  // xPTS обеих сторон для полосы под счётом — из существующих xg-хелперов.
  const { our: ourSide, opp: oppSide } = ourSideKey(match);
  const xgUs = teamXg(match, ourSide);
  const xgThem = teamXg(match, oppSide);
  const hasXpts = xgUs != null && xgThem != null;
  const xptsUs = hasXpts ? expectedPoints(xgUs, xgThem) : null;
  const xptsThem = hasXpts ? expectedPoints(xgThem, xgUs) : null;
  // Доля нашей команды в шкале «наша vs соперник» (центр полосы = равно).
  const xptsTotal = hasXpts ? (xptsUs + xptsThem) : 0;
  const usSharePct = hasXpts && xptsTotal > 0 ? Math.round((xptsUs / xptsTotal) * 100) : 50;

  return (
    <div className="page match-detail kinetic" ref={pageRef}>
      <div className="match-detail__topbar">
        <button className="match-detail__back" onClick={() => navigate('/matches')}>← К матчам</button>
        {/* Бейдж «Достоверность» убран — внутренняя метрика, клиенту не показываем.
            data_quality по-прежнему считается и хранится на бэкенде (admin/диагностика). */}
        <div className="match-detail__tools">
          {/* Экспорт CSV/PDF убран намеренно: платформа — единственный источник
              просмотра данных. Управление загрузкой (удаление) — остаётся. */}
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

      {/* HERO — «Вердикт матча»: full-bleed, доминирующий count-up счёт по центру,
          эмблемы в верхних углах, нарратив-вердикт + xPTS-полоса с отдельным
          входом (Reveal). Один герой-момент на экран. */}
      {(() => {
        const Badge = ({ side, team }) => {
          const src = shieldFor(team?.name, team?.shield);
          const initial = (team?.name || '?').charAt(0);
          return (
            <div className={`kin-verdict__badge-${side}`} title={trimAgeStr(team?.name)}>
              {src
                ? <img src={src} alt={team?.name || ''} className="kin-verdict__badge-img"
                    onError={(e) => { e.currentTarget.outerHTML = initial; }} />
                : initial}
            </div>
          );
        };
        return (
          <div className="kin-hero-verdict kin-verdict reveal is-in">
            <Badge side="home" team={match.homeTeam} />
            <Badge side="away" team={match.awayTeam} />
            <div className="kin-verdict__date">{fmtDate(match.date)}</div>

            <div className="kin-verdict__score-container">
              <div className="kin-verdict__score">
                <span className={`kin-verdict__score-num${usScore > themScore && homeIsUs ? ' kin-verdict__score--win' : ''}`}>{homeScore}</span>
                <span className="kin-verdict__score-sep">:</span>
                <span className={`kin-verdict__score-num${usScore > themScore && !homeIsUs ? ' kin-verdict__score--win' : ''}`}>{awayScore}</span>
              </div>

              <div className="kin-verdict__narrative">{verdictText}</div>

              {hasXpts && (
                <Reveal variant="clip" duration={0.6} delay={1.2} className="kin-verdict__xpts-wrap">
                  <div className="kin-verdict__xpts-bar">
                    <span className="kin-verdict__xpts-pill kin-verdict__xpts-pill--us" style={{ left: `${usSharePct}%` }} />
                  </div>
                  <div className="kin-verdict__xpts-legend">
                    ожидаемые очки: {xptsUs.toFixed(1)} — {xptsThem.toFixed(1)}
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        );
      })()}

      {/* Внутристраничная навигация по разделам разбора */}
      <nav className="md-secnav" aria-label="Разделы разбора">
        {[
          ['md-ratings', 'Рейтинги'],
          ['md-roles', 'Состав и роли'],
          ['md-xg', 'xG'],
          ['md-press', 'Прессинг'],
          ['md-insights', 'Выводы'],
          ['md-momentum', 'Динамика'],
          ['md-half', 'По таймам'],
          ['md-fitness', 'Фитнес'],
          ['md-heatmap', 'Тепловая карта'],
          ['md-detail', 'Детали'],
          // 'md-maps' (Командные карты) временно скрыт — пока выводим только
          // тепловую карту игрока (на странице игрока). Командные карты добавим
          // позже, когда определимся, какие из них показывать.
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

      {/* Два аналитических распределения рядом: beeswarm (распределение оценок)
          + scatter (роли). Раньше шли стопкой во всю ширину, график занимал
          только левую половину → правая пустовала. Теперь 2 колонки. */}
      <div className="match-detail__charts md-anchor reveal" id="md-roles">
        {(match.players || []).filter((p) => (p.minutes ?? 0) > 0 && (p.ratings?.overall ?? 0) > 0).length >= 3 && (
          <div className="card">
            <div className="page-section-title">Рейтинги состава — распределение</div>
            <RatingBeeswarm players={match.players} />
            <div className="md-insights__note" style={{ marginTop: 8 }}>Точка — игрок; цвет по оценке, пунктир — средний по команде. Наведи для имени.</div>
          </div>
        )}

        {(match.players || []).filter((p) => (p.minutes ?? 0) > 0 && ((p.ratings?.attack || 0) > 0 || (p.ratings?.defence || 0) > 0)).length >= 3 && (
          <div className="card">
            <div className="page-section-title">Роли — атака vs оборона</div>
            <TwoWayScatter players={match.players} />
            <div className="md-insights__note" style={{ marginTop: 8 }}>X — рейтинг атаки, Y — обороны. Правый-верхний квадрант — двусторонние игроки.</div>
          </div>
        )}
      </div>

      {/* xG-панель: командный xG + контекст, вероятность исхода, xPTS, заслуженный счёт */}
      <div className="reveal" id="md-xg"><XgPanel match={match} /></div>

      {/* Прессинг и PPDA */}
      <div className="reveal" id="md-press"><PressingCard match={match} /></div>

      {/* Стандарты, качество ударов, переходная угроза */}
      <div className="reveal"><SetPieceShotCard match={match} /></div>

      {/* Авто-инсайты по матчу (rule-based + модельный дайджест) */}
      {allInsights.length > 0 && (
        <div className="card match-detail__insights md-anchor reveal" id="md-insights">
          <div className="page-section-title">Ключевые выводы</div>
          <ul className="md-insights">
            {allInsights.map((it, i) => (
              <li key={i} className={`md-insight md-insight--${it.tone}`}>
                <span className="md-insight__icon" aria-hidden="true">{it.icon || '•'}</span>
                <span className="md-insight__text">{it.text}</span>
              </li>
            ))}
          </ul>
          <div className="md-insights__note">Автоматически по данным матча — не заменяет разбор тренера.</div>
        </div>
      )}

      {/* Хроника матча — только если голы сходятся со счётом (см. timeline) */}
      <MatchTimeline events={timeline} />

      {/* Momentum по таймам + xG-гонка */}
      <div className="reveal" id="md-momentum"><MomentumStrip match={match} /></div>

      {/* Командная динамика по таймам (Phase: by-half) */}
      {teamHalf.length > 0 && (
        <div className="card md-anchor reveal" id="md-half">
          <div className="page-section-title">Динамика по таймам — команда</div>
          <HalfSplitChart rows={teamHalf} hint="Как команда распределила действия между таймами. ▲/▼ — изменение во 2-м тайме." />
        </div>
      )}

      {/* Физическая нагрузка: интенсивный бег по зонам скорости */}
      {intensity.list.length > 0 && (
        <div className="card md-anchor reveal" id="md-fitness">
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
        <div className="card md-anchor reveal" id="md-heatmap">
          <div className="page-section-title">Тепловая карта состава</div>
          <SquadHeatmap players={match.players} />
          <div className="md-insights__note" style={{ marginTop: 8 }}>Заливка ячейки — относительно лучшего в столбце. Рейтинг — по цветовой шкале оценки.</div>
        </div>
      )}

      {/* Поле-формация — full-width, над 3-колоночной сеткой. Без оборачивания
          в .card: чистый контейнер во всю ширину разбора. */}
      <div className="match-detail__field-full reveal">
        <FormationField
          formation={match.formation}
          /* Передаём match.players (с adapter'ом и photoUrl) вместо team-wide,
             чтобы PlayerPhoto в pitch получил реальные YFL-фото */
          players={(match.players || []).length ? match.players : players}
          ourTeamName={trimAgeStr(match.homeTeam?.name)}
          imageSrc={match.formationImage}
          imageFullSrc={match.formationImageFull}
        />
      </div>

      <div className="match-detail__grid md-anchor reveal" id="md-detail">
        <div className="match-detail__left">
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

          {/* Расширенные лидеры: угроза/прогрессия/дуэли/прессинг/бег + на 90′ */}
          <MatchLeaders players={match.players} navigate={navigate} nameOf={shortNameFromPlayer} basis={matchMinutes(Number((match.teamId || '').match(/(?:19|20)\d{2}/)?.[0]))} />

          {/* Командный выхлоп vs сезон: метрика этого матча против СРЕДНЕГО по
              сезону (вместо бесполезных «N из N» бубликов без соперника). */}
          {(() => {
            const defs = [
              { label: 'Удары в створ',          get: (m) => num(m?.teamSummaryStats?.home?.shots?.onTarget) },
              { label: 'Прогрессивные передачи', get: (m) => num(m?.teamAggregates?.passes?.progressive) },
              { label: 'Отборы',                 get: (m) => num(m?.teamAggregates?.duels?.totalDuels ?? m?.teamAggregates?.recoveriesAndTackling?.tackle) },
              { label: 'Перехваты',              get: (m) => num(m?.teamAggregates?.positioning?.interceptions ?? m?.teamAggregates?.recoveriesAndTackling?.interception) },
              { label: 'Атаки с ударом',         get: (m) => { const t = m?.teamAggregates || {}; return (t.attacks?.positional?.withShot || 0) + (t.attacks?.counterattacks?.withShot || 0); } },
              { label: 'Кроссы',                 get: (m) => num(m?.teamAggregates?.passes?.crosses) },
            ];
            const rows = defs.map((d) => {
              const cur = d.get(match);
              if (!(cur > 0)) return null;
              const vals = allMatchData.map(d.get).filter((v) => v > 0);
              const avg = vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              return { label: d.label, cur, avg };
            }).filter(Boolean);
            if (!rows.length) return null;
            return (
              <div className="card">
                <div className="page-section-title">Командный выхлоп</div>
                <div className="md-output">
                  {rows.map((r) => {
                    const pct = r.avg ? Math.round(((r.cur - r.avg) / r.avg) * 100) : null;
                    const dir = pct == null ? 'flat' : pct >= 8 ? 'up' : pct <= -8 ? 'down' : 'flat';
                    return (
                      <div className="md-out" key={r.label}>
                        <div className="md-out__label">{r.label}</div>
                        <div className="md-out__val">{r.cur}</div>
                        {r.avg != null ? (
                          <div className={`md-out__cmp md-out__cmp--${dir}`}>
                            {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='} {pct > 0 ? '+' : ''}{pct}% · ср {r.avg.toFixed(0)}
                          </div>
                        ) : (
                          <div className="md-out__cmp md-out__cmp--muted">за матч</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {rows.some((r) => r.avg != null) && (
                  <div className="md-insights__note" style={{ marginTop: 10 }}>Сравнение со средним по сезону ({allMatchData.length} матчей). ▲/▼ — отклонение от обычного.</div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="match-detail__right">
          {/* Игрок матча по модели вклада (рейтинг + голы/ассисты/угроза/реализация) */}
          <ImpactMotm match={match} navigate={navigate} nameOf={shortNameFromPlayer} />
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

      {/* Командные тепловые карты — ВРЕМЕННО СКРЫТЫ. Пока выводим только тепловую
          карту игрока (на странице игрока). Парсер их по-прежнему извлекает и
          хранит (meta.teamMaps → ta[sec].mapImage), так что для возврата секции
          достаточно раскомментировать блок ниже — перезаливка не нужна.
          Решим позже, какие именно карты показывать. */}
      {false && SECTION_MAPS.some((sec) => ta[sec.id]?.mapImage) && (
      <div className="card match-detail__maps-card md-anchor reveal" id="md-maps">
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

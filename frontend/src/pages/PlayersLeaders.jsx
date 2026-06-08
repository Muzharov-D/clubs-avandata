import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchPlayersSeason } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import LeaderMetricCard from '../components/LeaderMetricCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { AnimatedNumber, SplitText, Reveal, StaggerList, KineticCard } from '../components/motion';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { shortNameFromPlayer, numberWithPos } from '../utils/players';
import './PlayersLeaders.css';
import './playersKinetic.css';
import './PlayersRating.css';

// Метрики «лидеров по сумме за сезон». Все поля — реальные суммы из агрегата
// /players/season (см. backend data/routes.ts). Порядок: атака → оборона →
// объём → доступность. До 15 метрик (тренер просил расширить с 10).
// ВАЖНО: key каждой метрики уникален (он же React-key карточки и id модалки).
const METRIC_DEFS = [
  // ── Атака ──
  { key: 'goals',   label: 'Голы',              get: (p) => p.goals },
  { key: 'gi',      label: 'Голевые действия',  get: (p) => (Number(p.goals) || 0) + (Number(p.assists) || 0) },
  { key: 'assists', label: 'Голевые передачи',  get: (p) => p.assists },
  { key: 'shots',   label: 'Удары',             get: (p) => p.shots },
  { key: 'keyPass', label: 'Ключевые передачи', get: (p) => p.keyPass },
  { key: 'dribble', label: 'Обводки',           get: (p) => p.dribble },
  // ── Оборона ──
  { key: 'tackle',       label: 'Отборы',       get: (p) => p.tackle },
  { key: 'interception', label: 'Перехваты',    get: (p) => p.interception },
  { key: 'recovery',     label: 'Возвраты',     get: (p) => p.recovery },
  { key: 'duel',         label: 'Единоборства', get: (p) => p.duel },
  { key: 'pressing',     label: 'Прессинг',     get: (p) => p.pressing },
  // ── Объём (физика — ПЛАТНОЕ: free-набор не содержит физических метрик) ──
  { key: 'distance',       label: 'Дистанция',        get: (p) => p.distance,       suffix: ' м', paid: true },
  { key: 'sprintDistance', label: 'Спринт-дистанция', get: (p) => p.sprintDistance, suffix: ' м', paid: true },
  // ── Доступность ──
  { key: 'minutes', label: 'Игровые минуты',  get: (p) => p.minutes, suffix: ' мин' },
  { key: 'matches', label: 'Сыгранные матчи', get: (p) => p.matches },
];

function fmtVal(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return (Number.isInteger(n) ? n.toLocaleString('ru-RU') : n.toFixed(1)) + suffix;
}

function Subnav() {
  return (
    <div className="players-rating__subnav">
      <NavLink to="/players" end className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Лидеры</NavLink>
      <NavLink to="/players/rating" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Рейтинг</NavLink>
      <NavLink to="/players/compare" className={({ isActive }) => 'players-subnav__item' + (isActive ? ' active' : '')}>Сравнение</NavLink>
    </div>
  );
}

export default function PlayersLeaders() {
  useDocumentTitle('Лидеры сезона');
  const navigate = useNavigate();
  const { canSeePlayer, tenant } = useAuth();
  const { selectedTeamId } = useTeam();
  const [openKey, setOpenKey] = useState(null);
  // На free платные метрики (физика) не показываем — единый гейт по tenant.plan.
  const isPaid = tenant?.plan === 'paid';

  // СЕЗОН, не последний матч: кто лучший по сумме за сезон (был источником
  // «последний матч» — нонсенс для «лидеров команды»).
  const seasonRes = useApi(
    () => (selectedTeamId ? fetchPlayersSeason(selectedTeamId) : Promise.resolve({ players: [] })),
    [selectedTeamId],
  );
  const all = seasonRes.data?.players || [];

  const overall = useMemo(() => {
    const rated = all.filter((p) => Number(p.avgOverall ?? 0) > 0 && Number(p.matches ?? 0) >= 1);
    return [...rated].sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0))[0] || null;
  }, [all]);

  // Для каждой метрики — топ-5 команды по СУММЕ (только положительные значения).
  // Метрики без ни одного игрока с показателем > 0 не показываем (нет данных).
  const leaders = useMemo(() => (
    METRIC_DEFS
      .filter((m) => isPaid || !m.paid)
      .map((m) => {
        const top = all
          .map((p) => ({ player: p, value: Number(m.get(p)) || 0 }))
          .filter((x) => x.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);
        return { ...m, top };
      })
      .filter((m) => m.top.length > 0)
  ), [all, isPaid]);

  const openMetric = openKey ? (leaders.find((m) => m.key === openKey) || null) : null;

  // Esc закрывает модалку топ-5.
  useEffect(() => {
    if (!openKey) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpenKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openKey]);

  if (seasonRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!all.length) {
    return (
      <div className="page players-leaders kinetic">
        <Subnav />
        <div className="empty-state">Сезонная статистика появится после разбора матчей.</div>
      </div>
    );
  }

  return (
    <div className="page players-leaders kinetic">
      <Subnav />

      <div className="players-leaders__scope" style={{ color: 'var(--text-faint)', fontSize: 13, margin: '4px 2px 14px' }}>
        Лидеры по сумме за сезон · нажмите метрику — раскроется топ-5
      </div>

      {overall && (() => {
        const unlocked = canSeePlayer(overall.id);
        return (
          <Reveal variant="fade" duration={0.5} className="players-leaders__top-reveal">
            <KineticCard
              glow
              onClick={unlocked ? () => navigate(`/players/${overall.id}`) : undefined}
              ariaLabel={unlocked ? `Открыть профиль: ${overall.fullName || ''}` : 'Доступно только тренеру'}
              className={'card players-leaders__top players-leaders__top--kinetic' + (unlocked ? '' : ' players-leaders__top--locked')}
            >
              <div className="players-leaders__top-label">Лучший по среднему рейтингу сезона</div>
              <div className="players-leaders__top-body">
                <PlayerPhoto player={overall} size={140} className="players-leaders__top-photo" />
                <div className="players-leaders__top-info">
                  <div className="players-leaders__top-name"><SplitText text={shortNameFromPlayer(overall) || overall.fullName || ''} /></div>
                  <div className="players-leaders__top-pos">{numberWithPos(overall.number, overall.position)}</div>
                  <div className="players-leaders__top-stats">
                    <span>Матчи: <b>{overall.matches ?? '—'}</b></span>
                    <span>Голы: <b>{overall.goals ?? 0}</b></span>
                    <span>Пасы: <b>{overall.assists ?? 0}</b></span>
                  </div>
                </div>
                <div className="players-leaders__top-rating">
                  <RatingPill value={overall.avgOverall} size="xl" />
                  <div className="players-leaders__top-rating-100">
                    {overall.avgOverall ? (<><AnimatedNumber value={Math.round(overall.avgOverall * 10)} stiffness={180} />/100</>) : '—'}
                  </div>
                </div>
              </div>
            </KineticCard>
          </Reveal>
        );
      })()}

      <StaggerList className="players-leaders__grid" speed="loose">
        {leaders.map((m) => (
          <LeaderMetricCard
            key={m.key}
            label={m.label}
            player={m.top[0]?.player}
            value={m.top[0] ? fmtVal(m.top[0].value, m.suffix) : null}
            onSelect={() => setOpenKey(m.key)}
          />
        ))}
      </StaggerList>

      {openMetric && (
        <LeadersTop5
          metric={openMetric}
          canSeePlayer={canSeePlayer}
          onClose={() => setOpenKey(null)}
          onPick={(id) => { setOpenKey(null); navigate(`/players/${id}`); }}
        />
      )}
    </div>
  );
}

// Модалка «Топ-5 по метрике»: список игроков с переходом в профиль (клик/Enter).
// Заблокированных (родитель/игрок) показываем, но без перехода.
function LeadersTop5({ metric, canSeePlayer, onClose, onPick }) {
  const closeRef = useRef(null);
  // Переводим фокус в диалог при открытии — иначе клавиатурный фокус остаётся на
  // карточке-триггере и до содержимого модалки не добраться (aria-modal сам фокус
  // не двигает). Esc-закрытие — на уровне страницы (родительский useEffect).
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="lt5-overlay" onClick={onClose}>
      <div
        className="lt5-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Топ-5 по метрике «${metric.label}»`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lt5-head">
          <div className="lt5-head__title">Топ-5 · {metric.label}</div>
          <button ref={closeRef} type="button" className="lt5-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="lt5-list">
          {metric.top.map((row, i) => {
            const p = row.player;
            const unlocked = canSeePlayer(p.id);
            return (
              <div
                key={p.id}
                className={'lt5-row' + (unlocked ? '' : ' lt5-row--locked')}
                role={unlocked ? 'button' : undefined}
                tabIndex={unlocked ? 0 : undefined}
                onClick={() => { if (unlocked) onPick(p.id); }}
                onKeyDown={(e) => { if (unlocked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(p.id); } }}
                title={unlocked ? `Профиль: ${shortNameFromPlayer(p)}` : 'Доступно только тренеру'}
              >
                <div className="lt5-row__rank">{i + 1}</div>
                <PlayerPhoto player={p} size={40} />
                <div className="lt5-row__info">
                  <div className="lt5-row__name">{shortNameFromPlayer(p)}</div>
                  <div className="lt5-row__pos">{numberWithPos(p.number, p.positionFull || p.position)}</div>
                </div>
                <div className="lt5-row__value">{fmtVal(row.value, metric.suffix)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

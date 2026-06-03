import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchPlayersSeason } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTeam } from '../contexts/TeamContext';
import { downloadCsv } from '../utils/exportCsv';
import { playerLabel } from '../utils/players';
import { AnimatedNumber, SplitText } from '../components/motion';
import './LoadControl.css';
import './playersKinetic.css';

// Молодёжный матч ≈ 2×40 = 80 минут. Порог «много» — стабильно почти весь матч.
const FULL_MATCH = 80;

// Всплывашка по риску травмы у игрока с высокой нагрузкой. Текст опирается на
// спортивную науку по молодёжному футболу (а не на «общие слова»):
//  • в подростковом возрасте травматизм выше, чем у взрослых и младших — высокая
//    нагрузка накладывается на бурный рост; пик потерь — U14–U15
//    (~26 пропущенных дней на игрока за сезон) [J Sport Health Sci, 2021];
//  • ~78% травм приходится на нижние конечности, и почти половина из них
//    (нетравматические) предотвратима ротацией и восстановлением [там же];
//  • резкий рост нагрузки относительно привычного уровня (высокий acute:chronic)
//    повышает риск нетравматических повреждений до ~2 раз [Br J Sports Med, 2017];
//  • период пубертатного скачка (circa-PHV) — критическое окно: дозируют минуты
//    по биологическому возрасту, а не по паспортному [интегративный обзор, 2025].
function InjuryRiskFlag({ open, onToggle }) {
  return (
    <span className="lc-flag lc-flag--high lc-flag--risk">
      <button type="button" className={`lc-flag__btn${open ? ' is-open' : ''}`} onClick={onToggle}
        aria-expanded={open} aria-label="Подробнее о риске перегруза">
        ⚠ Высокая
      </button>
    </span>
  );
}

// Развёрнутая панель риска — полноширинная строка под игроком (не всплывашка,
// чтобы не обрезалась overflow таблицы).
function InjuryRiskPanel({ player }) {
  const name = (player.lastName || player.fullName || 'Игрок').toString().split(' ')[0];
  return (
    <div className="load-control__risk-row">
      <div className="lc-risk">
        <div className="lc-risk__title">Риск перегруза — следите за восстановлением</div>
        <p className="lc-risk__text">
          {name} проводит почти весь матч в нескольких играх подряд. У подростков
          травматизм выше, чем у взрослых: высокая нагрузка накладывается на бурный
          рост, а пик повреждений приходится на возраст 13–15 лет. Около 78% травм —
          нижние конечности, и почти половина из них предотвратима грамотной ротацией
          и восстановлением.
        </p>
        <p className="lc-risk__text">
          Главный фактор риска — <b>резкий скачок нагрузки</b> относительно привычного
          уровня: он повышает риск нетравматических повреждений почти вдвое. Наращивайте
          минуты постепенно, чередуйте интенсивные и восстановительные недели и особенно
          бережно дозируйте нагрузку в период активного роста.
        </p>
        <div className="lc-risk__src">По данным спортивной науки о молодёжном футболе (Br J Sports Med, 2017; J Sport Health Sci, 2021).</div>
      </div>
    </div>
  );
}

function loadLevel(p) {
  if ((p.matches || 0) < 3) return 'low';
  if ((p.minutesPerMatch || 0) >= FULL_MATCH - 5) return 'high';
  if ((p.minutesPerMatch || 0) >= 55) return 'medium';
  return 'low';
}

// Карточка сводной метрики нагрузки с пружинным count-up (broadcast-дашборд).
function LoadStat({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1, color: color || 'var(--accent-cyan)' }}>
        <AnimatedNumber value={value} format={(v) => Math.round(v).toLocaleString('ru-RU')} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

export default function LoadControl() {
  useDocumentTitle('Контроль нагрузки');
  const { selectedTeamId } = useTeam();
  const [openRiskId, setOpenRiskId] = useState(null);
  const seasonRes = useApi(() => (selectedTeamId ? fetchPlayersSeason(selectedTeamId) : Promise.resolve(null)), [selectedTeamId]);

  const players = useMemo(() => {
    const list = seasonRes.data?.players || [];
    return [...list].sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
  }, [seasonRes.data]);

  const maxMin = useMemo(() => Math.max(1, ...players.map((p) => p.minutes || 0)), [players]);
  const maxDist = useMemo(() => Math.max(1, ...players.map((p) => p.distance || 0)), [players]);
  const totalDistKm = useMemo(() => players.reduce((s, p) => s + (p.distance || 0), 0) / 1000, [players]);
  const avgMpm = useMemo(() => {
    const v = players.filter((p) => p.minutesPerMatch);
    return v.length ? v.reduce((s, p) => s + (p.minutesPerMatch || 0), 0) / v.length : 0;
  }, [players]);

  const handleExport = () => {
    downloadCsv('load-control', players, [
      { label: 'Игрок', get: (p) => playerLabel(p) },
      { label: '№', key: 'number' },
      { label: 'Позиция', key: 'position' },
      { label: 'Матчей', key: 'matches' },
      { label: 'Минут всего', key: 'minutes' },
      { label: 'Минут/матч', key: 'minutesPerMatch' },
      { label: 'Дистанция, м', key: 'distance' },
      { label: 'Спринт, м', key: 'sprintDistance' },
    ]);
  };

  if (seasonRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!players.length) return <div className="empty-state">Нет загруженных разборов для расчёта нагрузки</div>;

  const overloaded = players.filter((p) => loadLevel(p) === 'high').length;

  return (
    <div className="page load-control kinetic">
      <div className="load-control__head">
        <div>
          <h1 className="load-control__title"><SplitText text="Контроль нагрузки" /></h1>
          <div className="load-control__sub">
            По сезонным разборам · управление ротацией и восстановлением в академии
          </div>
        </div>
        <button className="load-control__export" onClick={handleExport} title="Скачать CSV">⤓ CSV</button>
      </div>

      {/* Сводная панель сезонной нагрузки — живые числа (broadcast-дашборд) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
        <LoadStat label="Игроков" value={players.length} />
        <LoadStat label="Высокая нагрузка" value={overloaded} color="var(--danger)" />
        <LoadStat label="Дистанция команды, км" value={totalDistKm} />
        <LoadStat label="Средние минуты/матч" value={avgMpm} />
      </div>

      <div className="card load-control__table">
        <div className="load-control__row load-control__row--head">
          <span className="lc-name">Игрок</span>
          <span className="lc-num">Матчи</span>
          <span className="lc-bar">Минуты (всего / за матч)</span>
          <span className="lc-bar">Дистанция</span>
          <span className="lc-flag">Нагрузка</span>
        </div>
        {players.map((p) => {
          const lvl = loadLevel(p);
          const riskOpen = lvl === 'high' && openRiskId === p.id;
          return (
            <div className="load-control__rowwrap" key={p.id}>
              <div className="load-control__row">
                <span className="lc-name">
                  <span className="lc-name__main">{playerLabel(p)}</span>
                  <span className="lc-name__sub">№{p.number ?? '—'} · {p.position || '—'}</span>
                </span>
                <span className="lc-num">{p.matches}</span>
                <span className="lc-bar">
                  <span className="lc-bar__track">
                    <span className="lc-bar__fill" style={{ width: `${((p.minutes || 0) / maxMin) * 100}%` }} />
                  </span>
                  <span className="lc-bar__val">{p.minutes} мин · {p.minutesPerMatch}/матч</span>
                </span>
                <span className="lc-bar">
                  <span className="lc-bar__track">
                    <span className="lc-bar__fill lc-bar__fill--dist" style={{ width: `${((p.distance || 0) / maxDist) * 100}%` }} />
                  </span>
                  <span className="lc-bar__val">{(p.distance / 1000).toFixed(1)} км · спринт {(p.sprintDistance / 1000).toFixed(1)} км</span>
                </span>
                {lvl === 'high' ? (
                  <InjuryRiskFlag
                    open={riskOpen}
                    onToggle={() => setOpenRiskId((cur) => (cur === p.id ? null : p.id))}
                  />
                ) : (
                  <span className={`lc-flag lc-flag--${lvl}`}>
                    {lvl === 'medium' ? 'Средняя' : 'Низкая'}
                  </span>
                )}
              </div>
              {riskOpen && <InjuryRiskPanel player={p} />}
            </div>
          );
        })}
      </div>
      <div className="load-control__legend">
        ⚠ «Высокая» — игрок проводит почти весь матч в ≥3 играх подряд. Нажмите на флаг, чтобы
        увидеть, почему это риск для подростка, и что с этим делать (опирается на спортивную
        науку о молодёжном футболе: пик травматизма в 13–15 лет, опасность резких скачков нагрузки).
      </div>
    </div>
  );
}

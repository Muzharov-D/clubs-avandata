import { useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchPlayersSeason } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTeam } from '../contexts/TeamContext';
import { downloadCsv } from '../utils/exportCsv';
import './LoadControl.css';

// Молодёжный матч ≈ 2×40 = 80 минут. Порог «много» — стабильно почти весь матч.
const FULL_MATCH = 80;

function loadLevel(p) {
  if ((p.matches || 0) < 3) return 'low';
  if ((p.minutesPerMatch || 0) >= FULL_MATCH - 5) return 'high';
  if ((p.minutesPerMatch || 0) >= 55) return 'medium';
  return 'low';
}

export default function LoadControl() {
  useDocumentTitle('Контроль нагрузки');
  const { selectedTeamId } = useTeam();
  const seasonRes = useApi(() => (selectedTeamId ? fetchPlayersSeason(selectedTeamId) : Promise.resolve(null)), [selectedTeamId]);

  const players = useMemo(() => {
    const list = seasonRes.data?.players || [];
    return [...list].sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
  }, [seasonRes.data]);

  const maxMin = useMemo(() => Math.max(1, ...players.map((p) => p.minutes || 0)), [players]);
  const maxDist = useMemo(() => Math.max(1, ...players.map((p) => p.distance || 0)), [players]);

  const handleExport = () => {
    downloadCsv('load-control', players, [
      { label: 'Игрок', key: 'fullName' },
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
    <div className="page load-control">
      <div className="load-control__head">
        <div>
          <h1 className="load-control__title">Контроль нагрузки</h1>
          <div className="load-control__sub">
            По сезонным разборам · {players.length} игроков · высокая нагрузка у {overloaded}
          </div>
        </div>
        <button className="load-control__export" onClick={handleExport} title="Скачать CSV">⤓ CSV</button>
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
          return (
            <div className="load-control__row" key={p.id}>
              <span className="lc-name">
                <span className="lc-name__main">{p.fullName}</span>
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
              <span className={`lc-flag lc-flag--${lvl}`}>
                {lvl === 'high' ? '⚠ Высокая' : lvl === 'medium' ? 'Средняя' : 'Низкая'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="load-control__legend">
        ⚠ «Высокая» — игрок проводит почти весь матч в ≥3 играх подряд. Повод следить за ротацией и восстановлением (защита от перегруза в академии).
      </div>
    </div>
  );
}

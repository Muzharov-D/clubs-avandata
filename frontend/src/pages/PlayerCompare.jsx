import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchPlayersSeason, fetchPlayerTrend } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTeam } from '../contexts/TeamContext';
import { Sparkline } from '../components/Sparkline';
import { playerLabel } from '../utils/players';
import { seasonPercentiles } from '../utils/playerRoles';
import ComparePizza from '../components/analytics/ComparePizza';
import '../components/analytics/ComparePizza.css';
import './PlayerCompare.css';
import './playersKinetic.css';

// Метрики для наложения пицц — перцентиль в команде. КЛЮЧ совпадает с движком
// ролей; перцентиль берём из ЕДИНОГО seasonPercentiles (тот же пул/порог/
// сглаживание, что у профиля), чтобы Дютиль не был «удары 97» тут и «96» там.
const PIZZA_METRICS = [
  { key: 'gi',           label: 'Гол+пас' },
  { key: 'shots',        label: 'Удары' },
  { key: 'keyPass',      label: 'Ключевые' },
  { key: 'dribble',      label: 'Обводки' },
  { key: 'tackle',       label: 'Отборы' },
  { key: 'interception', label: 'Перехваты' },
  { key: 'duel',         label: 'Единоборства' },
  { key: 'pressing',     label: 'Прессинг' },
  { key: 'distance',     label: 'Дистанция' },
];

// Метрики сравнения: рейтинги (0–10) + сезонные суммы действий.
const ROWS = [
  { key: 'avgOverall', label: 'Общий рейтинг', rating: true },
  { key: 'avgAttack', label: 'Атака', rating: true },
  { key: 'avgDefence', label: 'Защита', rating: true },
  { key: 'avgFitness', label: 'Фитнес', rating: true },
  { key: 'matches', label: 'Матчей' },
  { key: 'minutes', label: 'Минут всего' },
  { key: 'goals', label: 'Голы' },
  { key: 'assists', label: 'Голевые передачи' },
  { key: 'shots', label: 'Удары' },
  { key: 'keyPass', label: 'Ключевые пасы' },
  { key: 'dribble', label: 'Обводки' },
  { key: 'tackle', label: 'Отборы' },
  { key: 'interception', label: 'Перехваты' },
  { key: 'duel', label: 'Единоборства' },
  { key: 'pressing', label: 'Прессинг' },
  { key: 'distance', label: 'Дистанция, м' },
];

function CompareBar({ a, b }) {
  const total = (Number(a) || 0) + (Number(b) || 0);
  const aPct = total > 0 ? (a / total) * 100 : 50;
  return (
    <div className="cmp-bar" role="img" aria-label={`слева ${a}, справа ${b}`}>
      <div className="cmp-bar__a" style={{ width: `${aPct}%` }} />
      <div className="cmp-bar__b" style={{ width: `${100 - aPct}%` }} />
    </div>
  );
}

export default function PlayerCompare() {
  useDocumentTitle('Сравнение игроков');
  const { selectedTeamId } = useTeam();
  const seasonRes = useApi(() => (selectedTeamId ? fetchPlayersSeason(selectedTeamId) : Promise.resolve(null)), [selectedTeamId]);
  const players = useMemo(() => {
    const list = seasonRes.data?.players || [];
    return [...list].sort((x, y) => (y.avgOverall || 0) - (x.avgOverall || 0));
  }, [seasonRes.data]);

  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  useEffect(() => {
    if (players.length >= 2 && !aId && !bId) {
      setAId(players[0].id);
      setBId(players[1].id);
    }
  }, [players, aId, bId]);

  const a = players.find((p) => p.id === aId) || null;
  const b = players.find((p) => p.id === bId) || null;

  const [mode, setMode] = useState('bars'); // 'bars' | 'pizza'

  // Перцентильные слайсы для наложения пицц: А и B на одних осях vs команда.
  const pizzaSlices = useMemo(() => {
    if (!a || !b) return [];
    // Единый источник перцентиля (как профиль/ДНК): пул без вратарей, порог 45,
    // conf-сглаживание. Перцентиль scale-инвариантен к basis, поэтому совпадает
    // с профилем независимо от длины матча.
    const spA = seasonPercentiles(a, players);
    const spB = seasonPercentiles(b, players);
    if (!spA || !spB) return [];
    return PIZZA_METRICS.map((m) => {
      const ra = spA.byKey[m.key];
      const rb = spB.byKey[m.key];
      if (!ra && !rb) return null;
      // Линия команды ≈ медиана = 50-й перцентиль (midrank).
      return { axis: m.label, a: ra?.pct ?? 0, b: rb?.pct ?? 0, t: 50 };
    }).filter(Boolean);
  }, [a, b, players]);

  const trendA = useApi(() => (aId ? fetchPlayerTrend(aId) : Promise.resolve(null)), [aId]);
  const trendB = useApi(() => (bId ? fetchPlayerTrend(bId) : Promise.resolve(null)), [bId]);
  const serA = (trendA.data?.series || []).map((s) => s.overall).filter((v) => v > 0);
  const serB = (trendB.data?.series || []).map((s) => s.overall).filter((v) => v > 0);

  if (seasonRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (players.length < 2) return <div className="empty-state">Нужно минимум 2 игрока с разборами для сравнения</div>;

  // Рейтинги — 1 знак (точка). Остальное — целые с группировкой разрядов
  // (33443 → «33 443»), чтобы дистанция не выглядела сырой.
  const fmt = (r) => (v) => (v == null ? '—' : r.rating ? Number(v).toFixed(1) : Math.round(v).toLocaleString('ru-RU'));

  return (
    <div className="page player-compare kinetic">
      <h1 className="player-compare__title">Сравнение игроков</h1>

      <div className="card player-compare__pickers">
        <label className="pc-picker">
          <span>Игрок A</span>
          <select value={aId} onChange={(e) => setAId(e.target.value)}>
            {players.map((p) => <option key={p.id} value={p.id}>{playerLabel(p)}</option>)}
          </select>
        </label>
        <div className="pc-vs">—</div>
        <label className="pc-picker">
          <span>Игрок B</span>
          <select value={bId} onChange={(e) => setBId(e.target.value)}>
            {players.map((p) => <option key={p.id} value={p.id}>{playerLabel(p)}</option>)}
          </select>
        </label>
      </div>

      {a && b && (
        <div className="player-compare__modeswitch" role="tablist" aria-label="Режим сравнения">
          <button
            type="button" role="tab" aria-selected={mode === 'bars'}
            className={`pc-mode${mode === 'bars' ? ' is-active' : ''}`}
            onClick={() => setMode('bars')}
          >Показатели</button>
          <button
            type="button" role="tab" aria-selected={mode === 'pizza'}
            className={`pc-mode${mode === 'pizza' ? ' is-active' : ''}`}
            onClick={() => setMode('pizza')}
            disabled={pizzaSlices.length < 3}
            title={pizzaSlices.length < 3 ? 'Недостаточно данных для профиля' : ''}
          >Профили</button>
        </div>
      )}

      {a && b && mode === 'pizza' && pizzaSlices.length >= 3 && (
        <div className="card player-compare__pizza">
          <div className="page-section-title">Наложение профилей</div>
          <ComparePizza slices={pizzaSlices} nameA={playerLabel(a)} nameB={playerLabel(b)} />
        </div>
      )}

      {a && b && mode === 'bars' && (
        <>
          <div className="card player-compare__trend">
            <div className="pc-trend__col">
              <div className="pc-trend__name">{playerLabel(a)}</div>
              {serA.length ? <Sparkline values={serA} width={160} height={40} color="var(--brand-primary)" /> : <span className="pc-trend__none">нет тренда</span>}
              <div className="pc-trend__cap">тренд общего рейтинга по матчам</div>
            </div>
            <div className="pc-trend__col">
              <div className="pc-trend__name">{playerLabel(b)}</div>
              {serB.length ? <Sparkline values={serB} width={160} height={40} color="var(--rating-good)" /> : <span className="pc-trend__none">нет тренда</span>}
              <div className="pc-trend__cap">тренд общего рейтинга по матчам</div>
            </div>
          </div>

          <div className="card player-compare__rows">
            {ROWS.map((r) => {
              const av = a[r.key];
              const bv = b[r.key];
              const f = fmt(r);
              const aWin = (Number(av) || 0) > (Number(bv) || 0);
              const bWin = (Number(bv) || 0) > (Number(av) || 0);
              return (
                <div className="pc-row" key={r.key}>
                  <span className={`pc-row__a${aWin ? ' pc-row__win' : ''}`}>{f(av)}</span>
                  <span className="pc-row__mid">
                    <span className="pc-row__label">{r.label}</span>
                    <CompareBar a={Number(av) || 0} b={Number(bv) || 0} />
                  </span>
                  <span className={`pc-row__b${bWin ? ' pc-row__win' : ''}`}>{f(bv)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

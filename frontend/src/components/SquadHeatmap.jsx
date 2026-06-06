import { useMemo } from 'react';
import { ratingColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import { useTableSort, sortArrow } from '../hooks/useTableSort';
import './SquadHeatmap.css';

/**
 * Хитмап состава (data-table с условным форматированием, в духе StatsBomb):
 * строки — игроки, столбцы — ключевые метрики, заливка ячейки по значению
 * относительно максимума в столбце. Мгновенный обзор: кто в чём силён.
 */
function val(v) {
  if (v == null) return 0;
  if (typeof v === 'object') return Number(v.successful ?? v.value ?? v.total ?? 0) || 0;
  return Number(v) || 0;
}

const COLS = [
  { key: 'ov', label: 'Рейт', rating: true, get: (p) => Number(p.ratings?.overall) || 0, fmt: (v) => (v ? v.toFixed(1) : '—') },
  { key: 'goal', label: 'Голы', get: (p) => val(p.stats?.attack4?.goal) },
  { key: 'shot', label: 'Удары', get: (p) => val(p.stats?.attack4?.shot) },
  { key: 'kp', label: 'Кл.пасы', get: (p) => val(p.stats?.attack1?.keyPass) },
  { key: 'pass', label: 'Пасы', get: (p) => val(p.stats?.attack2?.pass) },
  { key: 'drb', label: 'Обводки', get: (p) => val(p.stats?.attack4?.dribble) },
  { key: 'tkl', label: 'Отборы', get: (p) => val(p.stats?.defence1?.tackle) },
  { key: 'int', label: 'Перехв', get: (p) => val(p.stats?.defence1?.interception) },
  { key: 'duel', label: 'Едино', get: (p) => val(p.stats?.defence2?.duel) },
  { key: 'dist', label: 'Дист,км', get: (p) => val(p.stats?.fitness?.totalDistance) / 1000, fmt: (v) => (v ? v.toFixed(1) : '—') },
];

export default function SquadHeatmap({ players }) {
  const base = useMemo(
    () => (players || []).filter((p) => (p.minutes ?? 0) > 0),
    [players],
  );

  // Сортировка по клику на заголовок столбца (по умолчанию — рейтинг ↓).
  const accessors = useMemo(() => {
    const acc = { name: (p) => shortNameFromPlayer(p) };
    COLS.forEach((c) => { acc[c.key] = c.get; });
    return acc;
  }, []);
  const { sorted: ps, sortKey, sortDir, requestSort } = useTableSort(base, {
    initialKey: 'ov', initialDir: 'desc', accessors,
  });

  if (ps.length < 3) return null;

  const max = {};
  COLS.forEach((c) => { max[c.key] = Math.max(0, ...ps.map(c.get)); });

  const cols = `minmax(120px,1.4fr) ${COLS.map(() => 'minmax(44px,1fr)').join(' ')}`;

  return (
    <div className="shm-wrap">
      <div className="shm" style={{ gridTemplateColumns: cols }}>
        <button
          type="button"
          className={`shm__cell shm__cell--head shm__cell--name shm__cell--sortable${sortKey === 'name' ? ' is-active' : ''}`}
          onClick={() => requestSort('name', 'asc')}
          title="Сортировать по имени"
        >
          Игрок <span className="shm__sort">{sortArrow(sortKey === 'name', sortDir)}</span>
        </button>
        {COLS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`shm__cell shm__cell--head shm__cell--sortable${sortKey === c.key ? ' is-active' : ''}`}
            onClick={() => requestSort(c.key, 'desc')}
            title={`Сортировать по «${c.label}»`}
          >
            {c.label} <span className="shm__sort">{sortArrow(sortKey === c.key, sortDir)}</span>
          </button>
        ))}

        {ps.map((p) => (
          <Row key={p.id} p={p} max={max} />
        ))}
      </div>
    </div>
  );
}

function Row({ p, max }) {
  return (
    <>
      <div className="shm__cell shm__cell--name" title={shortNameFromPlayer(p)}>
        <span className="shm__num">{p.number ?? '—'}</span>{shortNameFromPlayer(p)}
      </div>
      {COLS.map((c) => {
        const v = c.get(p);
        const fmt = c.fmt ? c.fmt(v) : (v || '');
        let style;
        if (c.rating) {
          style = v > 0 ? { background: ratingColor(v), color: '#0f1115', fontWeight: 800 } : undefined;
        } else {
          const r = max[c.key] > 0 ? v / max[c.key] : 0;
          style = v > 0 ? { background: `rgba(34,211,238,${(0.1 + 0.55 * r).toFixed(2)})` } : undefined;
        }
        return <div key={c.key} className="shm__cell shm__cell--val" style={style}>{fmt}</div>;
      })}
    </>
  );
}

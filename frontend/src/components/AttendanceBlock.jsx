// Блок «Посещаемость» для страницы игрока.
// Подгружает GET /api/trainings/team/:teamId/player/:playerId/stats — статистика за период.
// По умолчанию — за последние 90 дней.

import { useEffect, useState } from 'react';
import { fetchPlayerAttendanceStats } from '../services/api';
import './AttendanceBlock.css';

const PERIODS = [
  { id: '30d',  label: 'месяц',   days: 30 },
  { id: '90d',  label: '3 месяца', days: 90 },
  { id: 'all',  label: 'сезон',   days: null },
];

export default function AttendanceBlock({ teamId, playerId }) {
  const [period, setPeriod] = useState('90d');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!teamId || !playerId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const cur = PERIODS.find((p) => p.id === period);
    const params = {};
    if (cur?.days) {
      const from = new Date(Date.now() - cur.days * 24 * 3600 * 1000);
      params.from = from.toISOString();
    }
    fetchPlayerAttendanceStats(teamId, playerId, params)
      .then((r) => { if (!cancelled) setStats(r.stats || null); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamId, playerId, period]);

  if (!teamId || !playerId) return null;
  if (loading) return null; // не мерцать spinner'ом на странице
  if (err) return null;
  if (!stats || stats.total === 0) return null; // блок появляется только когда есть данные

  const pct = stats.attendedPct;
  const pctColor = pct == null ? '#94a3c8' :
                   pct >= 80 ? '#22c55e' :
                   pct >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <section className="att-block">
      <div className="att-block__head">
        <h3>Посещаемость тренировок</h3>
        <div className="att-block__periods">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              className={`att-block__period ${period === p.id ? 'is-active' : ''}`}
              onClick={() => setPeriod(p.id)}
            >{p.label}</button>
          ))}
        </div>
      </div>
      <div className="att-block__main">
        <div className="att-block__pct" style={{ color: pctColor }}>
          {pct != null ? pct + '%' : '—'}
        </div>
        <div className="att-block__counts">
          <div className="att-block__total">из {stats.total} {stats.total === 1 ? 'тренировки' : 'тренировок'}</div>
          <div className="att-block__breakdown">
            <span className="att-block__pill att-block__pill--present">был {stats.present}</span>
            {stats.late > 0 && <span className="att-block__pill att-block__pill--late">опозд. {stats.late}</span>}
            {stats.excused > 0 && <span className="att-block__pill att-block__pill--excused">уваж. {stats.excused}</span>}
            {stats.absent > 0 && <span className="att-block__pill att-block__pill--absent">пропустил {stats.absent}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

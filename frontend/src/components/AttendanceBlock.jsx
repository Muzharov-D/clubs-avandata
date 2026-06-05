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

  // Бэк (GET .../stats) отдаёт totalPast/present/late/absent; COUNT приходит
  // строками (pg) — коэрсим в числа. attendedPct считаем на клиенте: «был» +
  // «опоздал» = посетил (пришёл, пусть и позже). `excused` бэк не отдаёт.
  const total = Number(stats?.totalPast) || 0;
  if (!stats || total === 0) return null; // блок появляется только когда есть данные

  const present = Number(stats.present) || 0;
  const late = Number(stats.late) || 0;
  const absent = Number(stats.absent) || 0;
  const marked = present + late + absent;
  const pct = total > 0 ? Math.round(((present + late) / total) * 100) : null;
  const pctColor = pct == null ? 'var(--text-muted)' :
                   pct >= 80 ? 'var(--success)' :
                   pct >= 60 ? 'var(--warning)' : 'var(--danger)';

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
      {marked === 0 ? (
        // Тренировки были, но отметок по игроку нет: 0% здесь врал бы («прогулял
        // всё»), хотя данных просто нет. Показываем честный нейтральный статус.
        <div className="att-block__empty">
          Посещаемость не отмечена · {total} {total === 1 ? 'тренировка' : 'тренировок'} за период
        </div>
      ) : (
        <div className="att-block__main">
          <div className="att-block__pct" style={{ color: pctColor }}>
            {pct != null ? pct + '%' : '—'}
          </div>
          <div className="att-block__counts">
            <div className="att-block__total">из {total} {total === 1 ? 'тренировки' : 'тренировок'}</div>
            <div className="att-block__breakdown">
              {present > 0 && <span className="att-block__pill att-block__pill--present">был {present}</span>}
              {late > 0 && <span className="att-block__pill att-block__pill--late">опозд. {late}</span>}
              {absent > 0 && <span className="att-block__pill att-block__pill--absent">пропустил {absent}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

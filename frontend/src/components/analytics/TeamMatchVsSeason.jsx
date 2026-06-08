import { buildTeamVsSeasonRows } from '../../utils/teamMatchMetrics';
import { matchesWord } from '../../utils/num';
import './TeamMatchVsSeason.css';

/**
 * Командные показатели матча против среднего по сезону. Самодостаточный (свои
 * классы tmvs-*, свой CSS) — работает на любом экране (разбор матча и сезонная
 * сводка последнего матча). Метрики и расчёт — из utils/teamMatchMetrics.
 *
 * @param {Object} match — матч (с teamAggregates).
 * @param {Array} allMatches — все разобранные матчи сезона (детально).
 * @param {string} [title] — заголовок секции.
 */
export default function TeamMatchVsSeason({ match, allMatches, title = 'Командные показатели: матч против сезона' }) {
  const rows = buildTeamVsSeasonRows(match, allMatches);
  if (!rows.length) return null;
  const seasonCount = Array.isArray(allMatches) ? allMatches.length : 0;
  const hasAvg = rows.some((r) => r.avg != null);
  return (
    <div className="card">
      <div className="page-section-title">{title}</div>
      <div className="tmvs-output">
        {rows.map((r) => {
          const pct = r.avg ? Math.round(((r.cur - r.avg) / r.avg) * 100) : null;
          const dir = pct == null ? 'flat' : pct >= 8 ? 'up' : pct <= -8 ? 'down' : 'flat';
          return (
            <div className="tmvs-out" key={r.label}>
              <div className="tmvs-out__label">{r.label}</div>
              <div className="tmvs-out__val">{r.cur}</div>
              {r.avg != null ? (
                <div className={`tmvs-out__cmp tmvs-out__cmp--${dir}`}>
                  {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='} {pct > 0 ? '+' : ''}{pct}% · ср {r.avg.toFixed(0)}
                </div>
              ) : (
                <div className="tmvs-out__cmp tmvs-out__cmp--muted">за матч</div>
              )}
            </div>
          );
        })}
      </div>
      {hasAvg && (
        <div className="tmvs-note">
          Сравнение со средним по сезону ({seasonCount} {matchesWord(seasonCount)}). ▲/▼ — отклонение от обычного.
        </div>
      )}
    </div>
  );
}

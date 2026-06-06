/**
 * Стандарты + качество ударов + переходная угроза. Покрывает критику 19,
 * улучшение 49, вау 81/89/90. Всё из реальных полей отчёта; xG стандартов —
 * прозрачный прокси.
 */
import { num } from '../../utils/num';
import { M, played, setPieceSummary } from '../../utils/analytics';
import './analytics.css';

function v(x) { return x == null ? 0 : typeof x === 'object' ? Number(x.value ?? x.count ?? x.total ?? 0) : Number(x) || 0; }

export default function SetPieceShotCard({ match }) {
  if (!match?.players?.length) return null;
  const players = match.players.filter(played);
  const shots = players.reduce((a, p) => a + M.shots(p), 0);
  const head = players.reduce((a, p) => a + M.byHead(p), 0);
  const fk = players.reduce((a, p) => a + M.freeKickShot(p), 0);
  const open = Math.max(0, shots - head - fk);

  const sp = setPieceSummary(match);
  const counter = match.teamAggregates?.attacks?.counterattacks || {};
  const counterShots = v(counter.withShot);
  const counterGoals = v(counter.withGoal);
  const positional = match.teamAggregates?.attacks?.positional || {};
  const posShots = v(positional.withShot);

  const hasShots = shots > 0;
  const hasSp = !!sp;
  const hasTransition = counterShots > 0 || posShots > 0;
  if (!hasShots && !hasSp && !hasTransition) return null;

  const pct = (x) => (shots > 0 ? Math.round((x / shots) * 100) : 0);

  return (
    <div className="card an">
      <div className="page-section-title">Стандарты, удары, переходы <span className="an-model-tag">отчёт + модель</span></div>

      {hasShots && (() => {
        // Категории ударов по типу момента. Полосу-разбивку показываем только
        // когда категорий ≥2 — иначе одна категория = полоса во всю ширину
        // «с игры 13», что выглядит вырождённо. На одну категорию — строкой.
        const cats = [
          ['с игры', open, 'an-prob__seg an-prob__seg--win', null],
          ['головой', head, 'an-prob__seg an-prob__seg--draw', null],
          ['штрафные', fk, 'an-prob__seg', 'var(--an-warn)'],
        ].filter(([, n]) => n > 0);
        if (cats.length >= 2) {
          return (
            <>
              <div className="an-metric__label" style={{ marginBottom: 6 }}>Качество ударов ({shots} всего)</div>
              <div className="an-prob__bar">
                {cats.map(([label, n, cls, bg]) => (
                  <div key={label} className={cls} style={{ width: `${pct(n)}%`, ...(bg ? { background: bg } : {}) }}>
                    {pct(n) >= 12 ? `${label} ${n}` : ''}
                  </div>
                ))}
              </div>
            </>
          );
        }
        const only = cats[0];
        return (
          <div className="an-metric__label">
            Качество ударов: {shots} {only ? `— все ${only[0]}` : ''}
          </div>
        );
      })()}

      <div className="an-chips" style={{ marginTop: 12 }}>
        {hasSp && sp.corners > 0 && <span className="an-chip"><span className="an-chip__label">угловые</span><span className="an-chip__val">{sp.corners}</span></span>}
        {hasSp && sp.freeKicks > 0 && <span className="an-chip"><span className="an-chip__label">штрафные</span><span className="an-chip__val">{sp.freeKicks}</span></span>}
        {hasSp && sp.setPieceXg > 0.05 && <span className="an-chip"><span className="an-chip__label">xG со стандартов</span><span className="an-chip__val">{sp.setPieceXg.toFixed(2)}</span></span>}
        {counterShots > 0 && <span className="an-chip an-chip--pos"><span className="an-chip__label">контратаки с ударом</span><span className="an-chip__val">{counterShots}{counterGoals > 0 ? ` · ${counterGoals} гол` : ''}</span></span>}
        {posShots > 0 && <span className="an-chip"><span className="an-chip__label">позиционные с ударом</span><span className="an-chip__val">{posShots}</span></span>}
      </div>

      <div className="an-note">Разбивка ударов — по типу момента из событий игроков. xG стандартов — прокси (≈0.03 на подачу). Переходная угроза — из агрегатов атак.</div>
    </div>
  );
}

/**
 * Role-fit: к какому позиционному архетипу игрок ближе по профилю метрик
 * (косинусная близость). Покрывает вау 74. Если состав маленький — скрываем.
 */
import { roleFit } from '../../utils/analytics';
import './analytics.css';

export default function RoleFitCard({ player, squad }) {
  if (!player || !squad || squad.length < 4) return null;
  const { best, ranked } = roleFit(player, squad);
  if (!best || best.fit < 1) return null;
  const top = ranked.slice(0, 4);

  return (
    <div className="card an">
      <div className="page-section-title">Ролевой профиль <span className="an-model-tag">модель</span></div>
      <div className="an-rolefit">
        {top.map((r, i) => (
          <div className="an-rolefit__row" key={r.role}>
            <span className={`an-rolefit__name${i === 0 ? ' an-rolefit__name--best' : ''}`}>{r.role}</span>
            <span className="an-rolefit__track"><span className="an-rolefit__fill" style={{ width: `${r.fit}%` }} /></span>
            <span className="an-rolefit__pct">{r.fit}%</span>
          </div>
        ))}
      </div>
      <div className="an-note">Соответствие архетипу по профилю действий игрока (масштаб внутри состава). Лучший — {best.role}.</div>
    </div>
  );
}

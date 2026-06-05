/**
 * Ролевой профиль: насколько игрок подходит каждой РОЛИ по метрикам за сезон.
 * Использует ТОТ ЖЕ движок, что «ДНК игрока» (playerRolePct + rankRoles), поэтому
 * лучшая роль здесь совпадает с архетипом ДНК — две карточки больше не спорят.
 */
import { playerRolePct, rankRoles } from '../../utils/playerRoles';
import './analytics.css';

export default function RoleFitCard({ subject, seasonPlayers, basis = 90 }) {
  const base = playerRolePct(subject, seasonPlayers, basis);
  if (!base) return null;
  const ranked = rankRoles(base.positions, base.pct);
  // Вратарь (fit=null) или мало подходящих ролей — карточку не рисуем.
  if (ranked.length < 2 || ranked[0]?.fit == null) return null;
  const top = ranked.slice(0, 4);
  const max = top[0].fit || 1;

  return (
    <div className="card an">
      <div className="page-section-title">Ролевой профиль <span className="an-model-tag">по метрикам</span></div>
      <div className="an-rolefit">
        {top.map((r, i) => (
          <div className="an-rolefit__row" key={r.name}>
            <span className={`an-rolefit__name${i === 0 ? ' an-rolefit__name--best' : ''}`}>{r.name}</span>
            <span className="an-rolefit__track"><span className="an-rolefit__fill" style={{ width: `${Math.round((r.fit / max) * 100)}%` }} /></span>
            <span className="an-rolefit__pct">{r.fit}</span>
          </div>
        ))}
      </div>
      <div className="an-note">Соответствие ролям по профилю действий за сезон — тот же расчёт, что «ДНК игрока». Лучшая роль — {top[0].name}.</div>
    </div>
  );
}

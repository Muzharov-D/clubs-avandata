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
  // Показываем и сортируем по ОДНОЙ величине — score (соответствие с поправкой на
  // долю минут в зоне роли). Если рисовать сырой fit, а упорядочивать по score,
  // «лучшая» роль второстепенной зоны проигрывает по порядку, но её число выше —
  // и бар переполняется (fit/maxFit > 1). score устраняет это: top[0] всегда максимум.
  const score = (r) => Math.round(r.score);
  const max = score(top[0]) || 1;

  return (
    <div className="card an">
      <div className="page-section-title">Ролевой профиль <span className="an-model-tag">по метрикам</span></div>
      <div className="an-rolefit">
        {top.map((r, i) => (
          <div className="an-rolefit__row" key={r.name}>
            <span className={`an-rolefit__name${i === 0 ? ' an-rolefit__name--best' : ''}`}>{r.name}</span>
            <span className="an-rolefit__track"><span className="an-rolefit__fill" style={{ width: `${Math.min(100, Math.round((score(r) / max) * 100))}%` }} /></span>
            <span className="an-rolefit__pct">{score(r)}</span>
          </div>
        ))}
      </div>
      <div className="an-note">Соответствие ролям по профилю действий за сезон — тот же расчёт, что «ДНК игрока». Лучшая роль — {top[0].name}.</div>
    </div>
  );
}

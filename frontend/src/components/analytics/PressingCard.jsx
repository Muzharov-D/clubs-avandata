/**
 * Прессинг команды: объём прессинг-действий, контрпрессинг и высота линии
 * отбора — простые понятные счётчики из агрегатов. PPDA убран целиком
 * (слишком сложная метрика для тренера: «пасы соперника на оборонительное
 * действие, меньше = лучше» коротко не объяснить).
 */
import { pressingVolume, lineHeight } from '../../utils/analytics';
import './analytics.css';

export default function PressingCard({ match }) {
  if (!match) return null;
  const vol = pressingVolume(match.players || []);
  const line = lineHeight(match);
  if (vol.pressing === 0 && vol.counterpressing === 0 && !line) return null;

  return (
    <div className="card an">
      <div className="page-section-title">Прессинг <span className="an-model-tag">отчёт</span></div>

      <div className="an-chips">
        {vol.pressing > 0 && (
          <span className="an-chip"><span className="an-chip__label">прессинг-действий</span><span className="an-chip__val">{vol.pressing}</span></span>
        )}
        {vol.counterpressing > 0 && (
          <span className="an-chip"><span className="an-chip__label">контрпрессинг</span><span className="an-chip__val">{vol.counterpressing}</span></span>
        )}
        {line && (
          <span className="an-chip"><span className="an-chip__label">линия отбора</span><span className="an-chip__val">{line.label} · {Math.round(line.highShare * 100)}% высоко</span></span>
        )}
      </div>

      {line && (
        <div className="an-note">
          «Линия отбора» — где команда возвращает мяч (прокси по третям поля).
        </div>
      )}
    </div>
  );
}

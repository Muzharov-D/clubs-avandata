/**
 * FreeMatchInsights — словесные выводы матча на free. Где у paid «Ключевые
 * выводы» (на xG/PPDA), у free — честные выводы из free-счётчиков, словами для
 * тренера (CLAUDE.md: «тренеру нужен словесный вывод, а не сырое число»).
 */
import { freeMatchInsights } from '../../utils/freeAnalytics';
import './FreeMatchInsights.css';

export default function FreeMatchInsights({ match }) {
  const items = freeMatchInsights(match);
  if (!items.length) return null;
  return (
    <div className="card free-ins reveal" id="md-free-insights">
      <div className="page-section-title">Выводы по матчу</div>
      <ul className="free-ins__list">
        {items.map((it, i) => (
          <li key={i} className={`free-ins__item free-ins__item--${it.tone}`}>
            <span className="free-ins__icon" aria-hidden>{it.icon}</span>
            <span className="free-ins__text">{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

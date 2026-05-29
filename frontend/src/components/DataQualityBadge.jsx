import { useState } from 'react';
import './DataQualityBadge.css';

const LEVEL_LABEL = { high: 'высокая', medium: 'средняя', low: 'низкая' };

/**
 * Индикатор достоверности данных матча (Phase 1).
 * Показывает % покрытия + раскрывает источники, покрытие игроков и предупреждения.
 * Аналитик сразу видит, чему доверять.
 */
export default function DataQualityBadge({ dq }) {
  const [open, setOpen] = useState(false);
  if (!dq || typeof dq.score !== 'number') return null;
  const level = dq.level || (dq.score >= 75 ? 'high' : dq.score >= 45 ? 'medium' : 'low');

  return (
    <div className="dq-wrap">
      <button
        type="button"
        className={`dq-badge dq-badge--${level}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Достоверность данных ${dq.score} процентов, ${LEVEL_LABEL[level] || ''}. Нажмите для деталей.`}
        title="Полнота и источники распознанных данных матча"
      >
        <span className="dq-badge__dot" aria-hidden="true" />
        Достоверность {dq.score}%
        <span className="dq-badge__chev" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="dq-panel" role="region" aria-label="Детали достоверности данных">
          <div className="dq-panel__row">
            <span>Источники</span>
            <span>{dq.sources?.pdf ? 'PDF' : '—'}{dq.sources?.excel ? ' + Excel' : ' (без Excel)'}</span>
          </div>
          <div className="dq-panel__row">
            <span>С рейтингом</span>
            <span>{dq.players?.withRatings ?? 0}/{dq.players?.total ?? 0}</span>
          </div>
          <div className="dq-panel__row">
            <span>Детальные действия</span>
            <span>{dq.players?.withDetailedStats ?? 0}/{dq.players?.total ?? 0}</span>
          </div>
          <div className="dq-panel__row">
            <span>Командные рейтинги</span>
            <span>{dq.sections?.teamRatings ? 'есть' : 'нет'}</span>
          </div>
          {Array.isArray(dq.warnings) && dq.warnings.length > 0 && (
            <ul className="dq-panel__warn">
              {dq.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <div className="dq-panel__note">
            Показывает полноту распознанных данных. Низкая достоверность — часть метрик может отсутствовать.
          </div>
        </div>
      )}
    </div>
  );
}

// Bottom-sheet с деталями тренировки. Открывается из календаря по клику на event-training.
// Использует те же стили что MatchDetailSheet (mds-*) для консистентности.

import { useEffect } from 'react';
import useModalBack from '../utils/useModalBack';
import './MatchDetailSheet.css';

const TYPES = {
  training: { label: 'Тренировка',          icon: '🏃', cls: 'training' },
  extra:    { label: 'Дополнительное занятие', icon: '⚡', cls: 'extra' },
  warmup:   { label: 'Разминка перед матчем',  icon: '🔥', cls: 'warmup' },
  recovery: { label: 'Восстановление',       icon: '💧', cls: 'recovery' },
  meet:     { label: 'Сбор / разбор',        icon: '👥', cls: 'meet' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

function buildYandexMapsUrl(venue) {
  if (!venue) return null;
  return `https://yandex.ru/maps/?text=${encodeURIComponent(venue)}`;
}

export default function TrainingDetailSheet({ training, onClose, theme = 'default' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  // Android back / swipe-back — закрывает модалку
  useModalBack(onClose, !!training);

  if (!training) return null;
  const typ = TYPES[training.type] || TYPES.training;
  const yaUrl = buildYandexMapsUrl(training.venueText);
  const past = training.startsAt && new Date(training.startsAt).getTime() < Date.now();

  return (
    <div className={`mds-backdrop mds-theme--${theme}`} onClick={onClose}>
      <div className="mds-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="mds-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="mds-header">
          <span className="mds-badge">
            {typ.icon} {typ.label}
          </span>
          <div className="mds-date">{fmtDate(training.startsAt)}</div>
        </div>

        <div className="mds-teams" style={{ flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#22c55e' }}>{typ.icon}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#f1f5fb' }}>{typ.label}</div>
          <div style={{ fontSize: 13, color: '#94a3c8' }}>
            Длительность: {training.durationMin || 90} минут
          </div>
        </div>

        {training.venueText && (
          <div className="mds-venue">
            <div className="mds-venue-icon">📍</div>
            <div className="mds-venue-text">
              <div className="mds-venue-name">{training.venueText}</div>
            </div>
          </div>
        )}

        {yaUrl && !past && (
          <a
            className="mds-cta"
            href={yaUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="mds-cta-icon">🗺</span>
            <span>Маршрут в Я.Картах</span>
          </a>
        )}

        {training.notes && (
          <div className="mds-events" style={{ marginTop: 12 }}>
            <div className="mds-events__title">Заметка тренера</div>
            <div style={{ fontSize: 13, color: '#f1f5fb', lineHeight: 1.5, padding: '4px 0' }}>
              {training.notes}
            </div>
          </div>
        )}

        <div className="mds-footer">
          {past
            ? 'Тренировка уже прошла. Подробности — у тренера.'
            : 'Сбор за 15 минут до начала. Уточните детали у тренера.'}
        </div>
      </div>
    </div>
  );
}

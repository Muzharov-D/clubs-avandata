import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toAssetUrl } from '../services/api';
import './SoccerFieldImageMap.css';

export default function SoccerFieldImageMap({ src, title, height = 320, alt = '' }) {
  const [errored, setErrored] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const url = toAssetUrl(src);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const canOpen = !errored && url;

  return (
    <div className="soccer-map">
      {title && <div className="soccer-map__title">{title}</div>}
      <div
        className={`soccer-map__frame ${canOpen ? 'soccer-map__frame--clickable' : ''}`}
        onClick={() => canOpen && setIsOpen(true)}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onKeyDown={(e) => { if (canOpen && (e.key === 'Enter' || e.key === ' ')) setIsOpen(true); }}
        title={canOpen ? 'Нажмите для увеличения' : undefined}
      >
        {canOpen ? (
          <>
            <img
              src={url}
              alt={alt || title || 'Карта поля'}
              style={{ height, width: 'auto', display: 'block' }}
              onError={() => setErrored(true)}
            />
            <div className="soccer-map__zoom-hint" aria-hidden="true">
              <span className="soccer-map__zoom-icon">🔍</span>
              <span className="soccer-map__zoom-label">Увеличить</span>
            </div>
          </>
        ) : (
          <div className="soccer-map__empty" style={{ height }}>Нет карты</div>
        )}
      </div>

      {isOpen && createPortal(
        <div className="soccer-map__lightbox" onClick={() => setIsOpen(false)}>
          <button
            className="soccer-map__lightbox-close"
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
            aria-label="Закрыть"
          >
            ×
          </button>
          {title && <div className="soccer-map__lightbox-title">{title}</div>}
          <img
            className="soccer-map__lightbox-img"
            src={url}
            alt={alt || title || 'Карта поля'}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

// Pre-prompt модалка — показывается перед нативным Notification.requestPermission().
// Объясняет родителю что он получит, прежде чем браузер спросит permission.
// Это удваивает % согласившихся (без объяснения юзеры жмут «Don't allow» рефлекторно).
//
// Для iOS Safari (не в PWA-mode) — показывает install-hint и НЕ предлагает подписку
// (Web Push на iOS работает ТОЛЬКО когда добавлено на главный экран).

import { useEffect } from 'react';
import './PushPrePrompt.css';

// iOS Safari detect (PWA install detect)
function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const webkit = /WebKit/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
  return iOS && webkit;
}

function isStandalonePWA() {
  return (
    (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true)
  );
}

export default function PushPrePrompt({ ageGroup, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onCancel]);

  const iOSNotPWA = isIOSSafari() && !isStandalonePWA();

  return (
    <div className="pp-backdrop" onClick={onCancel}>
      <div className="pp-card" onClick={(e) => e.stopPropagation()}>
        <button className="pp-close" onClick={onCancel} aria-label="Закрыть">✕</button>

        <div className="pp-icon">🔔</div>
        <h3 className="pp-title">Уведомления о матчах{ageGroup ? ` ${ageGroup}` : ''}</h3>

        {iOSNotPWA ? (
          <>
            <p className="pp-text">
              На iPhone push-уведомления работают только из приложения на главном экране.
              Добавь приложение — и ты будешь получать важные оповещения.
            </p>
            <div className="pp-steps">
              <div className="pp-step"><span className="pp-step-n">1</span>Нажми <b>«Поделиться»</b> внизу Safari</div>
              <div className="pp-step"><span className="pp-step-n">2</span>Выбери <b>«На экран “Домой”»</b></div>
              <div className="pp-step"><span className="pp-step-n">3</span>Открой приложение с главного экрана — потом включи уведомления здесь</div>
            </div>
            <button className="pp-btn pp-btn--ghost" onClick={onCancel}>Понял, добавлю</button>
          </>
        ) : (
          <>
            <p className="pp-text">
              Мы пришлём оповещения только когда это реально важно — без спама:
            </p>
            <ul className="pp-list">
              <li>⏰ За сутки до матча — напоминание</li>
              <li>📋 Состав на матч — когда судья опубликует</li>
              <li>⚽ Голы, карточки, итог матча — когда появится в протоколе</li>
              <li>💬 Комментарий тренера после игры</li>
            </ul>
            <p className="pp-foot">
              Любой тип можно отдельно выключить позже (шестерёнка ⚙ рядом с колокольчиком).
            </p>
            <div className="pp-actions">
              <button className="pp-btn pp-btn--ghost" onClick={onCancel}>Не сейчас</button>
              <button className="pp-btn pp-btn--primary" onClick={onConfirm}>Включить</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

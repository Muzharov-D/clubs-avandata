// Модалка с инструкцией подписки на iCal feed.
// Адаптируется под платформу пользователя — даёт правильную кнопку и инструкцию.

import { useEffect, useState } from 'react';
import useModalBack from '../utils/useModalBack';
import './CalendarSubscribeModal.css';

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) {
    // На iOS отличаем Safari от других браузеров — webcal:// нормально
    // обрабатывает только Safari. Chrome iOS этого не умеет.
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    return isSafari ? 'ios-safari' : 'ios-other';
  }
  if (/android/.test(ua)) return 'android';
  if (/macintosh/.test(ua)) return 'mac';
  return 'desktop';
}

export default function CalendarSubscribeModal({ feedUrl, onClose }) {
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState('desktop');

  useEffect(() => {
    setPlatform(detectPlatform());
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  useModalBack(onClose, true);

  // webcal:// — стандартная схема подписки. iOS/macOS Safari автоматически
  // открывают Calendar app с диалогом подтверждения.
  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');

  // Google Calendar — универсально, работает на всех Android (и десктоп).
  const googleUrl = 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(feedUrl);

  function copy() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="csm-backdrop" onClick={onClose}>
      <div className="csm-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="csm-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="csm-icon">📅</div>
        <h2 className="csm-title">Расписание в твой календарь</h2>
        <p className="csm-subtitle">
          Подпишись один раз — и матчи будут появляться в календаре телефона
          автоматически. Когда меняется время или добавляется матч —
          календарь обновится сам.
        </p>

        <div className="csm-actions">
          {platform === 'ios-safari' && (
            <a className="csm-btn csm-btn--primary" href={webcalUrl}>
              <span>📲</span><span>Открыть в Календаре iPhone</span>
            </a>
          )}
          {platform === 'ios-other' && (
            <>
              <div className="csm-warn">
                ⚠️ Открой эту страницу в <b>Safari</b> для подписки в один тап.
                В Chrome / других браузерах iOS подписка не работает напрямую.
              </div>
              <a className="csm-btn csm-btn--primary" href={webcalUrl}>
                <span>📲</span><span>Попробовать webcal://</span>
              </a>
            </>
          )}
          {platform === 'mac' && (
            <a className="csm-btn csm-btn--primary" href={webcalUrl}>
              <span>📲</span><span>Открыть в Календаре Mac</span>
            </a>
          )}
          {platform === 'android' && (
            <a className="csm-btn csm-btn--primary" href={googleUrl} target="_blank" rel="noreferrer">
              <span>📲</span><span>Добавить в Google Calendar</span>
            </a>
          )}
          {platform === 'desktop' && (
            <>
              <a className="csm-btn csm-btn--primary" href={googleUrl} target="_blank" rel="noreferrer">
                <span>📲</span><span>Добавить в Google Calendar</span>
              </a>
              <a className="csm-btn csm-btn--secondary" href={webcalUrl}>
                <span>📲</span><span>Открыть в системном календаре</span>
              </a>
            </>
          )}
        </div>

        <div className="csm-divider"><span>или вручную</span></div>

        <div className="csm-url-row">
          <input
            className="csm-url"
            value={feedUrl}
            readOnly
            onClick={(e) => e.target.select()}
          />
          <button className="csm-copy" onClick={copy}>
            {copied ? '✓ Скопировано' : 'Копировать'}
          </button>
        </div>

        <details className="csm-help">
          <summary>Инструкция по платформам</summary>
          <div className="csm-help-content">
            <h4>📱 iPhone / iPad</h4>
            <p>
              Самый быстрый способ — открыть эту страницу в <b>Safari</b> и
              нажать большую кнопку выше. Календарь спросит подтверждение и
              добавит расписание.
            </p>
            <p>
              Вручную: <b>Настройки → Календарь → Учётные записи → Добавить
              учётную запись → Другое → Подписка на календарь</b> → вставь
              скопированный URL.
            </p>

            <h4>🤖 Android</h4>
            <p>
              <b>С Google Calendar</b> (большинство устройств): тапни жёлтую
              кнопку выше — откроется Google Calendar с диалогом «Добавить
              календарь». Подтверди — расписание появится в нативном календаре
              телефона.
            </p>
            <p>
              <b>Без Google</b> (Samsung Calendar, MIUI и т.п.): поставь
              бесплатное приложение <b>ICSx<sup>5</sup></b> (Play Store или
              F-Droid) → жми ➕ → вставь URL. Календарь синхронится в
              стандартный Календарь телефона.
            </p>

            <h4>💻 macOS Calendar</h4>
            <p><b>Файл → Новая подписка на календарь</b> → вставь URL.</p>
          </div>
        </details>

        <div className="csm-footer">
          ⓘ Календарь публичный, без логина. Если ссылку придётся отозвать — обнови сезон в админке клуба.
        </div>
      </div>
    </div>
  );
}

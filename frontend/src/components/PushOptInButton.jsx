// Кнопка-toggle для PWA push-уведомлений.
// Состояния: not-supported / off / on / loading / error
// Минимальный UI: иконка-колокольчик с цветовым индикатором.

import { useEffect, useState } from 'react';
import {
  pushSupported,
  requestAndSubscribe,
  unsubscribe,
  checkExistingSubscription,
  requestAndSubscribePublic,
  unsubscribePublic,
  unsubscribePublicAge,
  isSubscribedToAgePublic,
} from '../services/push';
import PushPreferencesPanel from './PushPreferencesPanel';
import './PushOptInButton.css';

// publicMode=true — анонимный поток для родителей на mobile.legirus.
// age — для какой возрастной группы родитель подписывается (нужно бэку,
//       чтобы пометить team_id='legirus-{age}' и адресовать push-крон).
export default function PushOptInButton({ publicMode = false, age = null } = {}) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    setSupported(pushSupported());
    if (!pushSupported()) return;
    // В public-mode подписка per-age: проверяем что age есть в teamIds на бэке.
    // Иначе (coach UI) — просто наличие browser-subscription.
    if (publicMode && age) {
      isSubscribedToAgePublic(age).then((res) => setSubscribed(!!res.subscribed));
    } else {
      checkExistingSubscription().then((sub) => setSubscribed(!!sub));
    }
  }, [publicMode, age]);

  if (!supported) return null;

  async function toggle() {
    setError('');
    setBusy(true);
    try {
      if (subscribed) {
        // В public-mode убираем только текущую команду (мульти-тим подписка).
        // В coach UI — полный unsubscribe.
        if (publicMode && age) {
          await unsubscribePublicAge(age);
        } else {
          await (publicMode ? unsubscribePublic() : unsubscribe());
        }
        setSubscribed(false);
      } else {
        await (publicMode ? requestAndSubscribePublic(age) : requestAndSubscribe());
        setSubscribed(true);
      }
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const title = subscribed
    ? 'Push-уведомления включены — нажмите чтобы отключить'
    : 'Включить push-уведомления о новых матчах';

  return (
    <span className="push-opt-group">
      <button
        className={`push-opt-btn ${subscribed ? 'push-opt-btn--on' : ''}`}
        onClick={toggle}
        disabled={busy}
        title={error || title}
        aria-label={title}
      >
        <span className="push-opt-btn__icon">{subscribed ? '🔔' : '🔕'}</span>
        {error && <span className="push-opt-btn__dot" aria-hidden="true">!</span>}
      </button>
      {subscribed && (
        <button
          type="button"
          className="push-opt-btn push-opt-btn--gear"
          onClick={() => setPrefsOpen(true)}
          aria-label="Настройки уведомлений"
          title="Настройки уведомлений"
        >
          <span className="push-opt-btn__icon">⚙</span>
        </button>
      )}
      {prefsOpen && <PushPreferencesPanel onClose={() => setPrefsOpen(false)} publicMode={publicMode} />}
    </span>
  );
}

// Per-team bell — компактная кнопка включения/выключения пушей для конкретной
// возрастной группы. Живёт внутри таба команды в PublicTeamHeader.
// stopPropagation() на клике — чтобы не триггерить tab navigation.

import { useEffect, useState } from 'react';
import {
  pushSupported,
  requestAndSubscribePublic,
  unsubscribePublicAge,
  isSubscribedToAgePublic,
} from '../services/push';
import { toast } from './Toast';
import PushPrePrompt from './PushPrePrompt';
import './PushBellTab.css';

export default function PushBellTab({ age }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prePromptOpen, setPrePromptOpen] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    setSupported(true);
    let cancelled = false;
    isSubscribedToAgePublic(age).then((res) => {
      if (!cancelled) setSubscribed(!!res.subscribed);
    });
    return () => { cancelled = true; };
  }, [age]);

  if (!supported) return null;

  // Уже подписан → клик сразу отключает (с toast-подтверждением)
  // Не подписан → сначала pre-prompt (он сам вызовет permission API)
  async function onClick(e) {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    if (subscribed) {
      setBusy(true);
      try {
        await unsubscribePublicAge(age);
        setSubscribed(false);
        toast.info(`Уведомления по ${age} выключены`);
      } catch (_) {
        toast.error('Не получилось отписаться, попробуй ещё раз');
      } finally {
        setBusy(false);
      }
    } else {
      // Открываем pre-prompt вместо немедленного nativе-запроса
      setPrePromptOpen(true);
    }
  }

  async function onConfirmSubscribe() {
    setPrePromptOpen(false);
    setBusy(true);
    try {
      await requestAndSubscribePublic(age);
      setSubscribed(true);
      toast.success(`Готово! Первое уведомление придёт за сутки до матча ${age}`);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('не разрешил') || msg.includes('denied')) {
        toast.error('Уведомления заблокированы в настройках браузера');
      } else {
        toast.error(msg || 'Не получилось включить');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span
        role="button"
        tabIndex={-1}
        className={`push-bell-tab${subscribed ? ' push-bell-tab--on' : ''}${busy ? ' push-bell-tab--busy' : ''}`}
        onClick={onClick}
        aria-label={subscribed ? 'Отключить уведомления для команды' : 'Включить уведомления для команды'}
        title={subscribed ? 'Уведомления включены — клик отключит' : 'Включить уведомления'}
      >
        {subscribed ? '🔔' : '🔕'}
      </span>
      {prePromptOpen && (
        <PushPrePrompt
          ageGroup={age}
          onConfirm={onConfirmSubscribe}
          onCancel={() => setPrePromptOpen(false)}
        />
      )}
    </>
  );
}

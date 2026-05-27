// Hook: Android back-button и swipe-back закрывают модалку, а не страницу.
// Открытие модалки → pushState; popstate (back/swipe) → onClose;
// Закрытие через крестик → cleanup делает history.back() для синхронизации.

import { useEffect, useRef } from 'react';

export default function useModalBack(onClose, isOpen = true) {
  // Ref на актуальный onClose — чтобы избежать stale-closure
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let closedByBack = false;
    window.history.pushState({ legirusModal: true, ts: Date.now() }, '');

    const onPop = () => {
      closedByBack = true;
      const cb = onCloseRef.current;
      if (typeof cb === 'function') cb();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (!closedByBack && window.history.state?.legirusModal) {
        try { window.history.back(); } catch {}
      }
    };
  }, [isOpen]);
}

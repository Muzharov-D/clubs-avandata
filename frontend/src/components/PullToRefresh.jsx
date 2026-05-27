// Pull-to-refresh для мобильных PWA.
// Простая native-feeling реализация без либ.
//
// Использование (обернуть всю прокручиваемую страницу):
//   <PullToRefresh onRefresh={async () => { await reloadData(); }}>
//     <div>...content...</div>
//   </PullToRefresh>
//
// Триггерится только когда страница в самом верху (scrollY === 0) и пользователь
// тянет ВНИЗ. Показывает spinner после порога ~70px. Отпустил выше порога —
// вызывается onRefresh, спиннер крутится пока промис не резолвится.

import { useEffect, useRef, useState } from 'react';
import './PullToRefresh.css';

const THRESHOLD_PX = 70;
const MAX_PULL_PX = 110;

export default function PullToRefresh({ onRefresh, children, disabled = false }) {
  const startYRef = useRef(null);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (disabled) return;

    function onTouchStart(e) {
      if (refreshing) return;
      if (window.scrollY > 0) return; // тянуть можно только от верха
      const t = e.touches?.[0];
      if (!t) return;
      startYRef.current = t.clientY;
    }
    function onTouchMove(e) {
      if (refreshing || startYRef.current == null) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dy = t.clientY - startYRef.current;
      if (dy <= 0) { setPullPx(0); return; }
      if (window.scrollY > 0) { startYRef.current = null; setPullPx(0); return; }
      // Резистанс: на 2 пикселя тяги — 1 пиксель смещения
      const resisted = Math.min(MAX_PULL_PX, dy / 2);
      setPullPx(resisted);
      // если уже тянем — гасим вертикальный скролл браузера
      if (dy > 10 && e.cancelable) e.preventDefault();
    }
    async function onTouchEnd() {
      if (refreshing) return;
      const dy = pullPx;
      startYRef.current = null;
      if (dy >= THRESHOLD_PX) {
        setRefreshing(true);
        setPullPx(THRESHOLD_PX);
        try { await onRefresh(); } catch (_) {}
        setRefreshing(false);
        setPullPx(0);
      } else {
        setPullPx(0);
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onRefresh, pullPx, refreshing, disabled]);

  const visible = pullPx > 0 || refreshing;
  const progress = Math.min(1, pullPx / THRESHOLD_PX);

  return (
    <>
      {visible && (
        <div
          className={`ptr-indicator${refreshing ? ' ptr-indicator--spin' : ''}`}
          style={{ transform: `translateY(${pullPx}px)`, opacity: 0.4 + progress * 0.6 }}
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="#dc2626" strokeWidth="2.5"
                    strokeDasharray={`${progress * 50} 50`} strokeLinecap="round" />
          </svg>
        </div>
      )}
      {children}
    </>
  );
}

import { useEffect } from 'react';

/**
 * Scroll-reveal: всем .reveal внутри root добавляет .is-in при появлении
 * во вьюпорте (IntersectionObserver). Один раз навешивает на текущие узлы.
 * deps — пересканировать, когда контент дорисовался (например, после загрузки).
 */
export function useReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll('.reveal:not(.is-in)');
    if (!nodes.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Count-up: анимирует число от 0 до value за ms. Возвращает текущее значение.
 * Уважает prefers-reduced-motion (сразу финальное).
 */
import { useState, useEffect as useEffect2 } from 'react';
export function useCountUp(value, ms = 900) {
  const [n, setN] = useState(0);
  useEffect2(() => {
    const target = Number(value) || 0;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) { setN(target); return; }
    let raf, start;
    const tick = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return n;
}

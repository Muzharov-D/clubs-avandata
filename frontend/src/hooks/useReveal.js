import { useEffect } from 'react';

/**
 * Scroll-reveal: всем .reveal внутри root добавляет .is-in при появлении
 * во вьюпорте. Пуленепробиваемо: MutationObserver подхватывает блоки, которые
 * отрисовались ПОЗЖЕ (асинхронные данные) — иначе они застряли бы невидимыми;
 * элементы уже во вьюпорте показываются сразу; fallback-таймер раскрывает всё,
 * если IntersectionObserver не сработал. Контент НИКОГДА не остаётся скрытым.
 */
export function useReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reveal = (n) => { n.classList.add('is-in'); };

    if (typeof IntersectionObserver === 'undefined') {
      root.querySelectorAll('.reveal').forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
    );

    const arm = (node) => {
      if (node.classList.contains('is-in')) return;
      // Уже виден во вьюпорте — показываем сразу (не ждём скролла).
      const r = node.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(node);
      else io.observe(node);
    };

    const scan = () => root.querySelectorAll('.reveal:not(.is-in)').forEach(arm);
    scan();

    // Блоки, дорисованные после async-загрузки данных, ловим автоматически.
    const mo = new MutationObserver(() => scan());
    mo.observe(root, { childList: true, subtree: true });

    // Safety-net: что бы ни случилось, через 1.5с всё видимо.
    const safety = setTimeout(() => {
      root.querySelectorAll('.reveal:not(.is-in)').forEach(reveal);
    }, 1500);

    return () => { io.disconnect(); mo.disconnect(); clearTimeout(safety); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Count-up: анимирует число от 0 до value за ms. Возвращает текущее значение.
 * Уважает prefers-reduced-motion (сразу финальное).
 */
import { useState, useEffect as useEffect2 } from 'react';
export function useCountUp(value, ms = 900, decimals = 0) {
  const [n, setN] = useState(0);
  useEffect2(() => {
    const target = Number(value) || 0;
    const round = (x) => {
      const f = Math.pow(10, decimals);
      return Math.round(x * f) / f;
    };
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) { setN(target); return; }
    let raf, start;
    const tick = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setN(round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, decimals]);
  return n;
}

/**
 * Parallax-tilt: 3D-наклон элемента за курсором (как премиальные карточки).
 * Навешивается на ref. Уважает prefers-reduced-motion (no-op).
 */
import { useEffect as useEffect3 } from 'react';
export function useTilt(ref, max = 7) {
  useEffect3(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia?.('(hover: none)').matches) return; // не на тач
    let raf = 0;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-3px)`;
      });
    };
    const onLeave = () => { cancelAnimationFrame(raf); el.style.transform = ''; };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); cancelAnimationFrame(raf); };
  }, [ref, max]);
}

import { useOutlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * AnimatedOutlet — плавный переход между РАЗДЕЛАМИ (/club, /analytics, /players…).
 *
 * Вход контента НЕ анимируем здесь намеренно: его уже делает stagger карточек
 * (`.app-content .card` → tu-rise в theme-upgrade.css). Дублировать = jank.
 * Добавляем только то, чего не было — мягкий ВЫХОД, чтобы навигация не была
 * жёстким резом. Ключ — по первому сегменту пути: внутри раздела (игрок A→B)
 * перехода нет (мгновенно), между разделами — короткое затухание.
 *
 * Уважает prefers-reduced-motion и «чистый режим» html.fx-off (там без движения).
 */
export default function AnimatedOutlet() {
  const outlet = useOutlet();
  const location = useLocation();
  const reduce = useReducedMotion();

  const fxOff =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('fx-off');

  if (reduce || fxOff) return <>{outlet}</>;

  const sectionKey = '/' + (location.pathname.split('/')[1] ?? '');

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={sectionKey}
        initial={false}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

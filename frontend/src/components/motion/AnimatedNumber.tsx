/**
 * AnimatedNumber — число «оживает» при появлении: пружинный count-up.
 * Signature-приём: KPI/счёт/xG/проценты набегают, а не возникают.
 * Уважает prefers-reduced-motion (мгновенно ставит конечное значение).
 * Если вкладка скрыта на момент монтирования (rAF заморожен — фон/новая вкладка),
 * count-up некому проигрывать: ставим конечное значение сразу, чтобы число
 * никогда не залипало на стартовом `from` (0). Анимируем только когда видно.
 */
import { useEffect } from 'react';
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion';

const isHidden = (): boolean =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

interface AnimatedNumberProps {
  value: number;
  /** Форматирование итогового числа (по умолчанию — целое). */
  format?: (v: number) => string;
  className?: string;
  stiffness?: number;
  damping?: number;
  /** Не запускать count-up с нуля, анимировать только последующие изменения. */
  from?: number;
}

export function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString('ru-RU'),
  className,
  stiffness = 100,
  damping = 30,
  from = 0,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  // Старт без count-up, если анимировать некому: reduce-motion или скрытая вкладка.
  const instant = reduce || isHidden();
  const spring = useSpring(instant ? value : from, { stiffness, damping, mass: 1 });
  const text = useTransform(spring, (v) => format(v));

  useEffect(() => {
    if (reduce || isHidden()) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);

  // Смонтировались скрытыми → значение уже стоит верное (jump). Когда вкладка
  // станет видимой, подстрахуемся: ещё раз приводим пружину к актуальному value.
  useEffect(() => {
    if (reduce) return;
    const onVisible = () => {
      if (!isHidden()) spring.set(value);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [value, reduce, spring]);

  return <motion.span className={className}>{text}</motion.span>;
}

/**
 * AnimatedNumber — число «оживает» при появлении: пружинный count-up.
 * Signature-приём: KPI/счёт/xG/проценты набегают, а не возникают.
 * Уважает prefers-reduced-motion (мгновенно ставит конечное значение).
 */
import { useEffect } from 'react';
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion';

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
  const spring = useSpring(reduce ? value : from, { stiffness, damping, mass: 1 });
  const text = useTransform(spring, (v) => format(v));

  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);

  return <motion.span className={className}>{text}</motion.span>;
}

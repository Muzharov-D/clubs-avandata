/**
 * PageTransition — мягкий вход содержимого страницы (фейд + лёгкий подъём).
 * Signature-приём: смена экрана ощущается как «склейка», а не мигание.
 * Уважает prefers-reduced-motion.
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.42, ease: [0, 0, 0.38, 0.9] }}
    >
      {children}
    </motion.div>
  );
}

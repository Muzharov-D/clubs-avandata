/**
 * Reveal — появление блока при входе в зону видимости (или сразу при монтировании).
 * Signature-приём «океан»: контент раскрывается по мере скролла, как в data-журналистике.
 * Уважает prefers-reduced-motion (просто показывает, без сдвига).
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

type RevealVariant = 'slide-up' | 'slide-right' | 'fade' | 'clip';

interface RevealProps {
  children: ReactNode;
  variant?: RevealVariant;
  /** Задержка (для каскада вручную). */
  delay?: number;
  duration?: number;
  /** Анимировать только один раз (по умолчанию да). */
  once?: boolean;
  className?: string;
}

const OFFSET = 22;

function buildVariants(variant: RevealVariant, reduce: boolean): Variants {
  if (reduce) {
    return { hidden: { opacity: 1 }, visible: { opacity: 1 } };
  }
  const hidden: Record<string, number | string> = { opacity: 0 };
  if (variant === 'slide-up') hidden.y = OFFSET;
  if (variant === 'slide-right') hidden.x = -OFFSET;
  if (variant === 'clip') hidden.clipPath = 'inset(0 100% 0 0)';
  return {
    hidden,
    visible: { opacity: 1, x: 0, y: 0, clipPath: 'inset(0 0% 0 0)' },
  };
}

export function Reveal({
  children,
  variant = 'slide-up',
  delay = 0,
  duration = 0.6,
  once = true,
  className,
}: RevealProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      className={className}
      variants={buildVariants(variant, reduce)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: 0.25 }}
      transition={{ duration: reduce ? 0 : duration, delay: reduce ? 0 : delay, ease: [0, 0, 0.38, 0.9] }}
    >
      {children}
    </motion.div>
  );
}

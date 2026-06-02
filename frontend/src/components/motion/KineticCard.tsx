/**
 * KineticCard — карточка с тактильной физикой: lift при наведении, нажатие,
 * опциональное брендовое свечение. Signature-приём «точность»: микро-отклик
 * на каждое касание. Уважает prefers-reduced-motion и тач (без залипания).
 */
import type { ReactNode, CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface KineticCardProps {
  children: ReactNode;
  onClick?: () => void;
  /** Брендовое свечение при наведении/фокусе. */
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function KineticCard({ children, onClick, glow = false, className, style, ariaLabel }: KineticCardProps) {
  const reduce = useReducedMotion() ?? false;
  const interactive = typeof onClick === 'function';

  return (
    <motion.div
      className={className}
      style={style}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      whileHover={reduce ? undefined : { y: -3, boxShadow: glow ? '0 0 24px rgba(34,211,238,0.18)' : undefined }}
      whileTap={reduce || !interactive ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.38, 0.9] }}
    >
      {children}
    </motion.div>
  );
}

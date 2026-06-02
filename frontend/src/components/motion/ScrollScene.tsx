/**
 * ScrollScene — слой с параллаксом при скролле (фон/средний/ближний план).
 * Signature-приём «глубина»: даёт кинематографичный объём без 3D.
 * При prefers-reduced-motion параллакс отключается.
 */
import { useRef, type ReactNode } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

type Layer = 'far' | 'mid' | 'near';

interface ScrollSceneProps {
  children: ReactNode;
  layer?: Layer;
  className?: string;
}

const FACTOR: Record<Layer, number> = { far: 0.2, mid: 0.6, near: 1.0 };
/** Амплитуда сдвига (px) для самого дальнего слоя. */
const MAX_SHIFT = 60;

export function ScrollScene({ children, layer = 'mid', className }: ScrollSceneProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const shift = MAX_SHIFT * (1 - FACTOR[layer]);
  const y = useTransform(scrollYProgress, [0, 1], [shift, -shift]);

  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

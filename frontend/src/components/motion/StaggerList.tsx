/**
 * StaggerList — каскадное появление детей (рейтинги, состав, лидеры).
 * Signature-приём: списки «набегают» по очереди, а не вспыхивают разом.
 * Каждый прямой ребёнок оборачивается в motion-элемент с общими variants.
 */
import { Children, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type StaggerSpeed = 'tight' | 'normal' | 'loose';

interface StaggerListProps {
  children: ReactNode;
  speed?: StaggerSpeed;
  /** Анимировать при входе в зону видимости (иначе — при монтировании). */
  whenInView?: boolean;
  once?: boolean;
  className?: string;
  /** HTML-тег контейнера (ul/ol/div). */
  as?: 'div' | 'ul' | 'ol';
}

const STAGGER: Record<StaggerSpeed, number> = { tight: 0.04, normal: 0.08, loose: 0.12 };

export function StaggerList({
  children,
  speed = 'normal',
  whenInView = true,
  once = true,
  className,
  as = 'div',
}: StaggerListProps) {
  const reduce = useReducedMotion() ?? false;
  const MotionTag = as === 'ul' ? motion.ul : as === 'ol' ? motion.ol : motion.div;
  const ItemTag = as === 'div' ? motion.div : motion.li;

  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: reduce ? 0 : STAGGER[speed] } },
  };
  const item = reduce
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0, 0, 0.38, 0.9] as const } },
      };

  return (
    <MotionTag
      className={className}
      variants={container}
      initial="hidden"
      {...(whenInView
        ? { whileInView: 'visible', viewport: { once, amount: 0.2 } }
        : { animate: 'visible' })}
    >
      {Children.map(children, (child, i) => (
        <ItemTag key={i} variants={item}>
          {child}
        </ItemTag>
      ))}
    </MotionTag>
  );
}

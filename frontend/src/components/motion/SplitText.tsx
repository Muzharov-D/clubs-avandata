/**
 * SplitText — заголовок «собирается» из слов с лёгким каскадом и сдвигом.
 * Signature-приём «кино»: имя игрока/команды въезжает как broadcast lower-third.
 * Уважает prefers-reduced-motion (показывает текст целиком).
 */
import { motion, useReducedMotion } from 'framer-motion';

interface SplitTextProps {
  text: string;
  className?: string;
  /** Задержка старта (для синхронизации с другими элементами). */
  delay?: number;
  whenInView?: boolean;
}

export function SplitText({ text, className, delay = 0, whenInView = false }: SplitTextProps) {
  const reduce = useReducedMotion() ?? false;
  const words = text.split(' ');

  if (reduce) return <span className={className}>{text}</span>;

  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06, delayChildren: delay } },
  };
  const word = {
    hidden: { opacity: 0, y: '0.5em' },
    visible: { opacity: 1, y: '0em', transition: { duration: 0.5, ease: [0.2, 0, 0.38, 0.9] as const } },
  };

  return (
    <motion.span
      className={className}
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.28em', overflow: 'hidden' }}
      variants={container}
      initial="hidden"
      {...(whenInView ? { whileInView: 'visible', viewport: { once: true } } : { animate: 'visible' })}
      aria-label={text}
    >
      {words.map((w, i) => (
        <motion.span key={i} variants={word} aria-hidden style={{ display: 'inline-block' }}>
          {w}
        </motion.span>
      ))}
    </motion.span>
  );
}

import type { ReactNode } from 'react';

export interface DonutSegment { label: string; value: number; color: string }

/**
 * Донат-кольцо (SVG) для блоков «Потери таланта»: доли целого сегментами + центр-метка.
 * Логика экрана — «ранние vs поздние» (Q1+Q2 vs Q3+Q4): поздние подсвечиваются как зона
 * риска. Рисуем через stroke-dasharray на окружностях (старт сверху, по часовой).
 */
export function Donut({
  segments, size = 150, thickness = 20, center, ariaLabel,
}: {
  segments: DonutSegment[]; size?: number; thickness?: number; center?: ReactNode; ariaLabel?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={thickness} />
          {segments.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={s.color} strokeWidth={thickness} strokeLinecap="butt"
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
                style={{ transition: 'stroke-dasharray 0.5s var(--ease)' }}
              />
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>
      {center != null && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.1 }}>
          {center}
        </div>
      )}
    </div>
  );
}

/** Подпись-легенда сегментов донута (точка + название + значение). */
export function DonutLegend({ segments, unit = '%' }: { segments: DonutSegment[]; unit?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {segments.map((s) => (
        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
          <span className="fed-note">{s.label} · <strong style={{ color: 'var(--text)' }}>{Math.round(s.value)}{unit}</strong></span>
        </span>
      ))}
    </div>
  );
}

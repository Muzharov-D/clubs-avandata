/**
 * Аватар игрока — круг с динамическим градиентом и инициалами. Порт из боевого
 * фронта AvanData (PlayerAvatar.tsx): никаких серых заглушек.
 */
import { useMemo, useState } from 'react';

const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#22d3ee', '#0e7490'], ['#3054ff', '#091e80'], ['#ff0099', '#85035d'],
  ['#fbbf24', '#92400e'], ['#fb7185', '#9f1239'], ['#a78bfa', '#5b21b6'],
  ['#34d399', '#065f46'], ['#fb923c', '#9a3412'], ['#60a5fa', '#1e3a8a'], ['#f472b6', '#831843'],
];

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const initials = (s: string): string => {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

interface Props { name: string; size?: number; ring?: boolean; photoUrl?: string | null }

export function PlayerAvatar({ name, size = 44, ring = false, photoUrl }: Props) {
  const [failed, setFailed] = useState(false);
  const { gid, c1, c2, ini } = useMemo(() => {
    const [a, b] = PALETTE[hash(name) % PALETTE.length];
    return { gid: `pa-${hash(name)}`, c1: a, c2: b, ini: initials(name) };
  }, [name]);
  // Реальное фото игрока (Наградион CDN), при битой ссылке — генеративный аватар (без серых заглушек).
  if (photoUrl && /^https?:\/\//.test(photoUrl) && !failed) {
    return (
      <img
        src={photoUrl} alt={name} width={size} height={size} decoding="async" loading="lazy"
        onError={() => setFailed(true)}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center',
          display: 'block', flex: 'none', background: 'var(--av-surface-2, #131a3a)',
          border: ring ? '1.5px solid rgba(94,235,252,0.55)' : '1px solid rgba(255,255,255,0.22)',
          filter: ring ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' : undefined,
        }}
      />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={name} style={{ display: 'block', flex: 'none', filter: ring ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' : undefined }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill={`url(#${gid})`} stroke={ring ? 'rgba(94,235,252,0.55)' : 'rgba(255,255,255,0.22)'} strokeWidth={ring ? 1.5 : 1} />
      <text x="24" y="30" textAnchor="middle" fontFamily="Montserrat, system-ui, sans-serif" fontWeight="700" fontSize="16" fill="#fff" letterSpacing="-0.02em">{ini}</text>
    </svg>
  );
}

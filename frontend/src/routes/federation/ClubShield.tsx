/**
 * Герб клуба — реальный логотип (nagradion CDN) или генеративный SVG-щит из
 * названия, чтобы никогда не показывать серые заглушки. Порт из боевого фронта
 * AvanData (ClubShield.tsx).
 */
import { useMemo } from 'react';

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
  const words = s.replace(/[«»"'()]/g, '').replace(/ФК|СШОР|СШ|№\s*\d+/gi, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

interface Props { name: string; logoUrl?: string | null; size?: number; }

export function ClubShield({ name, logoUrl, size = 32 }: Props) {
  const { gid, c1, c2, ini } = useMemo(() => {
    const [a, b] = PALETTE[hash(name) % PALETTE.length];
    return { gid: `cs-${hash(name)}`, c1: a, c2: b, ini: initials(name) };
  }, [name]);

  if (logoUrl && /^https?:\/\//.test(logoUrl)) {
    return (
      <img src={logoUrl} alt={name} width={size} height={size} decoding="async" loading="lazy" className="av-shield" style={{ width: size, height: size }} />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={name} style={{ display: 'inline-block', flex: 'none' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <path d="M32 4 L58 12 L58 32 Q58 50 32 60 Q6 50 6 32 L6 12 Z" fill={`url(#${gid})`} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <text x="32" y="40" textAnchor="middle" fontFamily="Montserrat, system-ui, sans-serif" fontWeight="700" fontSize={ini.length > 2 ? 16 : 22} fill="#fff" letterSpacing="-0.05em">{ini}</text>
    </svg>
  );
}

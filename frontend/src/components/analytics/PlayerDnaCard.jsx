/**
 * PlayerDnaCard — «ДНК игрока»: визуальная личность из данных.
 * Signature-фишка супер-профиля: архетип роли + сильные стороны как перцентильный
 * НАРРАТИВ (а не сырые бары) + зоны роста. Рыночный разрыв: все собирают данные,
 * мы их подаём. Анимация — язык движения Авандаты (count-up + каскад + reveal).
 *
 * Данные: сезонный пул игроков (seasonPlayers) + per-90 нормализация по basis.
 */
import { useMemo } from 'react';
import { per90, seasonPercentile } from '../../utils/analytics';
import { AnimatedNumber, StaggerList, SplitText } from '../motion';
import './PlayerDnaCard.css';

// Метрики ДНК (как в сезонном перцентиле) + группа для определения архетипа.
const DNA_METRICS = [
  { key: 'gi',           label: 'гол+пас',             group: 'attack',  get: (s) => (s.goals || 0) + (s.assists || 0) },
  { key: 'shots',        label: 'удары',               group: 'attack',  get: (s) => s.shots || 0 },
  { key: 'keyPass',      label: 'ключевые передачи',   group: 'attack',  get: (s) => s.keyPass || 0 },
  { key: 'dribble',      label: 'обводки',             group: 'attack',  get: (s) => s.dribble || 0 },
  { key: 'tackle',       label: 'отборы',              group: 'defence', get: (s) => s.tackle || 0 },
  { key: 'interception', label: 'перехваты',           group: 'defence', get: (s) => s.interception || 0 },
  { key: 'recovery',     label: 'возвраты',            group: 'defence', get: (s) => s.recovery || 0 },
  { key: 'duel',         label: 'единоборства',        group: 'defence', get: (s) => s.duel || 0 },
  { key: 'pressing',     label: 'прессинг',            group: 'defence', get: (s) => s.pressing || 0 },
  { key: 'distance',     label: 'беговой объём',       group: 'fitness', get: (s) => s.distance || 0 },
];

// Архетип по доминирующей метрике + группе сильных сторон.
function archetypeOf(strengths) {
  if (!strengths.length) return { name: 'Универсал', tagline: 'сбалансированный профиль' };
  const top = strengths[0];
  const byKey = {
    gi:           { name: 'Финишёр',     tagline: 'решает результативными действиями' },
    shots:        { name: 'Финишёр',     tagline: 'постоянная угроза воротам' },
    keyPass:      { name: 'Креативщик',  tagline: 'создаёт моменты для партнёров' },
    dribble:      { name: 'Дриблёр',     tagline: 'обыгрывает один в один' },
    tackle:       { name: 'Разрушитель', tagline: 'выгрызает мячи в отборе' },
    interception: { name: 'Перехватчик', tagline: 'читает игру на опережение' },
    recovery:     { name: 'Чистильщик',  tagline: 'подбирает и возвращает владение' },
    duel:         { name: 'Боец',        tagline: 'выигрывает единоборства' },
    pressing:     { name: 'Прессинг-мотор', tagline: 'не даёт сопернику дышать' },
    distance:     { name: 'Двигатель',   tagline: 'огромный беговой объём' },
  };
  return byKey[top.key] || { name: 'Универсал', tagline: 'сбалансированный профиль' };
}

function colorForPct(pct) {
  if (pct >= 80) return 'var(--rating-excellent)';
  if (pct >= 60) return 'var(--rating-good)';
  if (pct >= 40) return 'var(--rating-ok)';
  if (pct >= 20) return 'var(--rating-weak)';
  return 'var(--rating-poor)';
}

function computeDna(subject, seasonPlayers, basis) {
  if (!Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return null;
  const me = seasonPlayers.find((s) => s.id === subject.id);
  if (!me || !(me.minutes > 0)) return null;
  const ranked = [];
  for (const m of DNA_METRICS) {
    const poolMax = Math.max(0, ...seasonPlayers.map((s) => Number(m.get(s)) || 0));
    if (poolMax <= 0) continue;
    const my = per90(m.get(me), me.minutes, 1, basis);
    const res = seasonPercentile(subject, seasonPlayers, (s) => per90(m.get(s), s.minutes, 1, basis), my);
    if (res.pct != null) ranked.push({ key: m.key, label: m.label, group: m.group, pct: res.pct });
  }
  if (ranked.length < 3) return null;
  ranked.sort((a, b) => b.pct - a.pct);
  const strengths = ranked.filter((r) => r.pct >= 55).slice(0, 4);
  const growth = ranked.filter((r) => r.pct <= 40).slice(-2).reverse();
  return { archetype: archetypeOf(strengths.length ? strengths : ranked), strengths, growth, top: ranked[0] };
}

// Склонение русских числительных для inline-статистики сезона.
function dnaPlural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// Однострочная сводка сезона: «14 матчей · 6 голов · 3 ассиста».
function buildStatsLine(stats) {
  if (!stats) return null;
  const parts = [];
  if (stats.matches != null) parts.push(`${stats.matches} ${dnaPlural(stats.matches, 'матч', 'матча', 'матчей')}`);
  if (stats.goals != null) parts.push(`${stats.goals} ${dnaPlural(stats.goals, 'гол', 'гола', 'голов')}`);
  if (stats.assists != null) parts.push(`${stats.assists} ${dnaPlural(stats.assists, 'ассист', 'ассиста', 'ассистов')}`);
  return parts.length ? parts.join(' · ') : null;
}

export default function PlayerDnaCard({
  subject,
  seasonPlayers,
  basis = 90,
  className = '',
  showStatsInline = false,
  stats = null,
  photo = null,
  positionLine = null,
}) {
  const dna = useMemo(() => computeDna(subject, seasonPlayers, basis), [subject, seasonPlayers, basis]);
  if (!dna) return null;

  const { archetype, strengths, growth, top } = dna;
  const superline = top.pct >= 75
    ? `Топ-${Math.max(1, 100 - top.pct)}% команды по «${top.label}»`
    : `Сильнее всего проявляет себя в «${top.label}»`;
  const statsLine = showStatsInline ? buildStatsLine(stats) : null;
  const rootClass = `dna-card${className ? ` ${className}` : ''}`;

  return (
    <div className={rootClass}>
      <div className="dna-card__glow" aria-hidden />

      {photo != null && <div className="dna-card__photo">{photo}</div>}

      <div className="dna-card__head">
        <div className="dna-card__head-main">
          <div className="dna-card__eyebrow">ДНК игрока</div>
          {positionLine && <div className="dna-card__identity">{positionLine}</div>}
          <h2 className="dna-card__archetype">
            <SplitText text={archetype.name} />
          </h2>
          <div className="dna-card__tagline">{archetype.tagline}</div>
          {statsLine && <div className="dna-card__stats-inline">{statsLine}</div>}
          <div className="dna-card__superline">{superline}</div>
        </div>
        {showStatsInline && stats?.avgOverall > 0 && (
          <div className="dna-card__rating">
            <div className="dna-card__rating-ring">
              <svg className="dna-card__rating-svg" viewBox="0 0 120 120" aria-hidden>
                <defs>
                  <linearGradient id="dna-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" className="dna-ring-grad-a" />
                    <stop offset="100%" className="dna-ring-grad-b" />
                  </linearGradient>
                </defs>
                <circle className="dna-ring-track" cx="60" cy="60" r="52" />
                <circle
                  className="dna-ring-prog"
                  cx="60"
                  cy="60"
                  r="52"
                  style={{ strokeDasharray: `${(Math.min(100, Math.round(stats.avgOverall * 10)) / 100) * 326.7} 999` }}
                />
              </svg>
              <div className="dna-card__rating-num">
                <AnimatedNumber value={stats.avgOverall} format={(v) => v.toFixed(1)} stiffness={120} damping={24} />
              </div>
            </div>
            <div className="dna-card__rating-lab">рейтинг сезона</div>
          </div>
        )}
      </div>

      {strengths.length > 0 && (
        <div className="dna-card__block">
          <div className="dna-card__block-title">
            Сильные стороны
            <span className="dna-card__block-sub">перцентиль в команде</span>
          </div>
          <StaggerList className="dna-card__bars" speed="normal">
            {strengths.map((s, i) => (
              <div className={`dna-bar${i === 0 ? ' dna-bar--lead' : ''}`} key={s.key}>
                <div className="dna-bar__head">
                  <span className="dna-bar__label">{s.label}</span>
                  <span className="dna-bar__pct">
                    <AnimatedNumber value={s.pct} stiffness={200} damping={26} />
                  </span>
                </div>
                <div className="dna-bar__track" aria-hidden>
                  <div className="dna-bar__fill" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </StaggerList>
        </div>
      )}

      {growth.length > 0 && (
        <div className="dna-card__block">
          <div className="dna-card__block-title dna-card__block-title--muted">Зоны роста</div>
          <div className="dna-card__growth">
            {growth.map((g) => (
              <span className="dna-growth-pill" key={g.key}>
                {g.label}
                <span className="dna-growth-pill__pct">{g.pct}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

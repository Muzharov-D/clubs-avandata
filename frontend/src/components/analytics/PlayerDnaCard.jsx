/**
 * PlayerDnaCard — «ДНК игрока»: визуальная личность из данных.
 * Signature-фишка супер-профиля: архетип роли + сильные стороны как перцентильный
 * НАРРАТИВ (а не сырые бары) + зоны роста. Рыночный разрыв: все собирают данные,
 * мы их подаём. Анимация — язык движения Авандаты (count-up + каскад + reveal).
 *
 * Данные: сезонный пул игроков (seasonPlayers) + per-90 нормализация по basis.
 */
import { useMemo } from 'react';
import { positionGroup } from '../../utils/pizzaTemplates';
import { playerRolePct, rankRoles } from '../../utils/playerRoles';
import { AnimatedNumber, StaggerList, SplitText } from '../motion';
import './PlayerDnaCard.css';

// Fallback-роль, когда нет сезонного распределения позиций (старые данные).
// Без «Универсала» — всегда конкретная роль по группе + доминирующей метрике.
function legacyRole(subject, strengths) {
  const grp = positionGroup(subject);
  const topKey = strengths?.[0]?.key;
  const DEFEND = ['tackle', 'interception', 'recovery', 'duel', 'pressing'];
  if (grp === 'GK') return { name: 'Вратарь', tagline: 'последний рубеж обороны' };
  if (grp === 'DEF') {
    if (topKey === 'keyPass' || topKey === 'gi') return { name: 'Защитник-распасовщик', tagline: 'начинает атаки первым пасом' };
    if (topKey === 'dribble' || topKey === 'distance') return { name: 'Выносящий защитник', tagline: 'выносит мяч вперёд из обороны' };
    return { name: 'Цепкий защитник', tagline: 'выгрызает и выносит, без риска' };
  }
  if (grp === 'MID') {
    if (topKey === 'keyPass') return { name: 'Дирижёр', tagline: 'организует атаки команды' };
    if (DEFEND.includes(topKey)) return { name: 'Разрушитель', tagline: 'выгрызает мячи в центре' };
    return { name: 'Связующий полузащитник', tagline: 'работает в обороне и атаке' };
  }
  if (topKey === 'dribble') return { name: 'Вингер', tagline: 'обыгрывает один в один' };
  if (topKey === 'keyPass') return { name: 'Оттянутый форвард', tagline: 'связывает игру' };
  return { name: 'Наконечник', tagline: 'решает голами' };
}

function colorForPct(pct) {
  if (pct >= 80) return 'var(--rating-excellent)';
  if (pct >= 60) return 'var(--rating-good)';
  if (pct >= 40) return 'var(--rating-ok)';
  if (pct >= 20) return 'var(--rating-weak)';
  return 'var(--rating-poor)';
}

function computeDna(subject, seasonPlayers, basis) {
  // Единый расчёт перцентилей (тот же, что у «Ролевого профиля») — пул = команда
  // без вратарей, per-90 с порогом минут, midrank-перцентиль.
  const base = playerRolePct(subject, seasonPlayers, basis);
  if (!base) return null;
  const { me, ranked, pct } = base;
  const strengths = ranked.filter((r) => r.pct >= 55).slice(0, 4);
  const growth = ranked.filter((r) => r.pct <= 40).slice(-2).reverse();
  // Роль по МЕТРИКАМ (Football Manager-подход): позиции по минутам ограничивают
  // множество ролей, перцентили выбирают лучшую. Без «универсалов». Fallback —
  // если у сезонного агрегата ещё нет распределения позиций.
  const role = rankRoles(me.positions, pct)[0] || legacyRole(subject, strengths.length ? strengths : ranked);
  return { archetype: { name: role.name, tagline: role.tagline }, strengths, growth, top: ranked[0] };
}

// Архетип игрока по методике CIES (имя + tagline) для переиспользования вне
// карточки — например, подпись профиля в плитке состава. null, если данных мало.
export function playerArchetype(subject, seasonPlayers, basis = 90) {
  const dna = computeDna(subject, seasonPlayers, basis);
  return dna?.archetype ?? null;
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
  // Ранготочный бейдж: «Лучший в команде» — ТОЛЬКО при фактическом ранге #1 по
  // сырому per-90 (не по порогу перцентиля — midrank намеренно не даёт 100, и
  // единоличный лидер из 16 получает ~96). Иначе — словесно по перцентилю.
  const superline = top.rank === 1
    ? `Лучший в команде по «${top.label}»`
    : top.pct >= 80
      ? `В числе сильнейших по «${top.label}»`
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
            <span
              className="dna-card__block-sub"
              title="Перцентиль: насколько игрок выше остальных в команде. 100 недостижим — сравнение включает самого игрока, поэтому даже единоличный лидер набирает чуть меньше."
            >выше % команды</span>
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

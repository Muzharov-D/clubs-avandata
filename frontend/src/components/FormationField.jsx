import { useNavigate } from 'react-router-dom';
import { ratingColor, ratingTextColor } from '../utils/colors';
import { findPlayerByShortName, findPlayerByNumber, shortNameFromPlayer } from '../utils/players';
import PlayerPhoto from './PlayerPhoto';
import './FormationField.css';

// Раскладка по группам (сверху — атака, снизу — оборона + ВР).
// Координаты в нормализованной области 0..100 (x — поперёк, y — глубина поля).
const POSITION_GROUPS = [
  // Forwards
  { match: ['Центральный нападающий'], y: 16 },
  { match: ['Левый нападающий', 'Правый нападающий'], y: 22 },
  // Attacking mids
  { match: ['Центральный атакующий полузащитник'], y: 32 },
  // Mids
  { match: ['Левый полузащитник', 'Правый полузащитник', 'Центральный полузащитник', 'Опорный полузащитник'], y: 48 },
  // Defenders
  { match: ['Левый защитник', 'Правый защитник', 'Центральный защитник'], y: 72 },
  // Goalkeeper
  { match: ['Вратарь'], y: 90 },
];

function buildLayout(starters) {
  // Группируем стартеров по позиционным линиям.
  const lines = POSITION_GROUPS.map(() => []);
  const unassigned = [];
  starters.forEach((p) => {
    const slot = p.positionSlot || '';
    const lineIdx = POSITION_GROUPS.findIndex((g) =>
      g.match.some((m) => slot.toLowerCase() === m.toLowerCase())
    );
    if (lineIdx >= 0) lines[lineIdx].push(p);
    else unassigned.push(p);
  });
  // unassigned — допихнём в линию полузащиты
  if (unassigned.length) {
    lines[3] = lines[3].concat(unassigned);
  }
  // Раздаём X равномерно внутри линии. Для left/right/centre — отсортируем по подсказке.
  const placed = [];
  lines.forEach((arr, lineIdx) => {
    if (!arr.length) return;
    const y = POSITION_GROUPS[lineIdx].y;
    const sorted = [...arr].sort((a, b) => positionOrder(a) - positionOrder(b));
    const n = sorted.length;
    sorted.forEach((p, i) => {
      const x = n === 1 ? 50 : 18 + (64 * i) / (n - 1);
      placed.push({ ...p, x, y });
    });
  });
  return placed;
}

function positionOrder(p) {
  const s = (p.positionSlot || '').toLowerCase();
  if (s.includes('лев')) return 0;
  if (s.includes('центр')) return 1;
  if (s.includes('опорн')) return 1;
  if (s.includes('атакующ')) return 1;
  if (s.includes('прав')) return 2;
  return 1;
}

export default function FormationField({
  formation,
  players,
  ourTeamName = 'Наша команда',
  imageSrc,
  imageFullSrc,
}) {
  const navigate = useNavigate();
  // Defensive: backend может вернуть formation.starters не массивом если данные битые.
  // Без этого .forEach в buildLayout кидает TypeError и роняет всю MatchDetail.
  // Парсер иногда возвращает 22 стартующих (дубликаты для разных половин) —
  // ограничиваем до 11 уникальных по номеру/имени.
  const rawStarters = Array.isArray(formation?.starters) ? formation.starters : [];
  const seenStarters = new Set();
  const starters = rawStarters
    .filter((s) => {
      const k = `${s?.number || ''}-${s?.shortName || s?.fullName || ''}`;
      if (seenStarters.has(k)) return false;
      seenStarters.add(k);
      return true;
    })
    .slice(0, 11);
  const rawSubs = Array.isArray(formation?.substitutes) ? formation.substitutes : [];
  const seenSubs = new Set();
  const subs = rawSubs.filter((s) => {
    const k = `${s?.number || ''}-${s?.shortName || s?.fullName || ''}`;
    if (seenSubs.has(k)) return false;
    seenSubs.add(k);
    return true;
  });

  if (starters.length === 0 && imageSrc) {
    return (
      <div className="formation">
        <div className="formation__head">
          <span className="formation__title">Расстановка</span>
          <span className="formation__team">{ourTeamName}</span>
        </div>
        <a
          className="formation__pitch-wrap"
          href={imageFullSrc || imageSrc}
          target="_blank"
          rel="noopener noreferrer"
          title="Открыть в полном размере"
        >
          <img
            src={imageSrc}
            alt={`Расстановка ${ourTeamName}`}
            className="formation__pitch-img"
          />
        </a>
      </div>
    );
  }

  const placed = buildLayout(starters);

  function resolvePlayer(s) {
    return (
      findPlayerByNumber(s.number, players) ||
      findPlayerByShortName(s.shortName, players)
    );
  }

  function go(s) {
    const p = resolvePlayer(s);
    if (p) navigate(`/players/${p.id}`);
  }

  return (
    <div className="formation">
      <div className="formation__head">
        <span className="formation__title">Состав на поле</span>
        <span className="formation__team">{ourTeamName}</span>
      </div>

      <div className="formation__pitch-wrap">
        <svg className="formation__pitch" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a6b3a"/>
              <stop offset="50%" stopColor="#0f5028"/>
              <stop offset="100%" stopColor="#1a6b3a"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#grass)"/>
          {/* Stripes */}
          {[0,1,2,3,4,5,6,7,8,9].map((i) => (
            <rect key={i} x="0" y={i * 10} width="100" height="10"
                  fill={i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'}/>
          ))}
          {/* Outline */}
          <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.4"/>
          {/* Halfway line */}
          <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(255,255,255,0.7)" strokeWidth="0.3"/>
          <circle cx="50" cy="50" r="8" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.3"/>
          <circle cx="50" cy="50" r="0.6" fill="rgba(255,255,255,0.7)"/>
          {/* Penalty boxes */}
          <rect x="22" y="2" width="56" height="14" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.3"/>
          <rect x="36" y="2" width="28" height="6" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.3"/>
          <rect x="22" y="84" width="56" height="14" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.3"/>
          <rect x="36" y="92" width="28" height="6" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.3"/>
        </svg>

        {placed.map((s, idx) => {
          const player = resolvePlayer(s);
          return (
            <div
              key={idx}
              className="formation__slot"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              onClick={() => go(s)}
              role="button"
              title={s.shortName}
            >
              <div className="formation__photo">
                <PlayerPhoto player={player || { firstName: '?', lastName: s.shortName?.split(' ').pop() || '?' }} size={56} />
                <span
                  className="formation__rating"
                  style={{ background: ratingColor(s.rating), color: ratingTextColor(s.rating) }}
                >
                  {s.rating?.toFixed(1) ?? '—'}
                </span>
                {s.goals > 0 && (
                  <span className="formation__goals">⚽{s.goals > 1 ? `×${s.goals}` : ''}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {subs.length > 0 && (
        <div className="formation__subs">
          <div className="formation__subs-title">Запасные</div>
          <div className="formation__subs-row">
            {subs.map((s, i) => {
              const player = resolvePlayer(s);
              // «Кузьма Макаров» → «Макаров К.» — иначе на узкой карточке
              // запасного полное имя обрезается ellipsis'ом до «Кузь...».
              // Если игрок не нашёлся в team list — fallback на оригинальный
              // shortName из formation data.
              const displayName = player ? shortNameFromPlayer(player) : s.shortName;
              return (
                <div key={i} className="formation__sub" onClick={() => go(s)}>
                  <PlayerPhoto player={player || { firstName: '?', lastName: s.shortName?.split(' ').pop() || '?' }} size={42} />
                  <div className="formation__sub-meta">
                    <div className="formation__sub-name">#{s.number} {displayName}</div>
                    <span
                      className="formation__rating formation__rating--sm"
                      style={{ background: ratingColor(s.rating), color: ratingTextColor(s.rating) }}
                    >
                      {s.rating?.toFixed(1) ?? '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

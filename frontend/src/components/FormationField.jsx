import { useNavigate } from 'react-router-dom';
import { ratingColor, ratingTextColor } from '../utils/colors';
import { shortNameFromPlayer } from '../utils/players';
import PlayerPhoto from './PlayerPhoto';
import './FormationField.css';

// Раскладка по группам (сверху — атака, снизу — оборона + ВР).
// Координаты в нормализованной области 0..100 (x — поперёк, y — глубина поля).
// Каждая группа матчится по нескольким сигналам:
//  - russian: полное русское positionSlot (как в PDF formation)
//  - short:   короткие коды (GK/CB/CDM/ST...) из players.position
//  - re:      regex-шаблон для частичного совпадения (нап/защ/...)
// `short` включает английские коды И русские аббревиатуры SportVisor из
// match_players.position (ЦН/ПН/ЛН/ПЦП/ЛЦП/ЦОП/ЦЗ/ЛЗ/ПЗ/ВР) — без них lineFor
// не распознавал позиции и раскидывал всех по жёсткой 1-4-3-3 (битый макет).
const POSITION_GROUPS = [
  // Forwards — y=16
  {
    y: 16,
    russian: ['Центральный нападающий'],
    short:   ['ST', 'CF', 'ЦН', 'НП', 'Н', 'ФРВ'],
    re: /\b(нап|fwd|forward)\b/i,
  },
  // Wide forwards — y=22
  {
    y: 22,
    russian: ['Левый нападающий', 'Правый нападающий', 'Левый вингер', 'Правый вингер'],
    short:   ['LW', 'RW', 'LF', 'RF', 'ПН', 'ЛН', 'ПВ', 'ЛВ', 'ПФ', 'ЛФ'],
    re: /\b(вингер|winger)\b/i,
  },
  // Attacking mids — y=32
  {
    y: 32,
    russian: ['Центральный атакующий полузащитник'],
    short:   ['CAM', 'AM', 'ЦАП', 'АП', 'ПАП', 'ЛАП'],
    re: /\bатак.*полузащ/i,
  },
  // Mids — y=48
  {
    y: 48,
    russian: ['Левый полузащитник', 'Правый полузащитник', 'Центральный полузащитник', 'Опорный полузащитник', 'Центральный опорный полузащитник'],
    short:   ['CM', 'LM', 'RM', 'CDM', 'DM', 'ЦОП', 'ОП', 'ЦП', 'ПЦП', 'ЛЦП', 'ПП', 'ЛП', 'ЦПЗ'],
    re: /\b(полузащ|midfield|опорн)\b/i,
  },
  // Defenders — y=72
  {
    y: 72,
    russian: ['Левый защитник', 'Правый защитник', 'Центральный защитник', 'Левый крайний защитник', 'Правый крайний защитник'],
    short:   ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DEF', 'ЦЗ', 'ЛЗ', 'ПЗ', 'ЛКЗ', 'ПКЗ', 'ЛФЗ', 'ПФЗ'],
    re: /\b(защ|defender|back)\b/i,
  },
  // Goalkeeper — y=90
  {
    y: 90,
    russian: ['Вратарь'],
    short:   ['GK', 'ВР'],
    re: /\b(врат|keeper|goalie)\b/i,
  },
];

// Определяем линию по любому доступному сигналу (positionSlot из PDF
// formation, position/positionFull из роли игрока в players[]).
function lineFor(p) {
  const slot = String(p.positionSlot || '').toLowerCase().trim();
  const posShort = String(p.position || '').toUpperCase().trim();
  const posFull = String(p.positionFull || '').toLowerCase().trim();

  for (let i = 0; i < POSITION_GROUPS.length; i++) {
    const g = POSITION_GROUPS[i];
    if (slot && g.russian.some((m) => slot === m.toLowerCase())) return i;
    if (posShort && g.short.includes(posShort)) return i;
    if (posFull && g.russian.some((m) => posFull === m.toLowerCase() || posFull.includes(m.toLowerCase()))) return i;
    if (g.re && (g.re.test(slot) || g.re.test(posFull))) return i;
  }
  return -1;
}

function buildLayout(starters) {
  // Группируем стартеров по позиционным линиям.
  const lines = POSITION_GROUPS.map(() => []);
  const unassigned = [];
  starters.forEach((p) => {
    const idx = lineFor(p);
    if (idx >= 0) lines[idx].push(p);
    else unassigned.push(p);
  });
  // unassigned — допихнём в линию полузащиты (но если их МНОГО — это сигнал
  // что парсер не понял позиции вообще, тогда раскидаем равномерно: ВР → ЗАЩ
  // → МИД → НАП по количеству unassigned, чтобы хотя бы не было кучи в центре)
  if (unassigned.length) {
    // Если ВСЕ unassigned (типовой случай — positionSlot пустой) — раскидаем
    // равномерно: 1 ВР внизу, ~4 защиты, ~3 полузащиты, ~3 нападения.
    const total = starters.length;
    if (unassigned.length === total && total >= 7) {
      // Простая 1-4-3-3 (или 1-4-4-2 если 11): 1 GK, 4 DEF, 3-4 MID, 2-3 FWD
      const buckets = [
        { idx: 5, count: 1 },                                  // GK
        { idx: 4, count: 4 },                                  // DEF
        { idx: 3, count: total >= 11 ? 3 : Math.max(2, total - 6) }, // MID
        { idx: 1, count: total >= 11 ? 3 : Math.max(0, total - 9) }, // WIDE FWD
      ];
      let cursor = 0;
      for (const b of buckets) {
        for (let i = 0; i < b.count && cursor < unassigned.length; i++, cursor++) {
          lines[b.idx].push(unassigned[cursor]);
        }
      }
      // остаток (если total != 11) → в полузащиту
      while (cursor < unassigned.length) {
        lines[3].push(unassigned[cursor]);
        cursor++;
      }
    } else {
      // Частично заполненный формейшен — остаток в полузащиту
      lines[3] = lines[3].concat(unassigned);
    }
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
  if (s.includes('прав')) return 2;
  if (s.includes('центр') || s.includes('опорн') || s.includes('атакующ')) return 1;
  // Русские коды (ЛЗ/ПН/ЦОП…): первая буква Л=лево, П=право, Ц=центр.
  const code = String(p.position || '').toUpperCase().trim();
  if (code.startsWith('Л')) return 0;
  if (code.startsWith('П')) return 2;
  if (code.startsWith('Ц')) return 1;
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
  // ИСТОЧНИК СОСТАВА — ТОЛЬКО match.players (наша команда: tenant+match-scoped на
  // backend). Чужой игрок сюда физически не попадает. formation.starters из PDF
  // грязный (обе команды вперемешку, дубли номеров, без позиций) — НЕ источник
  // игроков, а лишь подсказка «кто в старте» (по нашим номерам). Объекты игроков,
  // позиции, рейтинги, фото — всегда из ourPlayers. ⇒ чужой в составе невозможен.
  const numOr0 = (v) => {
    const n = v && typeof v === 'object' ? Number(v.value) : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const ourPlayers = (Array.isArray(players) ? players : []).filter((p) => p && p.id);
  const norm = (p) => ({
    ...p,
    rating: numOr0(p.ratings?.overall),
    shortName: shortNameFromPlayer(p) || p.shortName || p.lastName || '',
    goals: numOr0(p.stats?.attack4?.goal),
  });

  const starterNums = new Set(
    (Array.isArray(formation?.starters) ? formation.starters : [])
      .map((s) => Number(s?.number))
      .filter((n) => Number.isFinite(n)),
  );
  const byMinutes = (a, b) => (Number(b?.minutes) || 0) - (Number(a?.minutes) || 0);

  // Стартеры = наши игроки, чьи номера есть в подсказке formation. Если подсказка
  // пустая/битая (<7) — топ-11 по сыгранным минутам (стартеры играют больше).
  let startSet = ourPlayers.filter((p) => starterNums.has(Number(p.number)));
  if (startSet.length < 7) startSet = [...ourPlayers];
  const starters = [...startSet].sort(byMinutes).slice(0, 11).map(norm);
  const starterIds = new Set(starters.map((p) => p.id));
  const subs = ourPlayers.filter((p) => !starterIds.has(p.id)).sort(byMinutes).map(norm);

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

  // s уже является нашим match.player (id, фото, позиция, рейтинг) — резолвить не нужно.
  function resolvePlayer(s) {
    return s;
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
                  {Number(s.rating) > 0 ? s.rating.toFixed(1) : '—'}
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
                      {Number(s.rating) > 0 ? s.rating.toFixed(1) : '—'}
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

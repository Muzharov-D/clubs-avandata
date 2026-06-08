/**
 * CIES-амплуа игрока — классификатор роли по методике CIES Football Observatory.
 *
 * Отличие от FM-движка (`playerRoles.js`): тот подбирает роль по взвешенному fit
 * к сигнатуре «ключевых атрибутов». CIES классифицирует игрока по НАВЫКОВЫМ
 * ОБЛАСТЯМ (skill areas) — завершение, созидание, обыгрыш, отбор, единоборства,
 * беговой объём — и присваивает амплуа по доминирующей области в рамках его линии.
 *
 * Данные: те же сезонные перцентили (0..100), что и «ДНК игрока» / «Ролевой
 * профиль» — единый пул команды, per-90, midrank + байес-сглаживание к 50 по
 * минутам. Поэтому CIES-амплуа консистентно со всеми остальными карточками.
 *
 * Список амплуа и пороги — наш (CIES не публикует «красивых» названий ролей,
 * только позиции + навыковые индексы). При необходимости названия легко правятся
 * в каталоге ниже.
 */
import { playerRolePct, lineOf } from './playerRoles';
import { MATCH_MINUTES_DEFAULT } from './analytics';

// Среднее по присутствующим (null/undefined игнорируем). null, если нет ни одного.
function avg(...vals) {
  const present = vals.filter((v) => v != null && !Number.isNaN(v));
  if (!present.length) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

// Навыковые области CIES из 10 командных перцентилей. gi = голы+пасы — вклад в
// завершение И в созидание (бомбардир-ассистент силён в обоих). Веса — какой
// перцентиль весомее для области.
function ciesAreas(pct) {
  const w = (a, wa, b, wb) => {
    const va = pct[a];
    const vb = pct[b];
    if (va == null && vb == null) return null;
    if (va == null) return vb;
    if (vb == null) return va;
    return (va * wa + vb * wb) / (wa + wb);
  };
  return {
    finishing: w('shots', 0.55, 'gi', 0.45),       // Завершение
    creation: w('keyPass', 0.6, 'gi', 0.4),         // Созидание
    takeon: pct.dribble ?? null,                    // Обыгрыш
    ballwin: avg(pct.tackle, pct.interception, pct.recovery, pct.pressing), // Отбор
    duel: pct.duel ?? null,                         // Единоборства
    engine: pct.distance ?? null,                   // Беговой объём
  };
}

// Группа-линия (GK/DEF/MID/FWD) по детальной линии lineOf.
function groupOf(line) {
  if (line === 'GK') return 'GK';
  if (line.startsWith('DEF')) return 'DEF';
  if (line.startsWith('MID')) return 'MID';
  return 'FWD';
}

// Доминирующая линия игрока по минутам (из распределения позиций сезона).
// Минуты суммируем ПО ГРУППЕ (MID_DEF/MID_C/MID_ATT → один MID), иначе игрок,
// размазанный по подлиниям центра, мог проиграть одной чужой линии с меньшей
// суммой минут. wide — если бо́льшая часть минут группы сыграна на фланге.
// Возвращает { group: GK|DEF|MID|FWD, wide: bool } или null.
function dominantLine(positions) {
  const list = Array.isArray(positions) ? positions.filter((p) => p && p.code && lineOf(p.code)) : [];
  if (!list.length) return null;
  const groupMin = new Map();
  const wideMin = new Map();
  for (const p of list) {
    const ln = lineOf(p.code);
    const g = groupOf(ln);
    const m = Number(p.minutes) || 0;
    groupMin.set(g, (groupMin.get(g) || 0) + m);
    if (ln === 'DEF_W' || ln === 'FWD_W') wideMin.set(g, (wideMin.get(g) || 0) + m);
  }
  const group = [...groupMin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!group) return null;
  const wide = (wideMin.get(group) || 0) > (groupMin.get(group) || 0) / 2;
  return { group, wide };
}

// Выбор «победителя» среди вариантов { score, ...payload }; null-score пропускаем.
function pickTop(options) {
  const valid = options.filter((o) => o.score != null);
  if (!valid.length) return null;
  return valid.sort((a, b) => b.score - a.score)[0];
}

// Каталог CIES-амплуа: линия + доминирующая навыковая область → имя + tagline.
function amplua(group, wide, a) {
  if (group === 'GK') return { name: 'Вратарь', tagline: 'последний рубеж обороны', area: 'goalkeeping' };

  if (group === 'DEF') {
    const top = pickTop([
      { score: avg(a.ballwin, a.duel), name: 'Оборонительный защитник', tagline: 'выгрызает и разрушает', area: 'recovery' },
      { score: a.creation, name: 'Защитник-созидатель', tagline: 'начинает атаки первым пасом', area: 'creation' },
      { score: avg(a.takeon, a.engine), name: wide ? 'Фланговый защитник' : 'Подключающийся защитник', tagline: wide ? 'пашет фланг от штрафной до штрафной' : 'идёт вперёд, помогает в атаке', area: 'takeon' },
    ]);
    return top || { name: 'Оборонительный защитник', tagline: 'выгрызает и разрушает', area: 'recovery' };
  }

  if (group === 'MID') {
    const top = pickTop([
      { score: a.ballwin, name: 'Опорный полузащитник', tagline: 'разрушает перед обороной', area: 'recovery' },
      { score: a.creation, name: 'Диспетчер', tagline: 'созидает и обостряет', area: 'creation' },
      { score: a.finishing, name: 'Атакующий полузащитник', tagline: 'врывается в штрафную и завершает', area: 'finishing' },
      { score: a.engine, name: 'Полузащитник высокого объёма', tagline: 'огромный объём беговой работы', area: 'physical' },
    ]);
    return top || { name: 'Центральный полузащитник', tagline: 'связывает игру', area: 'creation' };
  }

  // FWD
  const top = pickTop([
    { score: a.finishing, name: 'Завершающий нападающий', tagline: 'решает голами в штрафной', area: 'finishing' },
    { score: a.takeon, name: wide ? 'Фланговый нападающий' : 'Нападающий-дриблёр', tagline: 'обыгрывает один в один', area: 'takeon' },
    { score: a.creation, name: 'Оттянутый нападающий', tagline: 'отходит за мячом, связывает игру', area: 'creation' },
  ]);
  return top || { name: 'Завершающий нападающий', tagline: 'решает голами в штрафной', area: 'finishing' };
}

/**
 * CIES-амплуа игрока.
 * @param {Object} subject — игрок (нужен .id).
 * @param {Array} seasonPlayers — сезонный пул (минуты, позиции, метрики).
 * @param {number} basis — длительность матча для per-90 (молодёжь — 80).
 * @returns {{name:string, tagline:string, area:string}|null}
 */
export function ciesArchetype(subject, seasonPlayers, basis = MATCH_MINUTES_DEFAULT) {
  const base = playerRolePct(subject, seasonPlayers, basis);
  if (!base) return null;
  const { pct, positions, meIsGk } = base;
  const line = meIsGk ? { group: 'GK', wide: false } : (dominantLine(positions) || { group: 'MID', wide: false });
  if (line.group === 'GK') return amplua('GK', false, {});
  return amplua(line.group, line.wide, ciesAreas(pct));
}

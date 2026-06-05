/**
 * Best-fit РОЛЬ игрока по МЕТРИКАМ — подход Football Manager.
 * «Универсал» — это не роль, а отсутствие классификации. Поэтому игроку всегда
 * присваивается КОНКРЕТНАЯ роль, которую он по данным исполняет лучше всего.
 *
 * Как считаем:
 *   1. Позиция (с флангом/линией) из mp.position по минутам → набор ДОПУСТИМЫХ
 *      ролей (защитник не может быть наконечником).
 *   2. Каждая роль имеет сигнатуру — какие из 10 метрик её определяют (веса).
 *   3. Fit роли = взвешенное среднее перцентилей игрока по сигнатуре (0..100).
 *   4. Побеждает максимум fit × нуд к доминирующей ЛИНИИ-ГРУППЕ (DEF/MID/FWD),
 *      чтобы роль второстепенной позиции не перебивала основную.
 *
 * Мультипозиционность НЕ теряется: допустимые роли берутся из ВСЕХ сыгранных
 * позиций, но результат — одна точная роль, а список позиций показываем отдельно.
 *
 * Метрики (перцентиль в команде): gi, shots, keyPass, dribble, tackle,
 * interception, recovery, duel, pressing, distance.
 */
import { per90, MIN_RANK_MINUTES, MATCH_MINUTES_DEFAULT } from './analytics';
import { percentileRank } from './num';

// Минуты, при которых перцентилям игрока доверяем «как есть». Меньше — байес-
// сглаживаем к 50 (≈2 полных матча). На 3 разобранных матчах перцентиль
// малоигравшего игрока шумный: 20 минут не дают права на «топ/худший по метрике».
// Сглаживание одинаково для ВСЕХ метрик игрока → порядок метрик и выбранная роль
// не меняются, смягчаются только величины (бары «ДНК», fit ролей).
const MIN_STABLE_MINUTES = 180;

// 10 метрик для перцентиля и сигнатур ролей. Единый источник для «ДНК игрока»
// и «Ролевого профиля» — оба движка считают по этому списку.
export const ROLE_METRICS = [
  { key: 'gi',           label: 'гол+пас',           group: 'attack',  get: (s) => (s.goals || 0) + (s.assists || 0) },
  { key: 'shots',        label: 'удары',             group: 'attack',  get: (s) => s.shots || 0 },
  { key: 'keyPass',      label: 'ключевые передачи', group: 'attack',  get: (s) => s.keyPass || 0 },
  { key: 'dribble',      label: 'обводки',           group: 'attack',  get: (s) => s.dribble || 0 },
  { key: 'tackle',       label: 'отборы',            group: 'defence', get: (s) => s.tackle || 0 },
  { key: 'interception', label: 'перехваты',         group: 'defence', get: (s) => s.interception || 0 },
  { key: 'recovery',     label: 'возвраты',          group: 'defence', get: (s) => s.recovery || 0 },
  { key: 'duel',         label: 'единоборства',      group: 'defence', get: (s) => s.duel || 0 },
  { key: 'pressing',     label: 'прессинг',          group: 'defence', get: (s) => s.pressing || 0 },
  { key: 'distance',     label: 'беговой объём',     group: 'fitness', get: (s) => s.distance || 0 },
];

// Линия позиции по коду SportVisor (кириллица) или латинскому коду.
export function lineOf(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-ZА-ЯЁ]/g, '');
  if (c === 'ВР' || c === 'GK' || c.startsWith('ВРТ')) return 'GK';
  if (/^(ЦЗ|CB|SW)$/.test(c)) return 'DEF_C';
  if (/^(ЛЗ|ПЗ|ЛКЗ|ПКЗ|LB|RB|LWB|RWB)$/.test(c)) return 'DEF_W';
  if (/^(ЦОП|ОПЗ|ВОП|CDM|DM)$/.test(c)) return 'MID_DEF';
  if (/^(ЛЦП|ПЦП|ЛП|ПП|CM|LM|RM)$/.test(c)) return 'MID_C';
  if (/^(ЦАП|CAM|AM)$/.test(c)) return 'MID_ATT';
  if (/^(ЛН|ПН|ЛВ|ПВ|LW|RW)$/.test(c)) return 'FWD_W';
  if (/^(ЦН|ST|CF|SS)$/.test(c)) return 'FWD_C';
  if (c.startsWith('НАП')) return 'FWD_C';
  if (c.startsWith('ЗАЩ')) return 'DEF_C';
  if (c.startsWith('ПОЛ')) return 'MID_C';
  return null; // неизвестный код — НЕ угадываем (бэк такие позиции тоже отбрасывает)
}

// Группа-линия (для нуда к доминирующей зоне) по линии.
function groupOfLine(line) {
  if (line === 'GK') return 'GK';
  if (line.startsWith('DEF')) return 'DEF';
  if (line.startsWith('MID')) return 'MID';
  return 'FWD';
}

// Каталог ролей. sig — веса метрик (важность атрибута для роли, как ключевые
// атрибуты роли в FM). Названия — русские, узнаваемые тренером.
const ROLES = [
  // Вратарь
  { line: 'GK', name: 'Вратарь', tagline: 'последний рубеж обороны', sig: {} },

  // Центральный защитник
  { line: 'DEF_C', name: 'Защитник-распасовщик', tagline: 'начинает атаки первым пасом', sig: { keyPass: 3, gi: 2, recovery: 1, interception: 1 } },
  { line: 'DEF_C', name: 'Цепкий защитник', tagline: 'выгрызает и выносит, без риска', sig: { duel: 3, interception: 2, tackle: 2, recovery: 1 } },
  { line: 'DEF_C', name: 'Выносящий защитник', tagline: 'выносит мяч вперёд из обороны', sig: { dribble: 3, distance: 2, recovery: 1 } },

  // Крайний защитник
  { line: 'DEF_W', name: 'Крайний защитник', tagline: 'надёжно держит фланг', sig: { tackle: 2, interception: 2, recovery: 2, duel: 1 } },
  { line: 'DEF_W', name: 'Латераль', tagline: 'пашет фланг от штрафной до штрафной', sig: { distance: 3, dribble: 2, gi: 2, keyPass: 2 } },

  // Опорная зона
  { line: 'MID_DEF', name: 'Опорник-разрушитель', tagline: 'выгрызает мячи перед обороной', sig: { tackle: 3, interception: 2, recovery: 2, duel: 2, pressing: 1 } },
  { line: 'MID_DEF', name: 'Диспетчер', tagline: 'дирижирует из глубины первым пасом', sig: { keyPass: 3, gi: 2, recovery: 1 } },
  { line: 'MID_DEF', name: 'Опорник-страховка', tagline: 'страхует оборону, играет просто', sig: { interception: 3, recovery: 2, tackle: 1 } },

  // Центр поля
  { line: 'MID_C', name: 'Связующий полузащитник', tagline: 'работает в обороне и атаке, продвигает мяч', sig: { distance: 3, dribble: 2, recovery: 2, gi: 1, duel: 1 } },
  { line: 'MID_C', name: 'Разрушитель', tagline: 'выгрызает мячи в центре', sig: { tackle: 3, interception: 2, duel: 2, recovery: 1 } },
  { line: 'MID_C', name: 'Дирижёр', tagline: 'организует атаки команды', sig: { keyPass: 3, gi: 2, dribble: 1 } },
  { line: 'MID_C', name: 'Челнок', tagline: 'челночит между линиями', sig: { distance: 3, recovery: 2, tackle: 1, keyPass: 1 } },

  // Атакующая полузащита
  { line: 'MID_ATT', name: 'Атакующий полузащитник', tagline: 'играет между линиями, отдаёт последний пас', sig: { keyPass: 3, gi: 2, dribble: 1 } },
  { line: 'MID_ATT', name: 'Врывающийся форвард', tagline: 'врывается в штрафную и завершает', sig: { gi: 3, shots: 2, dribble: 1 } },

  // Фланг атаки
  { line: 'FWD_W', name: 'Вингер', tagline: 'обыгрывает и простреливает с фланга', sig: { dribble: 3, keyPass: 2, distance: 1 } },
  { line: 'FWD_W', name: 'Смещающийся форвард', tagline: 'смещается в центр и бьёт', sig: { gi: 3, shots: 2, dribble: 2 } },

  // Центрфорвард
  { line: 'FWD_C', name: 'Наконечник', tagline: 'живёт в штрафной, решает голами', sig: { gi: 3, shots: 3 } },
  { line: 'FWD_C', name: 'Столб атаки', tagline: 'цепляется и держит мяч впереди', sig: { duel: 3, gi: 1 } },
  { line: 'FWD_C', name: 'Оттянутый форвард', tagline: 'отходит за мячом, связывает игру', sig: { keyPass: 2, gi: 2, dribble: 2 } },
  { line: 'FWD_C', name: 'Форвард-таран', tagline: 'прессингует и таранит оборону', sig: { pressing: 3, distance: 2, duel: 1 } },
];

function roleFit(sig, pct) {
  let sum = 0;
  let w = 0;
  let n = 0;
  for (const key of Object.keys(sig)) {
    const p = pct[key];
    if (p == null) continue;
    sum += p * sig[key];
    w += sig[key];
    n += 1;
  }
  if (w <= 0) return null;
  const fit = sum / w;
  // Штраф за малую размерность сигнатуры: роль с 2 метриками (Наконечник
  // {gi,shots}) не должна системно бить роль с 4-5 только потому, что усредняет
  // меньше осей. Стягиваем к 50 при n<3 — высокий fit узкой роли «остужается».
  const cover = Math.min(1, n / 3);
  return 50 + (fit - 50) * cover;
}

/**
 * Лучшая роль по метрикам.
 * @param {Array<{code:string, minutes:number}>} positions — позиции по минутам.
 * @param {Object<string, number>} pct — перцентиль игрока по метрикам (0..100).
 * @returns {{name, tagline, fit, line}|null}
 */
/**
 * Ранжированный список подходящих ролей (для «Ролевого профиля»), отсортирован
 * по score. Первый = архетип игрока («ДНК»). Один движок для обеих карточек.
 */
export function rankRoles(positions, pct) {
  const list = Array.isArray(positions) ? positions.filter((p) => p && p.code && lineOf(p.code)) : [];
  if (!list.length || !pct) return [];

  // Минуты по линии и по группе-зоне.
  const lineMin = new Map();
  const groupMin = new Map();
  let total = 0;
  for (const p of list) {
    const ln = lineOf(p.code);
    const m = Number(p.minutes) || 0;
    lineMin.set(ln, (lineMin.get(ln) || 0) + m);
    groupMin.set(groupOfLine(ln), (groupMin.get(groupOfLine(ln)) || 0) + m);
    total += m;
  }
  total = total || 1;

  // Вратарь — особняком: если основная линия GK, метрики полевых не применимы.
  const domLine = [...lineMin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (domLine === 'GK') return [{ name: 'Вратарь', tagline: 'последний рубеж обороны', fit: null, line: 'GK', score: 1 }];

  const lines = new Set([...lineMin.keys()]);
  const out = [];
  for (const role of ROLES) {
    if (role.line === 'GK' || !lines.has(role.line)) continue;
    const fit = roleFit(role.sig, pct);
    if (fit == null) continue;
    // Нуд к доминирующей ЗОНЕ (DEF/MID/FWD): роль второстепенной зоны не
    // перебивает основную, кроме явного metric-преимущества (0.25..1.0).
    const groupShare = (groupMin.get(groupOfLine(role.line)) || 0) / total;
    const score = fit * (0.25 + 0.75 * groupShare);
    out.push({ name: role.name, tagline: role.tagline, fit: Math.round(fit), line: role.line, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Лучшая роль по метрикам (первая из rankRoles). */
export function bestRole(positions, pct) {
  return rankRoles(positions, pct)[0] || null;
}

// Вратарь по доминирующей позиции (для исключения из пула полевых метрик).
function isGkRow(s) {
  const code = s?.positionCode
    || (Array.isArray(s?.positions) && s.positions[0]?.code)
    || s?.position;
  return lineOf(code) === 'GK';
}

/**
 * Единый расчёт перцентилей игрока по 10 метрикам (per-90 vs пул команды).
 * Переиспользуется «ДНК игрока» и «Ролевым профилем», чтобы роль и сильные
 * стороны считались ОДИНАКОВО. Вратарей исключаем из пула для полевых метрик.
 * Каждая метрика в `ranked` несёт `rank` (1 = единоличный лидер по сырому per-90)
 * и `poolSize` — для ранготочного бейджа «Лучший в команде».
 * @returns {{me, ranked, pct, positions}|null}
 */
export function playerRolePct(subject, seasonPlayers, basis = MATCH_MINUTES_DEFAULT) {
  if (!subject || !Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return null;
  const me = seasonPlayers.find((s) => s.id === subject.id);
  if (!me || !(me.minutes > 0)) return null;
  const meIsGk = isGkRow(me);
  const pool = seasonPlayers.filter((s) => s.minutes > 0 && (meIsGk || !isGkRow(s)));
  if (pool.length < 4) return null;
  // Доверие к выборке игрока: чем меньше минут, тем сильнее тянем перцентиль к 50.
  const conf = Math.min(1, (Number(me.minutes) || 0) / MIN_STABLE_MINUTES);
  const ranked = [];
  for (const m of ROLE_METRICS) {
    const poolMax = Math.max(0, ...pool.map((s) => Number(m.get(s)) || 0));
    if (poolMax <= 0) continue;
    const my = per90(m.get(me), me.minutes, MIN_RANK_MINUTES, basis);
    const poolVals = pool.map((s) => per90(m.get(s), s.minutes, MIN_RANK_MINUTES, basis));
    const p = percentileRank(my, poolVals);
    if (p == null) continue;
    // Реальный ранг по сырому per-90 (1 = строго лучший в пуле). Перцентиль —
    // midrank и намеренно не достигает 100, поэтому для бейджа «Лучший в команде»
    // нужен явный ранг, а не порог. `rank === 1` только при единоличном лидерстве.
    const better = poolVals.filter((v) => v > my).length;
    const tiedAtTop = poolVals.filter((v) => v === my).length > 1;
    const rank = better === 0 && !tiedAtTop ? 1 : better + 1;
    ranked.push({ key: m.key, label: m.label, group: m.group, rank, poolSize: poolVals.length, raw90: my, pct: Math.round(50 + (p - 50) * conf) });
  }
  if (ranked.length < 3) return null;
  ranked.sort((a, b) => b.pct - a.pct);
  const pct = Object.fromEntries(ranked.map((r) => [r.key, r.pct]));
  // meIsGk: вратарь сравнивается со ВСЕЙ командой (пул не исключает никого),
  // полевой — только с полевыми. Нужно для честной подписи пула в карточках.
  return { me, ranked, pct, positions: me.positions, meIsGk };
}

/**
 * ЕДИНЫЙ источник сезонных перцентилей по 10 метрикам — для «ДНК», «Перцентиль
 * по сезону», сезонной пиццы и текста био. Один пул (без вратарей для полевых),
 * один порог минут (45) и conf-сглаживание → одно число во всех карточках.
 * Раньше каждая карточка считала сама (порог 1 vs 45, вратари в пуле или нет),
 * и «лучший» игрок получал то 96, то 97, то 79, то 81 — это сбивало с толку.
 * Ключи метрик — как в ROLE_METRICS (gi/shots/keyPass/…); карточка со своим
 * списком ищет по ключу. Возвращает null при недостатке данных (как и движок).
 * @returns {{ byKey: Object<string,{pct,raw90,rank,poolSize,label,group}>, poolSize: number, ranked: Array }|null}
 */
export function seasonPercentiles(subject, seasonPlayers, basis = MATCH_MINUTES_DEFAULT) {
  const base = playerRolePct(subject, seasonPlayers, basis);
  if (!base) return null;
  const byKey = Object.fromEntries(base.ranked.map((r) => [r.key, r]));
  return { byKey, poolSize: base.ranked[0]?.poolSize ?? 0, ranked: base.ranked, meIsGk: base.meIsGk };
}

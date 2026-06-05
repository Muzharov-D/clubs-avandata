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
  return 'MID_C'; // дефолт — наименее искажающий
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
  { line: 'MID_C', name: 'Связующий полузащитник', tagline: 'работает в обороне и атаке, носит мяч', sig: { distance: 3, dribble: 2, recovery: 2, gi: 1, duel: 1 } },
  { line: 'MID_C', name: 'Разрушитель', tagline: 'выгрызает мячи в центре', sig: { tackle: 3, interception: 2, duel: 2, recovery: 1 } },
  { line: 'MID_C', name: 'Дирижёр', tagline: 'оркеструет атаки команды', sig: { keyPass: 3, gi: 2, dribble: 1 } },
  { line: 'MID_C', name: 'Челнок', tagline: 'челночит между линиями', sig: { distance: 3, recovery: 2, tackle: 1, keyPass: 1 } },

  // Атакующая полузащита
  { line: 'MID_ATT', name: 'Атакующий полузащитник', tagline: 'играет между линий, последний пас', sig: { keyPass: 3, gi: 2, dribble: 1 } },
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
  for (const key of Object.keys(sig)) {
    const p = pct[key];
    if (p == null) continue;
    sum += p * sig[key];
    w += sig[key];
  }
  return w > 0 ? sum / w : null;
}

/**
 * Лучшая роль по метрикам.
 * @param {Array<{code:string, minutes:number}>} positions — позиции по минутам.
 * @param {Object<string, number>} pct — перцентиль игрока по метрикам (0..100).
 * @returns {{name, tagline, fit, line}|null}
 */
export function bestRole(positions, pct) {
  const list = Array.isArray(positions) ? positions.filter((p) => p && p.code) : [];
  if (!list.length) return null;

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
  if (domLine === 'GK') return { name: 'Вратарь', tagline: 'последний рубеж обороны', fit: null, line: 'GK' };

  const lines = new Set([...lineMin.keys()]);
  let best = null;
  for (const role of ROLES) {
    if (role.line === 'GK' || !lines.has(role.line)) continue;
    const fit = roleFit(role.sig, pct);
    if (fit == null) continue;
    // Нуд к доминирующей ЗОНЕ: роль второстепенной зоны не перебивает основную,
    // но при явном metric-преимуществе всё ещё может выиграть (0.45..1.0).
    const groupShare = (groupMin.get(groupOfLine(role.line)) || 0) / total;
    const score = fit * (0.45 + 0.55 * groupShare);
    if (!best || score > best.score) best = { name: role.name, tagline: role.tagline, fit: Math.round(fit), line: role.line, score };
  }
  return best;
}

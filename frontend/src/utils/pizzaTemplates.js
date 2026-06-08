// Шаблоны метрик для pizza-chart по позициям.
// 28 метрик в каждом шаблоне; расклад групп позиционно-смещённый:
//   FWD = 18 attack / 5 defence / 5 fitness
//   MID = 12 attack / 11 defence / 5 fitness
//   DEF = 7  attack / 16 defence / 5 fitness
// Это сразу показывает фокус игрока по позиции: у защитника много оборонительных,
// у нападающего — атакующих. Кому нужны конкретные группы в отдельности — есть
// фильтр-табы (Все / Атака / Оборона / Фитнес) над пиццей.
//
// Group: 'attack' | 'defence' | 'fitness' — цвет слайса.
// inverse: true — метрика «меньше = лучше» (фолы, ЖК, потери).
//
// Все ключи — РЕАЛЬНЫЕ из player.stats (audit match-001.json):
//   attack1: attackTotal, goalActions, xG, xA, keyPass, assist, secondAssist, thirdAssist
//   attack2: shotAssist, shotOnTargetAssist, intoPenArea, cross, passPacking, throughPass,
//            progressivePass, passToFinalThird, progressiveRun, pass
//   attack3: passForward, passBack, passSideways, passShort, passMiddle, passLong,
//            touchesInPenArea, receivedPass, foulsSuffered, technicalMistake
//   attack4: loseOnOwnHalf, lostBall, dangerousLosesOnOwnHalf, dribble, dribblePacking,
//            dribbleAgainst, goal, shot, freeKick, freeKickShot
//   attack5: directFreeKick, freeKickWithShot, entriesInBox, offside, penalty, byHead,
//            corner, throwing, acceleration
//   defence1: defenceTotal, tackle, slidingTackles, tackleAndRecovery, interception,
//             recovery, clearance, blockedShot
//   defence2: duel, aerialDuel, pressing, counterpressing, foul, yellowCard, redCard,
//             dribbleAgainst, return, returnOnOppHalf
//   defence3: save, goalkeeperExits, shotsAgainst, shotAgainst, goalKick,
//             shortGoalKicks, longGoalKicks
//   fitness:  minutes, fitnessTotal, totalDistance, speed_4_5_5, speed_5_5_7,
//             speed_7plus, intenseRunning, sprintsCount, sprintDistance, averageSpeed

import { num } from './num';

// ─────────────────────────────────────────────────────────────────────────
// ТАРИФ: какие dotted-ключи метрик ПЛАТНЫЕ (вне free-набора 37).
// free = событийные счётчики (голы/удары/отборы/дриблинг/пасы прогрессивные/
// фолы/карты/ошибки/вратарское/стандарты). PAID = физика, xG/xA, владение и
// КАЧЕСТВО/ОБЪЁМ паса (всего/длинные/вперёд/в фин.треть/принятые/разрезающие/
// навесы/касания в штрафной/packing), входы в штрафную, ускорения/прогр. рывок.
// Единый источник истины для пиццы (шаблон/кастом/CIES) и прочих экранов.
export const PAID_PIZZA_KEYS = new Set([
  'attack1.xG', 'attack1.xA',
  'attack2.intoPenArea', 'attack2.cross', 'attack2.passPacking', 'attack2.throughPass',
  'attack2.passToFinalThird', 'attack2.progressiveRun', 'attack2.pass',
  'attack3.passForward', 'attack3.passBack', 'attack3.passSideways', 'attack3.passShort',
  'attack3.passMiddle', 'attack3.passLong', 'attack3.touchesInPenArea', 'attack3.receivedPass',
  'attack4.dribblePacking',
  'attack5.entriesInBox', 'attack5.acceleration',
]);

/** true — метрика платная (физика по префиксу fitness. + список выше). */
export function isPaidStatKey(key) {
  if (!key) return false;
  if (key.startsWith('fitness.')) return true;
  return PAID_PIZZA_KEYS.has(key);
}

export const POSITION_OPTIONS = [
  { value: 'FWD', label: 'Нападающий' },
  { value: 'MID', label: 'Полузащитник' },
  { value: 'DEF', label: 'Защитник' },
  { value: 'GK', label: 'Вратарь' },
];
export const PIZZA_VS_LABEL = 'игроков команды';

export const TEMPLATES = {
  FWD: {
    slices: [
      // ATTACK (18)
      { axis: 'Голы',                       group: 'attack',  key: 'attack4.goal' },
      { axis: 'xG',                         group: 'attack',  key: 'attack1.xG' },
      { axis: 'Ассисты',                    group: 'attack',  key: 'attack1.assist' },
      { axis: 'xA',                         group: 'attack',  key: 'attack1.xA' },
      { axis: 'Голевые действия',           group: 'attack',  key: 'attack1.goalActions' },
      { axis: 'Ключевые передачи',          group: 'attack',  key: 'attack1.keyPass' },
      { axis: 'Передачи под удар',          group: 'attack',  key: 'attack2.shotAssist' },
      { axis: 'Передачи в створ',           group: 'attack',  key: 'attack2.shotOnTargetAssist' },
      { axis: 'Удары',                      group: 'attack',  key: 'attack4.shot' },
      { axis: 'Удары головой',              group: 'attack',  key: 'attack5.byHead' },
      { axis: 'Удары со штрафных',          group: 'attack',  key: 'attack4.freeKickShot' },
      { axis: 'Обводки',                    group: 'attack',  key: 'attack4.dribble' },
      { axis: 'Касания в штрафной',         group: 'attack',  key: 'attack3.touchesInPenArea' },
      { axis: 'Входы в штрафную',           group: 'attack',  key: 'attack5.entriesInBox' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Прогрессивные передачи',     group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Заработанные фолы',          group: 'attack',  key: 'attack3.foulsSuffered' },
      { axis: 'Ускорения',                  group: 'attack',  key: 'attack5.acceleration' },
      // DEFENCE (5)
      { axis: 'Прессинг',                   group: 'defence', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг',              group: 'defence', key: 'defence2.counterpressing' },
      { axis: 'Подборы',                    group: 'defence', key: 'defence1.recovery' },
      { axis: 'Перехваты',                  group: 'defence', key: 'defence1.interception' },
      { axis: 'Возвраты',                   group: 'defence', key: 'defence2.return' },
      // FITNESS (5)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Дистанция спринтов',         group: 'fitness', key: 'fitness.sprintDistance' },
      { axis: 'Спринты',                    group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
      { axis: 'Средняя скорость',           group: 'fitness', key: 'fitness.averageSpeed' },
    ],
  },
  MID: {
    slices: [
      // ATTACK (12)
      { axis: 'Ассисты',                    group: 'attack',  key: 'attack1.assist' },
      { axis: 'xA',                         group: 'attack',  key: 'attack1.xA' },
      { axis: 'xG',                         group: 'attack',  key: 'attack1.xG' },
      { axis: 'Ключевые передачи',          group: 'attack',  key: 'attack1.keyPass' },
      { axis: 'Всего передач',              group: 'attack',  key: 'attack2.pass' },
      { axis: 'Прогрессивные передачи',     group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Длинные передачи',           group: 'attack',  key: 'attack3.passLong' },
      { axis: 'Передачи под удар',          group: 'attack',  key: 'attack2.shotAssist' },
      { axis: 'Обводки',                    group: 'attack',  key: 'attack4.dribble' },
      { axis: 'Навесы',                     group: 'attack',  key: 'attack2.cross' },
      { axis: 'Прогрессивный рывок',        group: 'attack',  key: 'attack2.progressiveRun' },
      // DEFENCE (11) — Фолы инвертированы
      { axis: 'Отборы',                     group: 'defence', key: 'defence1.tackle' },
      { axis: 'Отбор с подбором',           group: 'defence', key: 'defence1.tackleAndRecovery' },
      { axis: 'Перехваты',                  group: 'defence', key: 'defence1.interception' },
      { axis: 'Подборы',                    group: 'defence', key: 'defence1.recovery' },
      { axis: 'Единоборства',               group: 'defence', key: 'defence2.duel' },
      { axis: 'Верховые единоборства',      group: 'defence', key: 'defence2.aerialDuel' },
      { axis: 'Прессинг',                   group: 'defence', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг',              group: 'defence', key: 'defence2.counterpressing' },
      { axis: 'Возвраты',                   group: 'defence', key: 'defence2.return' },
      { axis: 'Возвраты на чужой',          group: 'defence', key: 'defence2.returnOnOppHalf' },
      { axis: 'Фолы',                       group: 'defence', key: 'defence2.foul', inverse: true },
      // FITNESS (5)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Дистанция спринтов',         group: 'fitness', key: 'fitness.sprintDistance' },
      { axis: 'Спринты',                    group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
      { axis: 'Средняя скорость',           group: 'fitness', key: 'fitness.averageSpeed' },
    ],
  },
  DEF: {
    slices: [
      // ATTACK (7) — у защитника атакующие метрики только пасовые/стандарты
      { axis: 'Длинные передачи',           group: 'attack',  key: 'attack3.passLong' },
      { axis: 'Прогрессивные передачи',     group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Всего передач',              group: 'attack',  key: 'attack2.pass' },
      { axis: 'Передачи вперёд',            group: 'attack',  key: 'attack3.passForward' },
      { axis: 'Принятые передачи',          group: 'attack',  key: 'attack3.receivedPass' },
      { axis: 'Угловые',                    group: 'attack',  key: 'attack5.corner' },
      // DEFENCE (16) — Фолы / ЖК / Опасные потери инвертированы
      { axis: 'Отборы',                     group: 'defence', key: 'defence1.tackle' },
      { axis: 'Подкаты',                    group: 'defence', key: 'defence1.slidingTackles' },
      { axis: 'Отбор с подбором',           group: 'defence', key: 'defence1.tackleAndRecovery' },
      { axis: 'Перехваты',                  group: 'defence', key: 'defence1.interception' },
      { axis: 'Подборы',                    group: 'defence', key: 'defence1.recovery' },
      { axis: 'Выносы',                     group: 'defence', key: 'defence1.clearance' },
      { axis: 'Блокированные удары',        group: 'defence', key: 'defence1.blockedShot' },
      { axis: 'Единоборства',               group: 'defence', key: 'defence2.duel' },
      { axis: 'Верховые единоборства',      group: 'defence', key: 'defence2.aerialDuel' },
      { axis: 'Прессинг',                   group: 'defence', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг',              group: 'defence', key: 'defence2.counterpressing' },
      { axis: 'Возвраты',                   group: 'defence', key: 'defence2.return' },
      { axis: 'Возвраты на чужой',          group: 'defence', key: 'defence2.returnOnOppHalf' },
      { axis: 'Фолы',                       group: 'defence', key: 'defence2.foul',                    inverse: true },
      { axis: 'Жёлтые карточки',            group: 'defence', key: 'defence2.yellowCard',              inverse: true },
      { axis: 'Опасные потери у ворот',     group: 'defence', key: 'attack4.dangerousLosesOnOwnHalf',  inverse: true },
      // FITNESS (5)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Дистанция спринтов',         group: 'fitness', key: 'fitness.sprintDistance' },
      { axis: 'Спринты',                    group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
      { axis: 'Средняя скорость',           group: 'fitness', key: 'fitness.averageSpeed' },
    ],
  },
  GK: {
    slices: [
      // ВРАТАРСКОЕ (defence3) — основной профиль голкипера
      { axis: 'Сейвы',                      group: 'defence', key: 'defence3.save' },
      { axis: 'Удары по воротам',           group: 'defence', key: 'defence3.shotsAgainst', inverse: true },
      { axis: 'Выходы вратаря',             group: 'defence', key: 'defence3.goalkeeperExits' },
      { axis: 'От ворот',                   group: 'defence', key: 'defence3.goalKick' },
      { axis: 'Короткие от ворот',          group: 'defence', key: 'defence3.shortGoalKicks' },
      { axis: 'Длинные от ворот',           group: 'defence', key: 'defence3.longGoalKicks' },
      // ОБОРОНА ПОЛЯ
      { axis: 'Выносы',                     group: 'defence', key: 'defence1.clearance' },
      { axis: 'Перехваты',                  group: 'defence', key: 'defence1.interception' },
      { axis: 'Верховые единоборства',      group: 'defence', key: 'defence2.aerialDuel' },
      // ИГРА НОГАМИ (attack)
      { axis: 'Всего передач',              group: 'attack',  key: 'attack2.pass' },
      { axis: 'Длинные передачи',           group: 'attack',  key: 'attack3.passLong' },
      { axis: 'Передачи вперёд',            group: 'attack',  key: 'attack3.passForward' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Принятые передачи',          group: 'attack',  key: 'attack3.receivedPass' },
      // ФИТНЕС
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Средняя скорость',           group: 'fitness', key: 'fitness.averageSpeed' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// КАТАЛОГ МЕТРИК ПО CIES — для свободного выбора показателей в пицце.
// CIES Football Observatory оценивает игрока по навыковым областям (а не по
// «позиции»): завершение, созидание, распасовка, обыгрыш, отбор, оборона,
// вратарское, фитнес. Тренер собирает свою пиццу из ЛЮБЫХ собранных метрик,
// сгруппированных по этим областям. `color` — группа для цвета слайса
// (attack/defence/fitness), `key` — реальный dotted-key из player.stats.
// ─────────────────────────────────────────────────────────────────────────
export const CIES_GROUPS = [
  {
    id: 'finishing', label: 'Завершение', color: 'attack',
    metrics: [
      { axis: 'Голы', key: 'attack4.goal' },
      { axis: 'xG', key: 'attack1.xG' },
      { axis: 'Голевые действия', key: 'attack1.goalActions' },
      { axis: 'Удары', key: 'attack4.shot' },
      { axis: 'Удары головой', key: 'attack5.byHead' },
      { axis: 'Удары со штрафных', key: 'attack4.freeKickShot' },
      { axis: 'Касания в штрафной', key: 'attack3.touchesInPenArea' },
      { axis: 'Входы в штрафную', key: 'attack5.entriesInBox' },
    ],
  },
  {
    id: 'creation', label: 'Созидание', color: 'attack',
    metrics: [
      { axis: 'Ассисты', key: 'attack1.assist' },
      { axis: 'xA', key: 'attack1.xA' },
      { axis: 'Ключевые передачи', key: 'attack1.keyPass' },
      { axis: 'Передачи под удар', key: 'attack2.shotAssist' },
      { axis: 'Передачи в створ', key: 'attack2.shotOnTargetAssist' },
      { axis: 'Второй ассист', key: 'attack1.secondAssist' },
      { axis: 'Навесы', key: 'attack2.cross' },
    ],
  },
  {
    id: 'distribution', label: 'Распасовка', color: 'attack',
    metrics: [
      { axis: 'Всего передач', key: 'attack2.pass' },
      { axis: 'Прогрессивные передачи', key: 'attack2.progressivePass' },
      { axis: 'Передачи в фин. треть', key: 'attack2.passToFinalThird' },
      { axis: 'Разрезающие передачи', key: 'attack2.throughPass' },
      { axis: 'Длинные передачи', key: 'attack3.passLong' },
      { axis: 'Передачи вперёд', key: 'attack3.passForward' },
      { axis: 'Принятые передачи', key: 'attack3.receivedPass' },
    ],
  },
  {
    id: 'takeon', label: 'Обыгрыш', color: 'attack',
    metrics: [
      { axis: 'Обводки', key: 'attack4.dribble' },
      { axis: 'Прогрессивный рывок', key: 'attack2.progressiveRun' },
      { axis: 'Ускорения', key: 'attack5.acceleration' },
      { axis: 'Заработанные фолы', key: 'attack3.foulsSuffered' },
    ],
  },
  {
    id: 'recovery', label: 'Отбор мяча', color: 'defence',
    metrics: [
      { axis: 'Отборы', key: 'defence1.tackle' },
      { axis: 'Отбор с подбором', key: 'defence1.tackleAndRecovery' },
      { axis: 'Перехваты', key: 'defence1.interception' },
      { axis: 'Подборы', key: 'defence1.recovery' },
      { axis: 'Прессинг', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг', key: 'defence2.counterpressing' },
      { axis: 'Возвраты', key: 'defence2.return' },
      { axis: 'Возвраты на чужой', key: 'defence2.returnOnOppHalf' },
    ],
  },
  {
    id: 'defending', label: 'Оборона', color: 'defence',
    metrics: [
      { axis: 'Подкаты', key: 'defence1.slidingTackles' },
      { axis: 'Выносы', key: 'defence1.clearance' },
      { axis: 'Блокированные удары', key: 'defence1.blockedShot' },
      { axis: 'Единоборства', key: 'defence2.duel' },
      { axis: 'Верховые единоборства', key: 'defence2.aerialDuel' },
      { axis: 'Фолы', key: 'defence2.foul', inverse: true },
      { axis: 'Жёлтые карточки', key: 'defence2.yellowCard', inverse: true },
      { axis: 'Опасные потери у ворот', key: 'attack4.dangerousLosesOnOwnHalf', inverse: true },
    ],
  },
  {
    id: 'goalkeeping', label: 'Вратарское', color: 'defence',
    metrics: [
      { axis: 'Сейвы', key: 'defence3.save' },
      { axis: 'Выходы вратаря', key: 'defence3.goalkeeperExits' },
      { axis: 'Удары по воротам', key: 'defence3.shotsAgainst', inverse: true },
      { axis: 'От ворот', key: 'defence3.goalKick' },
      { axis: 'Короткие от ворот', key: 'defence3.shortGoalKicks' },
      { axis: 'Длинные от ворот', key: 'defence3.longGoalKicks' },
    ],
  },
  {
    id: 'physical', label: 'Фитнес', color: 'fitness',
    metrics: [
      { axis: 'Общая дистанция', key: 'fitness.totalDistance' },
      { axis: 'Дистанция спринтов', key: 'fitness.sprintDistance' },
      { axis: 'Спринты', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег', key: 'fitness.intenseRunning' },
      { axis: 'Средняя скорость', key: 'fitness.averageSpeed' },
    ],
  },
];

// Плоская мапа key → { axis, color, inverse } для быстрого построения слайсов.
export const CIES_METRIC_BY_KEY = CIES_GROUPS.reduce((acc, g) => {
  for (const m of g.metrics) acc[m.key] = { axis: m.axis, color: g.color, inverse: !!m.inverse, group: g.id };
  return acc;
}, {});

// Достаём value по dotted-key из player.stats
export function getStatValue(player, key) {
  if (!player?.stats || !key) return null;
  const parts = key.split('.');
  let cur = player.stats;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return num(cur);
}

// Группировка позиции игрока в FWD/MID/DEF.
// player.positionFull — обычно русское ("Нападающий", "Центральный защитник");
// player.position — короткий код (CF/CM/CB/GK и т.п.)
export function positionGroup(player) {
  const full = (player?.positionFull || '').toLowerCase();
  if (full.includes('напад')) return 'FWD';
  if (full.includes('полуз')) return 'MID';
  if (full.includes('защит')) return 'DEF';
  if (full.includes('вратар')) return 'GK';

  const code = (player?.position || '').toUpperCase();
  if (/^(ST|CF|SS|LW|RW)$/.test(code)) return 'FWD';
  if (/^(CM|CDM|CAM|DM|AM|LM|RM)$/.test(code)) return 'MID';
  if (/^(CB|LB|RB|LWB|RWB|SW)$/.test(code)) return 'DEF';
  if (code === 'GK' || code === 'ВР') return 'GK';

  // Кириллические коды SportVisor (ЦЗ/ПЦП/ЛН/ВР…): значима последняя буква
  // (Р→вратарь, З→защита, П→полузащита, Н→нападение) — иначе ЛН (нападающий)
  // уходил бы в дефолтную полузащиту, и архетип CIES «съезжал».
  const cyr = code.replace(/[^А-ЯЁ]/g, '');
  // FFSPB 3-буквенные коды (значима ПЕРВАЯ буква): НАП/ЗАЩ/ПОЛ/ВРТ — ДО эвристики
  // «по последней букве», иначе НАП (last П)→MID, ЗАЩ (last Щ)→дефолт MID.
  // Должно совпадать с posGroup на /club и posFullFromCode на бэке.
  if (cyr.startsWith('ВРТ')) return 'GK';
  if (cyr.startsWith('НАП')) return 'FWD';
  if (cyr.startsWith('ЗАЩ')) return 'DEF';
  if (cyr.startsWith('ПОЛ')) return 'MID';
  if (cyr) {
    if (cyr === 'ВР') return 'GK';
    const last = cyr[cyr.length - 1];
    if (last === 'Р') return 'GK';
    if (last === 'З') return 'DEF';
    if (last === 'П') return 'MID';
    if (last === 'Н') return 'FWD';
  }

  return 'MID'; // дефолт — наименее искажающий
}

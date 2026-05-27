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

export const POSITION_OPTIONS = [
  { value: 'FWD', label: 'Нападающий' },
  { value: 'MID', label: 'Полузащитник' },
  { value: 'DEF', label: 'Защитник' },
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
};

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
  if (full.includes('вратар')) return null; // GK — отдельный шаблон когда добавим

  const code = (player?.position || '').toUpperCase();
  if (/^(ST|CF|SS|LW|RW)$/.test(code)) return 'FWD';
  if (/^(CM|CDM|CAM|DM|AM|LM|RM)$/.test(code)) return 'MID';
  if (/^(CB|LB|RB|LWB|RWB|SW)$/.test(code)) return 'DEF';
  if (code === 'GK') return null;

  return 'MID'; // дефолт — наименее искажающий
}

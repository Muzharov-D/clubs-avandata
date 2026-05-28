/**
 * Adapter: rich PDF flat stats → Легирус-shape stats (для PlayerDetail.jsx).
 *
 * Наш rich parser даёт:
 *   stats.attack:  {goal, shot, pass, keyPass, ...flat 38 полей}
 *   stats.defence: {tackle, interception, recovery, save, ...flat 20 полей}
 *   stats.fitness: {totalDistance, sprintsCount, ...}
 *
 * Compound значения: {total, accuracy, successful} либо {value, total, accuracy}.
 *
 * PlayerDetail.jsx ждёт:
 *   stats.attack1.{goal,shot,assist,keyPass,goalActions,...}
 *   stats.attack2.{progressivePass,passToFinalThird,cross,...}
 *   stats.attack3.{passForward,passBack,passShort,passMiddle,passLong,...}
 *   stats.attack4.{goal,shot,dribble,freeKick,freeKickShot,...}
 *   stats.attack5.{byHead,entriesInBox,corner,throwing,offside,...}
 *   stats.defence1.{tackle,interception,recovery,clearance,blockedShot,...}
 *   stats.defence2.{duel,aerialDuel,pressing,counterpressing,...}
 *   stats.defence3.{save,goalkeeperExits,shotsAgainst,goalKick,...}
 *   stats.fitness.{minutes,totalDistance,...}
 *
 * Также ratings → 0-10, минуты → number, position → ВР/ЦЗ/ПЗ/ЦН/etc.
 */
type AnyObj = Record<string, unknown>;

/** Unwrap compound value → scalar (successful || value || total). */
function unwrap(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const o = v as AnyObj;
    const s = o.successful as number | undefined;
    if (typeof s === 'number') return s;
    const val = o.value as number | undefined;
    if (typeof val === 'number') return val;
    const t = o.total as number | undefined;
    if (typeof t === 'number') return t;
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** «Total» компонента для метрик-попыток (удары, кроссы и т.п.). */
function unwrapTotal(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const o = v as AnyObj;
    const t = o.total as number | undefined;
    if (typeof t === 'number') return t;
    return unwrap(v);
  }
  return Number(v) || 0;
}

/** Maps SportVisor Russian position → full Russian label for hero. */
const POSITION_FULL: Record<string, string> = {
  ВР: 'Вратарь',
  ЦЗ: 'Центральный защитник',
  ЛЗ: 'Левый защитник',
  ПЗ: 'Правый защитник',
  ЛКЗ: 'Левый крайний защитник',
  ПКЗ: 'Правый крайний защитник',
  ЦОП: 'Центральный опорный полузащитник',
  ОПЗ: 'Опорный полузащитник',
  ЛЦП: 'Левый центральный полузащитник',
  ПЦП: 'Правый центральный полузащитник',
  ЦН: 'Центральный нападающий',
  ЛН: 'Левый нападающий',
  ПН: 'Правый нападающий',
  ЛВ: 'Левый вингер',
  ПВ: 'Правый вингер',
  ВОП: 'Выдвинутый опорный полузащитник',
  КАП: 'Капитан',
};

/**
 * Преобразует один match_player в Легирус-shape объект.
 * Принимает row из SELECT ... FROM match_players (уже camelCased).
 */
export function adaptPlayerForLegirus(mp: AnyObj): AnyObj {
  const rawStats = (mp.stats as AnyObj | null) ?? {};
  const A = (rawStats.attack  as AnyObj | null) ?? {};
  const D = (rawStats.defence as AnyObj | null) ?? {};
  const F = (rawStats.fitness as AnyObj | null) ?? {};

  // Helper: вытащить scalar по ключу из flat group.
  const a  = (k: string) => unwrap(A[k]);
  const aT = (k: string) => unwrapTotal(A[k]);
  const d  = (k: string) => unwrap(D[k]);
  const f  = (k: string) => unwrap(F[k]);

  // Legirus-shape stats.
  const stats = {
    // attack1 — главные показатели атаки
    attack1: {
      attackTotal:  Number((mp.ratings as AnyObj)?.attack ?? 0),
      goalActions:  a('goalActions'),
      goal:         a('goal'),
      assist:       a('assist'),
      secondAssist: a('secondAssist'),
      thirdAssist:  a('thirdAssist'),
      keyPass:      a('keyPass'),
      xG:           0,  // SportVisor U-15 не отдаёт xG
      xA:           0,
    },
    // attack2 — конструктивные пасы
    attack2: {
      shotAssist:         a('passOnTarget'),
      shotOnTargetAssist: a('passOnTarget'),
      intoPenArea:        a('intoPenArea'),
      cross:              a('cross'),
      passPacking:        a('passProgressing'),
      throughPass:        a('passProgressing'),
      progressivePass:    a('progressivePass'),
      passToFinalThird:   a('passToFinalThird'),
      progressiveRun:     a('dribbleProgressing'),
      pass:               a('pass'),
    },
    // attack3 — раскладка пасов и владение
    attack3: {
      passForward:      a('passForward'),
      passBack:         a('passBack'),
      passSideways:     a('passSideways'),
      passShort:        a('passShort'),
      passMiddle:       a('passMiddle'),
      passLong:         a('passLong'),
      touchesInPenArea: a('touchesInPenArea'),
      receivedPass:     a('receivedPass'),
      foulsSuffered:    a('foulsSuffered'),
      technicalMistake: a('technicalMistake'),
    },
    // attack4 — голы, удары, дриблинг, потери
    attack4: {
      goal:                    a('goal'),
      shot:                    aT('shot'),
      freeKick:                a('freeKick'),
      freeKickShot:            a('freeKickShot'),
      dribble:                 a('dribble'),
      dribblePacking:          a('dribbleProgressing'),
      dribbleAgainst:          d('dribbleAgainst'),
      loseOnOwnHalf:           a('loseOnOwnHalf'),
      lostBall:                a('lostBall'),
      dangerousLosesOnOwnHalf: a('dangerousLosesOnOwnHalf'),
    },
    // attack5 — стандарты и доп.
    attack5: {
      directFreeKick:    a('directFreeKick'),
      freeKickWithShot:  a('freeKickShot'),
      entriesInBox:      a('entriesInBox'),
      offside:           a('offside'),
      penalty:           a('penalty'),
      byHead:            a('byHead'),
      corner:            a('corner'),
      throwing:          a('throwing'),
      acceleration:      f('sprintsCount'),
    },
    // defence1 — отборы, перехваты, выносы
    defence1: {
      defenceTotal:      Number((mp.ratings as AnyObj)?.defence ?? 0),
      tackle:            d('tackle'),
      slidingTackles:    d('slidingTackles'),
      tackleAndRecovery: d('recovery'),
      interception:      d('interception'),
      recovery:          d('recovery'),
      clearance:         d('clearance'),
      blockedShot:       d('blockedShot'),
    },
    // defence2 — дуэли, прессинг
    defence2: {
      duel:            d('duel'),
      aerialDuel:      d('aerialDuel'),
      pressing:        d('pressing'),
      counterpressing: d('counterpressing'),
      foul:            0,
      yellowCard:      0,
      redCard:         0,
      dribbleAgainst:  d('dribbleAgainst'),
      return:          d('recovery'),
      returnOnOppHalf: d('recoveryOpp'),
    },
    // defence3 — вратарь
    defence3: {
      save:            d('save'),
      goalkeeperExits: d('goalkeeperExits'),
      shotsAgainst:    d('shotsAgainst'),
      shotAgainst:     d('shotsAgainst'),
      goalKick:        d('goalKick'),
      shortGoalKicks:  d('shortGoalKicks'),
      longGoalKicks:   d('longGoalKicks'),
    },
    // fitness — без изменений (наш парсер уже даёт правильные ключи)
    fitness: {
      minutes:        Number(mp.minutes ?? 0),
      fitnessTotal:   Number((mp.ratings as AnyObj)?.fitness ?? 0),
      totalDistance:  f('totalDistance'),
      speed_4_5_5:    f('speed_4_5_5'),
      speed_5_5_7:    f('speed_5_5_7'),
      speed_7plus:    f('speed_7plus'),
      sprintDistance: f('sprintDistance'),
      sprintsCount:   f('sprintsCount'),
      intenseRunning: f('intenseRunning'),
      averageSpeed:   f('averageSpeed'),
    },
  };

  const position = String(mp.position ?? '').toUpperCase();
  const positionFull = mp.positionFull ?? POSITION_FULL[position] ?? position;

  // Maps: crop_all_b64 даёт {attackMap, heatmap}, но legacy PlayerDetail.jsx
  // читает player.maps.fitnessHeatmap — нормализуем оба ключа.
  const rawMaps = (mp.maps as AnyObj | null) ?? {};
  const maps = {
    attackMap:      rawMaps.attackMap as string | undefined,
    fitnessHeatmap: (rawMaps.fitnessHeatmap as string | undefined)
                    ?? (rawMaps.heatmap as string | undefined),
    heatmap:        rawMaps.heatmap as string | undefined,
  };

  return {
    ...mp,
    position,
    positionFull,
    stats,
    maps,
  };
}

/** Adapt entire match: players[].stats → Легирус-shape. */
export function adaptMatchForLegirus(match: AnyObj): AnyObj {
  const players = (match.players as AnyObj[]) ?? [];
  return {
    ...match,
    players: players.map(adaptPlayerForLegirus),
  };
}

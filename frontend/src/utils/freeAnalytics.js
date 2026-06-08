// free-аналитика — единый источник истины для free-нативных дашбордов.
//
// Идея: free — не «paid с дырками», а самостоятельный продукт на ЧЕСТНОМ наборе
// метрик SportVisor, которые реально доходят до игрока/команды. Здесь — деривативы
// (конверсия, сохранность мяча, оборонительная надёжность), собранные ТОЛЬКО из
// подтверждённых free-ключей (источник — backend/src/data/legirusAdapter.ts).
//
// ВАЖНО (проверено по адаптеру): на уровне ИГРОКА фолы/ЖК/КК = 0 (хардкод),
// xG/xA/fitness — платные, автоголы/позиц.ошибки/грубые ошибки/упущенные моменты
// в player.stats НЕ маппятся. Поэтому здесь их НЕТ — иначе блок был бы пустым.
// Доступные «теневые» (негативные) free-метрики игрока: потери мяча, технический
// брак, опасные потери у своих ворот, обыгран 1в1, офсайды.

import { num } from './num';
import { getStatValue } from './pizzaTemplates';

// Сумма по списку dotted-ключей (NaN → 0).
function sumKeys(stats, keys) {
  const player = { stats };
  return keys.reduce((acc, k) => acc + (Number(num(getStatValue(player, k))) || 0), 0);
}

const SHOT_KEY = 'attack4.shot';
const GOAL_KEY = 'attack4.goal';
const ASSIST_KEY = 'attack1.assist';
const KEYPASS_KEYS = ['attack1.keyPass', 'attack2.shotAssist'];
const DEF_ACTION_KEYS = [
  'defence1.tackle', 'defence1.interception', 'defence1.recovery',
  'defence1.clearance', 'defence1.blockedShot',
];
const LOSS_KEYS = ['attack4.lostBall', 'attack3.technicalMistake', 'attack4.loseOnOwnHalf'];
const BEATEN_KEY = 'defence2.dribbleAgainst';
const DANGER_LOSS_KEY = 'attack4.dangerousLosesOnOwnHalf';

/**
 * Деривативы эффективности/надёжности игрока из честных free-метрик.
 * Все ratio — null, если знаменатель 0 (не выдумываем числа).
 * @param {object} stats — player.stats (структура attack1../defence1..).
 */
export function freePlayerImpact(stats) {
  if (!stats) return null;
  const player = { stats };
  const goals = Number(num(getStatValue(player, GOAL_KEY))) || 0;
  const shots = Number(num(getStatValue(player, SHOT_KEY))) || 0;
  const assists = Number(num(getStatValue(player, ASSIST_KEY))) || 0;
  const chances = sumKeys(stats, KEYPASS_KEYS);
  const defActions = sumKeys(stats, DEF_ACTION_KEYS);
  const losses = sumKeys(stats, LOSS_KEYS);
  const beaten = Number(num(getStatValue(player, BEATEN_KEY))) || 0;
  const dangerLosses = Number(num(getStatValue(player, DANGER_LOSS_KEY))) || 0;

  return {
    goals,
    shots,
    assists,
    chances,                // острые передачи (ключевые + под удар)
    goalContributions: goals + assists,
    defActions,
    losses,
    beaten,
    dangerLosses,
    // Конверсия ударов: голы / удары (только если бил).
    shotConversion: shots > 0 ? goals / shots : null,
    // Оборонительная надёжность: доля выигранных оборонительных эпизодов
    // (отбор/перехват/подбор/вынос/блок) в сумме с тем, где обыграли.
    defReliability: (defActions + beaten) > 0 ? defActions / (defActions + beaten) : null,
  };
}

/** true — у игрока есть хоть какая-то free-активность для этого блока. */
export function hasFreeImpact(impact) {
  if (!impact) return false;
  return (impact.shots + impact.goalContributions + impact.chances
    + impact.defActions + impact.losses + impact.beaten) > 0;
}

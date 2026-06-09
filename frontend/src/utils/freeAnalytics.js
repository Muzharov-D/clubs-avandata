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
import { ourSideKey } from './analytics/xg';

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
// loseOnOwnHalf — ПОДМНОЖЕСТВО lostBall (потери именно на своей половине), не
// складываем оба, иначе двойной счёт. Берём общие потери + технический брак.
const LOSS_KEYS = ['attack4.lostBall', 'attack3.technicalMistake'];
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
    + impact.defActions + impact.losses + impact.beaten + impact.dangerLosses) > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// СЕЗОННАЯ эффективность игрока — из ПЛОСКОГО сезонного субъекта (seasonPlayers
// entry: {goals, assists, shots, keyPass, dribble, tackle, interception,
// recovery, duel, pressing, ...}). Это НЕ dotted player.stats — у сезонного
// агрегата другая (плоская) форма, поэтому отдельный деривант.
// ─────────────────────────────────────────────────────────────────────────
export function freeSeasonImpact(flat) {
  if (!flat) return null;
  const n = (k) => Number(num(flat[k])) || 0;
  const goals = n('goals'), assists = n('assists'), shots = n('shots');
  const keyPass = n('keyPass'), dribble = n('dribble');
  const defActions = n('tackle') + n('interception') + n('recovery');
  if ((goals + assists + shots + keyPass + dribble + defActions) <= 0) return null;
  return {
    goals, assists, shots, keyPass, dribble, defActions,
    goalContributions: goals + assists,
    duels: n('duel'),
    pressing: n('pressing'),
    shotConversion: shots > 0 ? goals / shots : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// КОМАНДНАЯ сезонная эффективность/дисциплина — из teamAggregates (agg вид
// { section: { field: number | {value|pct} } }). Берём ТОЛЬКО free-поля.
// Значения — средние за матч (так приходит агрегат); конверсия — из средних.
// ─────────────────────────────────────────────────────────────────────────
function aggVal(section, ...keys) {
  if (!section) return 0;
  for (const k of keys) {
    const v = section[k];
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v.value === 'number') return v.value;
  }
  return 0;
}

export function freeTeamSeason(teamAggregates) {
  if (!teamAggregates) return null;
  const shooting = teamAggregates.shooting || {};
  const positioning = teamAggregates.positioning || {};
  const setPieces = teamAggregates.setPieces || {};
  const recov = teamAggregates.recoveriesAndTackling || {};

  const shots = aggVal(shooting, 'shots', 'totalShots');
  const onTarget = aggVal(shooting, 'onTarget', 'shotsOnTarget');
  const goals = aggVal(shooting, 'goals');
  const fouls = aggVal(positioning, 'fouls');
  const yellow = aggVal(positioning, 'yellowCard');
  const red = aggVal(positioning, 'redCard');
  const offsides = aggVal(positioning, 'offsides') || aggVal(setPieces, 'offsides');
  const corners = aggVal(setPieces, 'corner', 'corners');
  const tackles = aggVal(recov, 'tackle');
  const interceptions = aggVal(positioning, 'interceptions') || aggVal(recov, 'interception');

  const has = shots + goals + fouls + corners + tackles > 0;
  if (!has) return null;
  return {
    shots, onTarget, goals, fouls, yellow, red, offsides, corners, tackles, interceptions,
    shotConversion: shots > 0 ? goals / shots : null,
    shotAccuracy: shots > 0 ? onTarget / shots : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// СЛОВЕСНЫЕ ВЫВОДЫ МАТЧА на free — rule-based из честных free-метрик. Цель
// (CLAUDE.md): дать тренеру ВЫВОД словами, а не сырое число. Числа всегда
// показываем рядом — тренер видит основание. Пороги — только на однозначных
// крайностях (реализация 0 при многих ударах = явно низкая), не «магия».
// Возврат: [{ tone:'good'|'warn'|'neutral', icon, text, weight }] (топ-5).
// ─────────────────────────────────────────────────────────────────────────
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function freeMatchInsights(match) {
  const out = [];
  if (!match) return out;
  // Без признака нашей стороны (homeTeam/awayTeam.isOurTeam) ourSideKey по дефолту
  // даёт 'home' → голы/пропущенные могут перепутаться. Лучше не выводить, чем врать.
  if (!match.homeTeam && !match.awayTeam) return out;
  const { our } = ourSideKey(match);
  const side = match?.teamSummaryStats?.[our] || {};
  const homeIsUs = our === 'home';
  const goals = Number(homeIsUs ? match.scoreHome : match.scoreAway) || 0;
  const conceded = Number(homeIsUs ? match.scoreAway : match.scoreHome) || 0;

  const shots = Number(num(side.shots?.total)) || 0;
  const onTarget = Number(num(side.shots?.onTarget)) || 0;
  const corners = Number(num(side.corners?.total)) || 0;
  const fouls = Number(num(side.fouls)) || 0;
  const yellow = Number(num(side.yellowCards)) || 0;
  const red = Number(num(side.redCards)) || 0;

  // Командные суммы из состава (free per-player).
  const players = match.players || [];
  const sum = (g, k) => players.reduce((a, p) => a + (Number(num(getStatValue(p, `${g}.${k}`))) || 0), 0);
  const duelsWon = sum('defence2', 'duel');
  const beaten = sum('defence2', 'dribbleAgainst');
  const tackles = sum('defence1', 'tackle');
  const dangerLoss = sum('attack4', 'dangerousLosesOnOwnHalf');

  // 1. Реализация ударов.
  if (shots >= 5) {
    const conv = goals / shots;
    if (goals > 0 && conv >= 0.20) {
      out.push({ tone: 'good', icon: '🎯', weight: 9, text: `Острая реализация — ${goals} ${plural(goals, 'гол', 'гола', 'голов')} из ${shots} ${plural(shots, 'удара', 'ударов', 'ударов')}.` });
    } else if (shots >= 8 && conv < 0.10) {
      out.push({ tone: 'warn', icon: '🎯', weight: 8, text: `Реализация подвела — ${shots} ударов, лишь ${goals} ${plural(goals, 'гол', 'гола', 'голов')}.` });
    }
  }

  // 2. Прицел (доля в створ).
  if (shots >= 5) {
    const acc = onTarget / shots;
    if (acc >= 0.5) {
      out.push({ tone: 'good', icon: '👁', weight: 6, text: `Хороший прицел — ${onTarget} из ${shots} ударов в створ.` });
    } else if (shots >= 8 && acc < 0.3) {
      out.push({ tone: 'warn', icon: '👁', weight: 5, text: `Мало в створ — ${onTarget} из ${shots}.` });
    }
  }

  // 3. Единоборства 1в1 (выиграно vs обыграли нас).
  if (duelsWon + beaten >= 6) {
    if (duelsWon > beaten * 1.3) {
      out.push({ tone: 'good', icon: '🛡', weight: 7, text: `Цепко в единоборствах — выиграли ${duelsWon}, обыграли нас лишь ${beaten} ${plural(beaten, 'раз', 'раза', 'раз')}.` });
    } else if (beaten > duelsWon) {
      out.push({ tone: 'warn', icon: '🛡', weight: 7, text: `Проигрывали 1в1 — обыграли нас ${beaten} ${plural(beaten, 'раз', 'раза', 'раз')} против ${duelsWon} выигранных.` });
    }
  }

  // 4. Объём отбора (только отборы — перехваты в данных задвоены, не показываем
  //    сырым числом, чтобы не вводить тренера в заблуждение «110 перехватов»).
  if (tackles >= 15) {
    out.push({ tone: 'neutral', icon: '⚔', weight: 4, text: `Высокий объём отбора — ${tackles} ${plural(tackles, 'отбор', 'отбора', 'отборов')} за матч.` });
  }

  // 5. Опасные потери у своих ворот.
  if (dangerLoss >= 3) {
    out.push({ tone: 'warn', icon: '⚠', weight: 6, text: `Опасные потери у своих ворот — ${dangerLoss}. Сохранять мяч в обороне аккуратнее.` });
  }

  // 6. Дисциплина.
  if (red > 0) {
    out.push({ tone: 'warn', icon: '🟥', weight: 8, text: `Играли в меньшинстве — ${red} ${plural(red, 'удаление', 'удаления', 'удалений')}.` });
  } else if (yellow >= 3) {
    out.push({ tone: 'warn', icon: '🟨', weight: 4, text: `Много карточек — ${yellow} ${plural(yellow, 'жёлтая', 'жёлтые', 'жёлтых')}.` });
  }

  // 7. Стандарты.
  if (corners >= 6) {
    out.push({ tone: 'good', icon: '🚩', weight: 3, text: `Давление со стандартов — ${corners} ${plural(corners, 'угловой', 'угловых', 'угловых')}.` });
  }

  // 8. Сухой матч / пропущенные.
  if (conceded === 0 && match.players?.length) {
    out.push({ tone: 'good', icon: '🧤', weight: 5, text: 'Сыграли на ноль — ворота в неприкосновенности.' });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

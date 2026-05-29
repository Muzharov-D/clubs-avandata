/**
 * Авто-инсайты по матчу (Phase 5) — простой rule-based движок.
 * На вход — match из fetchMatch (adapted Легирус-shape). На выход — массив
 * {tone: 'positive'|'negative'|'neutral', text}. Используется в MatchDetail.
 */
function val(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return Number(v.successful ?? v.value ?? v.total ?? 0) || 0;
  return Number(v) || 0;
}
// Достаём метрику из rich-группы (stats.attack/defence/fitness) игрока.
function pstat(p, group, key) {
  return val(p?.stats?.[group]?.[key]);
}

export function matchInsights(match) {
  const out = [];
  if (!match) return out;
  const all = match.players || [];
  const played = all.filter((p) => (p.minutes ?? 0) > 0);
  if (!played.length) return out;

  // Ориентация по ID (homeTeam.isOurTeam выставлен бэком).
  const weAreHome = match.awayTeam?.isOurTeam ? false : true;
  const s = match.score || {};
  const us = weAreHome ? s.home : s.away;
  const them = weAreHome ? s.away : s.home;

  if (us != null && them != null) {
    if (us > them) out.push({ tone: 'positive', text: `Победа ${us}:${them}.` });
    else if (us < them) out.push({ tone: 'negative', text: `Поражение ${us}:${them}.` });
    else out.push({ tone: 'neutral', text: `Ничья ${us}:${them}.` });
  }

  // Лучший по общему рейтингу.
  const rated = played.filter((p) => (p.ratings?.overall ?? 0) > 0);
  if (rated.length) {
    const best = rated.reduce((a, b) => ((b.ratings?.overall ?? 0) > (a.ratings?.overall ?? 0) ? b : a));
    out.push({
      tone: 'positive',
      text: `Лучший на поле — ${best.fullName || '№' + best.number} (рейтинг ${(best.ratings.overall).toFixed(1)}).`,
    });
    // Слабейший (среди сыгравших ≥30 минут, чтобы не штрафовать вышедших на замену).
    const enough = rated.filter((p) => (p.minutes ?? 0) >= 30);
    if (enough.length >= 3) {
      const worst = enough.reduce((a, b) => ((b.ratings?.overall ?? 0) < (a.ratings?.overall ?? 0) ? b : a));
      if ((worst.ratings.overall ?? 0) < 6) {
        out.push({
          tone: 'negative',
          text: `Просел ${worst.fullName || '№' + worst.number} (рейтинг ${(worst.ratings.overall).toFixed(1)}).`,
        });
      }
    }
  }

  // Бомбардир матча.
  const scorers = played
    .map((p) => ({ p, g: pstat(p, 'attack', 'goal') }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g);
  if (scorers.length) {
    const top = scorers[0];
    out.push({
      tone: 'positive',
      text: `${top.p.fullName || '№' + top.p.number} забил ${top.g} ${top.g === 1 ? 'гол' : top.g < 5 ? 'гола' : 'голов'}.`,
    });
  }

  // Командный прессинг и единоборства (сумма по игравшим).
  const pressing = played.reduce((s2, p) => s2 + pstat(p, 'defence', 'pressing'), 0);
  const duels = played.reduce((s2, p) => s2 + pstat(p, 'defence', 'duel'), 0);
  if (pressing > 0) out.push({ tone: 'neutral', text: `Прессинг-действий командой: ${pressing}.` });
  if (duels > 0) out.push({ tone: 'neutral', text: `Единоборств вступили: ${duels}.` });

  // Дисциплина.
  const yellows = played.reduce((s2, p) => s2 + pstat(p, 'defence', 'yellowCard') + val(p?.stats?.defence2?.yellowCard), 0);
  if (yellows > 0) out.push({ tone: 'negative', text: `Жёлтых карточек: ${yellows}.` });

  // Нагрузка: кто пробежал больше всех.
  const runners = played
    .map((p) => ({ p, d: pstat(p, 'fitness', 'totalDistance') }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d);
  if (runners.length) {
    const top = runners[0];
    out.push({
      tone: 'neutral',
      text: `Больше всех пробежал ${top.p.fullName || '№' + top.p.number} — ${(top.d / 1000).toFixed(1)} км.`,
    });
  }

  return out;
}

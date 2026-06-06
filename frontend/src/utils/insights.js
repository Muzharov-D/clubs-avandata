/**
 * Авто-инсайты по матчу — аналитический rule-based движок.
 *
 * Цель: не пересказывать суммы (это видно в таблицах), а давать тренеру выводы,
 * которые он сам в уме не посчитает — перелом по таймам, перекос атака/оборона,
 * отклонение от своего сезонного уровня, эффективность ударов, ключевой
 * созидатель, физическая отдача. Каждый инсайт приоритизирован (вес) и несёт
 * иконку-категорию; выводим топ-N самых значимых.
 *
 * matchInsights(match, opts?) → [{ tone, icon, text, weight }]
 *   opts.seasonAvg — { overall, attack, defence, fitness } средние по сезону (для «vs обычного»)
 *   opts.nameOf    — (player) => строка короткого имени
 */
import { ourSideKey } from './analytics';

function val(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return Number(v.successful ?? v.value ?? v.total ?? 0) || 0;
  return Number(v) || 0;
}
function total(v) {
  if (v && typeof v === 'object' && v.total != null) return Number(v.total) || 0;
  return val(v);
}
function pstat(p, group, key) { return val(p?.stats?.[group]?.[key]); }
function nameFallback(p) { return p?.fullName || (p?.number != null ? `№${p.number}` : 'игрок'); }
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function matchInsights(match, opts = {}) {
  const out = [];
  if (!match) return out;
  const nameOf = opts.nameOf || nameFallback;
  const seasonAvg = opts.seasonAvg || null;
  const all = match.players || [];
  const played = all.filter((p) => (p.minutes ?? 0) > 0);
  if (!played.length) return out;

  // Сторона «нашей» команды — через канонический ourSideKey (id-first флаги
  // homeTeam/awayTeam.isOurTeam), а не ad-hoc по awayTeam: на выездных матчах
  // home = соперник, и счёт/результат нельзя брать по home-слоту.
  const { our } = ourSideKey(match);
  const s = match.score || { home: match.scoreHome, away: match.scoreAway };
  const us = our === 'home' ? s.home : s.away;
  const them = our === 'home' ? s.away : s.home;
  const add = (tone, icon, text, weight) => out.push({ tone, icon, text, weight });

  // ── Результат с характером (не просто счёт) ──
  if (us != null && them != null) {
    const diff = us - them;
    if (diff > 0) {
      const how = diff >= 3 ? 'Уверенная победа' : diff === 1 ? 'Победа в один мяч' : 'Победа';
      const cs = them === 0 ? ' на ноль' : '';
      add('positive', '🏆', `${how} ${us}:${them}${cs}.`, diff >= 3 || them === 0 ? 70 : 60);
    } else if (diff < 0) {
      add('negative', '❌', `${Math.abs(diff) >= 3 ? 'Крупное поражение' : 'Поражение'} ${us}:${them}.`, 70);
    } else {
      add('neutral', '🤝', `Ничья ${us}:${them}.`, 55);
    }
  }

  // ── Перелом по таймам: где команда прибавила/сдала (по сплитам) ──
  const HALF = [['Shot', 'удары'], ['Duel', 'единоборства'], ['Pressing', 'прессинг'], ['Pass', 'передачи'], ['Tackle', 'отборы']];
  for (const [key, label] of HALF) {
    let f = 0, sec = 0, any = false;
    for (const p of played) {
      const r = p.splits?.[key];
      if (r) { f += Number(r.first) || 0; sec += Number(r.second) || 0; any = true; }
    }
    const tot = f + sec;
    // ≥20 событий за матч: на 8 событиях «перекос тайма» (3→5) — шум, не вывод.
    // Порог 20 + границы долей ниже гарантируют и абсолютную разницу ≥~6.
    if (!any || tot < 20) continue;
    const share2 = sec / tot;
    // заметный перекос: во 2-м тайме <33% или >67% активности
    if (share2 <= 0.34) {
      add('negative', '📉', `Сдали по «${label}» во 2-м тайме: ${f} → ${sec}.`, 64 - Math.round(share2 * 20));
    } else if (share2 >= 0.66) {
      add('positive', '📈', `Прибавили по «${label}» во 2-м тайме: ${f} → ${sec}.`, 58);
    }
  }

  // ── Перекос атака/оборона по командным рейтингам ──
  const tr = match.teamAvgRatings || {};
  const atk = Number(tr.attack) || 0, def = Number(tr.defence) || 0;
  if (atk > 0 && def > 0 && Math.abs(atk - def) >= 1.0) {
    if (atk > def) add('neutral', '⚔️', `Игра через атаку: атака ${atk.toFixed(1)} против обороны ${def.toFixed(1)}.`, 50);
    else add('neutral', '🛡️', `Акцент на оборону: оборона ${def.toFixed(1)} против атаки ${atk.toFixed(1)}.`, 50);
  }

  // ── Уровень матча против своего сезонного среднего ──
  if (seasonAvg && seasonAvg.overall > 0 && tr.overall > 0) {
    const d = Number(tr.overall) - seasonAvg.overall;
    if (Math.abs(d) >= 0.3) {
      add(d > 0 ? 'positive' : 'negative', d > 0 ? '⭐' : '🔻',
        `${d > 0 ? 'Сильнее обычного' : 'Слабее обычного'}: общий ${Number(tr.overall).toFixed(1)} против ${seasonAvg.overall.toFixed(1)} в среднем за сезон.`,
        d > 0 ? 56 : 62);
    }
  }

  // ── Эффективность атаки: голы на удары ──
  const goals = played.reduce((a, p) => a + pstat(p, 'attack', 'goal'), 0);
  const shots = played.reduce((a, p) => a + total(p?.stats?.attack?.shot), 0);
  if (shots >= 6) {
    const conv = Math.round((goals / shots) * 100);
    if (goals > 0 && conv >= 25) add('positive', '🎯', `Реализация выше нормы: ${goals} ${plural(goals,'гол','гола','голов')} с ${shots} ударов (${conv}%).`, 54);
    else if (goals === 0) add('negative', '🧱', `${shots} ударов без голов — провал реализации.`, 60);
    else if (conv <= 10) add('neutral', '🎯', `Низкая реализация: ${goals} из ${shots} ударов (${conv}%).`, 46);
  }

  // ── Лучший игрок с вкладом (рейтинг + что сделал) ──
  const rated = played.filter((p) => (p.ratings?.overall ?? 0) > 0);
  if (rated.length) {
    const best = rated.reduce((a, b) => ((b.ratings.overall) > (a.ratings.overall) ? b : a));
    const g = pstat(best, 'attack', 'goal'), as = pstat(best, 'attack', 'assist');
    const contrib = [];
    if (g) contrib.push(`${g} ${plural(g,'гол','гола','голов')}`);
    if (as) contrib.push(`${as} ${plural(as,'пас','паса','пасов')}`);
    const tail = contrib.length ? ` — ${contrib.join(', ')}` : '';
    add('positive', '🥇', `Лучший: ${nameOf(best)}, рейтинг ${best.ratings.overall.toFixed(1)}${tail}.`, 52);
    // Намеренно НЕ подсвечиваем публично «худшего» — это дети; индивидуальный
    // провал тренер видит в составе/рейтингах, в авто-брифинг его не выносим.
  }

  // ── Ключевой созидатель (ассисты + ключевые пасы), если это не лучший выше ──
  const creators = played
    .map((p) => ({ p, v: pstat(p, 'attack', 'assist') * 2 + pstat(p, 'attack', 'keyPass') }))
    .filter((x) => x.v >= 2)
    .sort((a, b) => b.v - a.v);
  if (creators.length) {
    const c = creators[0].p;
    const as = pstat(c, 'attack', 'assist'), kp = pstat(c, 'attack', 'keyPass');
    const parts = [];
    if (as) parts.push(`${as} ${plural(as,'голевая','голевые','голевых')}`);
    if (kp) parts.push(`${kp} ${plural(kp,'ключевой пас','ключевых паса','ключевых пасов')}`);
    if (parts.length) add('positive', '🅰️', `Созидание: ${nameOf(c)} — ${parts.join(', ')}.`, 44);
  }

  // ── Физика: лидер по дистанции + спринт-вклад ──
  const runners = played
    .map((p) => ({ p, d: pstat(p, 'fitness', 'totalDistance'), sp: pstat(p, 'fitness', 'sprintDistance') }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d);
  if (runners.length) {
    const t = runners[0];
    const spTxt = t.sp > 0 ? `, спринт ${(t.sp / 1000).toFixed(1)} км` : '';
    add('neutral', '🏃', `Больше всех отработал ${nameOf(t.p)} — ${(t.d / 1000).toFixed(1)} км${spTxt}.`, 40);
  }

  // ── Дисциплина (только если есть карточки) ──
  const yellows = played.reduce((a, p) => a + pstat(p, 'defence', 'yellowCard') + val(p?.stats?.defence2?.yellowCard), 0);
  const reds = played.reduce((a, p) => a + pstat(p, 'defence', 'redCard') + val(p?.stats?.defence2?.redCard), 0);
  if (reds > 0) add('negative', '🟥', `Удаление в составе — играли в меньшинстве.`, 66);
  else if (yellows >= 3) add('negative', '🟨', `${yellows} ${plural(yellows,'жёлтая','жёлтые','жёлтых')} — много фолов.`, 42);

  // топ-6 по значимости
  return out.sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 6);
}

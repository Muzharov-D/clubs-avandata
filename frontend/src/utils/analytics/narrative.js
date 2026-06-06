/**
 * Нарративный слой: тренерский авто-разбор матча из модельных метрик
 * (xG, реализация, заслуженный результат, PPDA, momentum, лидеры угрозы).
 * Дополняет rule-based insights.js, но говорит на языке моделей.
 */
import { M, played } from './metrics';
import { teamXg, ourSideKey, finishing, deservedResult, playerXgModel } from './xg';
import { playerThreat } from './progression';

function fmt1(v) {
  return Number(v).toFixed(1);
}
function fmt2(v) {
  // 1 знак: модельные xG/угроза из 5–10 событий не имеют 2-значной точности.
  return Number(v).toFixed(1);
}

/**
 * coachDigest(match, opts) → [{ tone, icon, text }] — приоритезированный
 * брифинг из моделей. nameOf — короткое имя игрока.
 */
export function coachDigest(match, opts = {}) {
  const out = [];
  if (!match) return out;
  const nameOf = opts.nameOf || ((p) => p?.fullName || `№${p?.number ?? '?'}`);
  const { our, opp } = ourSideKey(match);
  const xgFor = teamXg(match, our);
  const xgAgainst = teamXg(match, opp);
  const score = match.score || {};
  const goalsFor = our === 'home' ? score.home : score.away;
  const goalsAgainst = our === 'home' ? score.away : score.home;
  const players = (match.players || []).filter(played);

  // ── Заслуженный результат по xG ──
  if (xgFor != null && xgAgainst != null) {
    const dr = deservedResult({ xgFor, xgAgainst, goalsFor, goalsAgainst });
    if (dr) {
      out.push({
        tone: 'neutral',
        icon: '📊',
        text: `По моментам — xG ${fmt2(xgFor)} против ${fmt2(xgAgainst)}, ожидаемые очки ${fmt1(dr.xPoints)}.`,
      });
      if (dr.luck != null && Math.abs(dr.luck) >= 1.2) {
        out.push(
          dr.luck > 0
            ? { tone: 'positive', icon: '🍀', text: `Взяли больше, чем наиграли (+${fmt1(dr.luck)} очка к ожиданию) — результат с запасом везения.` }
            : { tone: 'negative', icon: '🌧️', text: `Недобрали по игре (${fmt1(dr.luck)} очка к ожиданию) — по моментам заслуживали больше.` },
        );
      }
    }
  }

  // ── Реализация (голы vs xG) ──
  if (xgFor != null && goalsFor != null) {
    const fin = finishing(goalsFor, xgFor);
    if (fin != null && Math.abs(fin) >= 1) {
      out.push(
        fin > 0
          ? { tone: 'positive', icon: '🎯', text: `Реализация выше ожидания: ${goalsFor} ${plural(goalsFor, 'гол', 'гола', 'голов')} при xG ${fmt2(xgFor)} (+${fmt1(fin)}).` }
          : { tone: 'negative', icon: '🧱', text: `Недореализация: ${goalsFor} при xG ${fmt2(xgFor)} (${fmt1(fin)}) — моменты были.` },
      );
    }
  }

  // Прессинг намеренно НЕ выносим в нарратив: PPDA убран целиком (слишком
  // сложная метрика), а объём прессинг-действий показан в PressingCard.

  // Перекос по таймам намеренно НЕ дублируем тут — он есть в rule-based insights
  // (по конкретным метрикам) и в визуальной «Полосе темпа» (MomentumStrip).

  // ── Лидер по добавленной угрозе (xT-прокси) ──
  if (players.length) {
    const ranked = players
      .map((p) => ({ p, t: playerThreat(p) }))
      .filter((x) => x.t > 0)
      .sort((a, b) => b.t - a.t);
    if (ranked.length && ranked[0].t >= 0.2) {
      out.push({ tone: 'positive', icon: '🧠', text: `Главный по созданию угрозы: ${nameOf(ranked[0].p)} (вклад в угрозу ${fmt2(ranked[0].t)}).` });
    }
  }

  // ── Топ-реализатор xG-модели ──
  if (players.length && xgFor != null) {
    const map = playerXgModel(players, xgFor);
    const top = players
      .map((p) => ({ p, xg: map.get(p.id)?.xg ?? 0, g: M.goals(p) }))
      .sort((a, b) => b.xg - a.xg)[0];
    if (top && top.xg >= 0.3) {
      const tail = top.g > 0 ? `, забил ${top.g}` : '';
      out.push({ tone: 'neutral', icon: '⚽', text: `Больше всех набрал xG ${nameOf(top.p)} (${fmt2(top.xg)}${tail}).` });
    }
  }

  return out;
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/**
 * Как команда играет — профиль стиля за сезон, простым тренерским языком.
 *
 * Без жаргона (PPDA, «% длинных») в основном тексте: каждая строка — короткая
 * характеристика + полоска + объяснение человеческим языком. Источник —
 * сезонный агрегат (/matches/aggregate?period=…): усреднённые командные
 * показатели и агрегаты.
 */
import { num, matchesWord } from '../../utils/num';
import { interpretPpda } from '../../utils/analytics/ppda';
import './analytics.css';

function v(x) { return x == null ? 0 : typeof x === 'object' ? Number(x.value ?? x.total ?? 0) : Number(x) || 0; }
function clamp(n) { return Math.max(0, Math.min(100, n)); }

function controlWord(p) {
  if (p >= 55) return 'Контролируем мяч';
  if (p >= 45) return 'Играем на равных';
  return 'Играем вторым номером';
}
function directnessWord(share) {
  if (share >= 18) return 'Быстро вперёд';
  if (share >= 10) return 'Смешанно';
  return 'Через короткий пас';
}
function threatWord(xg) {
  if (xg >= 2) return 'Остро атакуем';
  if (xg >= 1) return 'Создаём моменты';
  return 'Моментов мало';
}
function shotsWord(s) {
  if (s >= 12) return 'Много бьём';
  if (s >= 7) return 'Бьём в меру';
  return 'Редко бьём';
}
function passAccWord(a) {
  if (a >= 85) return 'Аккуратны в пасе';
  if (a >= 75) return 'Средняя точность';
  return 'Часто теряем мяч';
}
function setPieceWord(c) {
  if (c >= 6) return 'Давим со стандартов';
  if (c >= 3) return 'Стандарты в норме';
  return 'Мало угловых';
}
function disciplineWord(f) {
  if (f <= 10) return 'Играем чисто';
  if (f <= 16) return 'В рамках правил';
  return 'Грубовато';
}

export default function TeamIdentityCard({ aggregate, periodLabel = 'за сезон' }) {
  const our = aggregate?.our;
  const ta = aggregate?.teamAggregates || {};
  const matchCount = Number(aggregate?.matchCount ?? 0);
  if (!our || matchCount === 0) return null;

  // Владение
  const possession = num(our.possessionPct);

  // Манера передач: доля длинных в общем объёме (короткие/средние/длинные).
  const long = v(ta.passes?.long);
  const middle = v(ta.passes?.middle);
  const short = v(ta.passes?.short);
  const passVol = long + middle + short;
  const directness = passVol > 0 ? (long / passVol) * 100 : null;

  // Прессинг: PPDA → тренерская интерпретация (слова, без числа в тексте).
  const ppda = num(ta.pressing?.averagePPDA);
  const press = ppda > 0 ? interpretPpda(ppda) : null;
  const pressIntensity = ppda > 0 ? clamp(((15 - ppda) / 15) * 100) : null;

  // Острота: xG за матч (xG — принятое обозначение). Гард >6 — битый рейтинг.
  const xgRaw = num(our.expectedGoals);
  const xg = xgRaw > 0 && xgRaw <= 6 ? xgRaw : null;

  // Удары: объём + точность в створ (за матч).
  const shots = v(our.shots);
  const onTarget = num(our.shots?.onTarget);
  const otPct = shots > 0 && onTarget > 0 ? Math.round((onTarget / shots) * 100) : null;

  // Точность паса: успешные / всего (за матч).
  const passTotal = v(our.passes);
  const passOk = num(our.passes?.successful);
  const passAcc = passTotal > 0 && passOk > 0 ? (passOk / passTotal) * 100 : null;

  // Стандарты: угловые за матч (давление со стандартов).
  const corners = v(our.corners);

  // Дисциплина: фолы + ЖК за матч.
  const fouls = num(our.fouls);
  const yellows = num(our.yellowCards);

  const rows = [
    possession > 0 && {
      key: 'control',
      label: 'Владение',
      word: controlWord(possession),
      val: clamp(possession),
      hint: `Мяч у нас ${Math.round(possession)}% игрового времени.`,
    },
    directness != null && {
      key: 'direct',
      label: 'Манера атаки',
      word: directnessWord(directness),
      val: clamp(directness * 2.5), // визуальная шкала (20% длинных ≈ полная полоса)
      hint: `Длинных передач — ${Math.round(directness)}% от всех (≥18% — играем вертикально).`,
    },
    press && {
      key: 'press',
      label: 'Прессинг',
      word: press.level,
      val: pressIntensity ?? 0,
      hint: press.note,
    },
    xg != null && {
      key: 'threat',
      label: 'Острота у ворот',
      word: threatWord(xg),
      val: clamp(xg * 33),
      hint: `В среднем ${xg.toFixed(1)} xG за матч — столько моментов создаём.`,
    },
    shots > 0 && {
      key: 'shots',
      label: 'Удары',
      word: shotsWord(shots),
      val: clamp(shots * 7),
      hint: `${Math.round(shots)} ударов за матч${otPct != null ? `, ${otPct}% в створ` : ''}.`,
    },
    passAcc != null && {
      key: 'passacc',
      label: 'Точность паса',
      word: passAccWord(passAcc),
      val: clamp((passAcc - 50) * 2),
      hint: `Точность передач ${Math.round(passAcc)}% (${Math.round(passOk)} из ${Math.round(passTotal)} за матч).`,
    },
    corners > 0 && {
      key: 'setpiece',
      label: 'Стандарты',
      word: setPieceWord(corners),
      val: clamp(corners * 12),
      hint: `${Math.round(corners)} угловых за матч — давление со стандартов.`,
    },
    fouls > 0 && {
      key: 'discipline',
      label: 'Дисциплина',
      word: disciplineWord(fouls),
      val: clamp(100 - fouls * 4),
      hint: `${Math.round(fouls)} фолов${yellows > 0 ? ` и ${yellows.toFixed(1)} ЖК` : ''} за матч.`,
    },
  ].filter(Boolean);
  if (rows.length === 0) return null;

  return (
    <section className="cd__panel reveal an">
      <div className="cd__panel-header">
        <h2 className="cd__panel-title">Как команда играет</h2>
        <span className="cd__panel-sub">{periodLabel} · {matchCount} {matchesWord(matchCount)}</span>
      </div>
      <div className="an-style">
        {rows.map((r) => (
          <div className="an-style__row" key={r.key}>
            <div className="an-style__head">
              <span className="an-style__lab">{r.label}</span>
              <span className="an-style__word">{r.word}</span>
            </div>
            <span className="an-style__track">
              <span className="an-style__fill" style={{ width: `${r.val}%` }} />
            </span>
            <div className="an-style__hint">{r.hint}</div>
          </div>
        ))}
      </div>
      <div className="an-note">Усреднённый портрет игры команды {periodLabel}. Помогает понять, в каком стиле команда сильнее.</div>
    </section>
  );
}

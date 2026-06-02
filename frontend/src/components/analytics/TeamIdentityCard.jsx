/**
 * Как команда играет — профиль стиля за сезон, простым тренерским языком.
 *
 * Без жаргона (PPDA, «% длинных») в основном тексте: каждая строка — короткая
 * характеристика + полоска + объяснение человеческим языком. Источник —
 * сезонный агрегат (/matches/aggregate?period=…): усреднённые командные
 * показатели и агрегаты.
 */
import { num } from '../../utils/num';
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
      hint: 'Чаще разыгрываем коротко или сразу играем вперёд.',
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
  ].filter(Boolean);
  if (rows.length === 0) return null;

  return (
    <section className="cd__panel reveal an">
      <div className="cd__panel-header">
        <h2 className="cd__panel-title">Как команда играет</h2>
        <span className="cd__panel-sub">{periodLabel} · {matchCount} матч.</span>
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

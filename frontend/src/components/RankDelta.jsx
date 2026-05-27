// Бейдж изменения позиции за неделю (с прошлого понедельника 23:00 МСК).
// Используется в шапке public-страницы рядом с местом в лиге и клубным зачёте.
//
// Знак delta:
//   delta < 0 → поднялись (стало меньше → лучше) → зелёная ↑ + (+N)
//   delta > 0 → опустились → красная ↓ + (-N)
//   delta === 0 или null → ничего не рендерим (нет смысла показывать пустой бейдж)
//
// Цвета совпадают с заменами в timeline матча (mds-tl-sub-in/out) — родители
// уже привыкли «зелёная стрелка вверх = хорошо, красная вниз = плохо».

import './RankDelta.css';

export default function RankDelta({ delta }) {
  if (delta == null || delta === 0) return null;
  const improved = delta < 0;
  const abs = Math.abs(delta);
  return (
    <span
      className={`rank-delta ${improved ? 'rank-delta--up' : 'rank-delta--down'}`}
      title={improved
        ? `Поднялись на ${abs} ${plural(abs, ['место', 'места', 'мест'])} за неделю`
        : `Опустились на ${abs} ${plural(abs, ['место', 'места', 'мест'])} за неделю`}
      aria-label={improved ? `Поднялись на ${abs}` : `Опустились на ${abs}`}
    >
      <span className="rank-delta__arrow" aria-hidden>{improved ? '↑' : '↓'}</span>
      <span className="rank-delta__num">{abs}</span>
    </span>
  );
}

function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

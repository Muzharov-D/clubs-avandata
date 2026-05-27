// Серия команды + последние 5 матчей W/L/D-кружочками.
// Использование: <StreakBadge matches={cal.matches} />

import './StreakBadge.css';
import { computeStreak } from '../utils/streak';

const TYPE_LABEL = {
  W: { word: 'победа', words: 'победы', wordsMany: 'побед', emoji: '🔥' },
  L: { word: 'поражение', words: 'поражения', wordsMany: 'поражений', emoji: '🧊' },
  D: { word: 'ничья', words: 'ничьи', wordsMany: 'ничьих', emoji: '🤝' },
};

function plural(count, t) {
  const n = count % 100;
  const lastDigit = count % 10;
  if (n > 10 && n < 20) return t.wordsMany;
  if (lastDigit === 1) return t.word;
  if (lastDigit >= 2 && lastDigit <= 4) return t.words;
  return t.wordsMany;
}

export default function StreakBadge({ matches }) {
  const { type, count, recent } = computeStreak(matches);
  // «1 ничья подряд» — бессмысленная фраза. Серия начинается с 2.
  if (!type || count < 2) return null;

  const t = TYPE_LABEL[type];
  // Огонёк — только для горячей победной серии 3+.
  const showHot = type === 'W' && count >= 3;

  return (
    <div className={`streak-badge streak-badge--${type}${showHot ? ' streak-badge--hot' : ''}`}>
      <span className="streak-badge__main">
        {showHot && <span className="streak-badge__fire" aria-hidden>{t.emoji}</span>}
        <span className="streak-badge__num">{count}</span>
        <span className="streak-badge__word">{plural(count, t)} подряд</span>
      </span>
      {recent.length > 1 && (
        <span className="streak-badge__form" aria-label={`Последние ${recent.length}: ${recent.join(', ')}`}>
          {recent.map((r, i) => (
            <span key={i} className={`streak-badge__dot streak-badge__dot--${r}`} title={TYPE_LABEL[r].word}>{r === 'W' ? 'В' : r === 'L' ? 'П' : 'Н'}</span>
          ))}
        </span>
      )}
    </div>
  );
}

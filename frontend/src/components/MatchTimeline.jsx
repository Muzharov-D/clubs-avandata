/**
 * MatchTimeline — хроника матча: голы, карточки, замены по минутам.
 * Источник: match.events (parse_events.py best-effort).
 *
 * Props:
 *   events: Array<{
 *     minute: number, extra?: number,
 *     type: 'goal' | 'penalty' | 'own_goal' | 'yellow_card' | 'red_card' | 'substitution',
 *     player?: string, playerOut?: string, playerIn?: string,
 *     assist?: string, team?: 'home'|'away'|'unknown'
 *   }>
 *   homeName?: string  — для меток home/away (если в events это есть)
 *   awayName?: string
 */
import './MatchTimeline.css';

const TYPE_META = {
  goal:         { icon: '⚽', label: 'Гол',          tone: 'positive' },
  penalty:      { icon: '🎯', label: 'Пенальти',     tone: 'positive' },
  own_goal:     { icon: '🥅', label: 'Автогол',      tone: 'negative' },
  yellow_card:  { icon: '🟨', label: 'Жёлтая',       tone: 'warning'  },
  red_card:     { icon: '🟥', label: 'Удаление',     tone: 'negative' },
  substitution: { icon: '🔄', label: 'Замена',       tone: 'neutral'  },
};

function formatMinute(ev) {
  if (ev.extra && ev.extra > 0) return `${ev.minute}'+${ev.extra}`;
  return `${ev.minute}'`;
}

function describe(ev) {
  if (ev.type === 'substitution') {
    if (ev.playerIn && ev.playerOut) return `${ev.playerOut} ↔ ${ev.playerIn}`;
    if (ev.player) return ev.player;
    return ev.raw || '';
  }
  if (ev.assist) return `${ev.player || '—'} (асс. ${ev.assist})`;
  return ev.player || ev.raw || '';
}

export default function MatchTimeline({ events }) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;  // Если в PDF не нашли — не рендерим вообще
  }
  return (
    <div className="card match-timeline">
      <div className="page-section-title">Хроника матча</div>
      <ol className="match-timeline__list">
        {events.map((ev, i) => {
          const meta = TYPE_META[ev.type] || { icon: '•', label: ev.type, tone: 'neutral' };
          // Гол соперника — приглушаем (не наш «позитив») и помечаем.
          const isGoal = ev.type === 'goal' || ev.type === 'penalty' || ev.type === 'own_goal';
          const oppGoal = isGoal && ev.side === 'opp';
          const tone = oppGoal ? 'neutral' : meta.tone;
          const label = oppGoal ? `${meta.label} · соперник` : meta.label;
          return (
            <li key={i} className={`match-timeline__row match-timeline__row--${tone}`}>
              <span className="match-timeline__minute">{formatMinute(ev)}</span>
              <span className="match-timeline__icon" aria-hidden>{meta.icon}</span>
              <span className="match-timeline__body">
                <span className="match-timeline__type">{label}</span>
                <span className="match-timeline__player">{describe(ev)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

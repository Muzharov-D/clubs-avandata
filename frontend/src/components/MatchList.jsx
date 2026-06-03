import { useNavigate, useLocation } from 'react-router-dom';
import { trimAgeSuffix } from '../utils/teamName';
import { Reveal, StaggerList } from './motion';
import './MatchList.css';

// Порог «старения» матча: матч старше 7 дней приглушаем (opacity 50%).
const AGED_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
// Свежесть подсветки: самые последние N матчей выделяем cyan-границей.
const RECENT_COUNT = 3;

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function isAged(iso) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t > AGED_DAYS * DAY_MS;
}

export default function MatchList({ matches, teams, activeMatchId }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Канон обрезки возрастной группы (см. utils/teamName) — локальная копия
  // обрезала только « 2010», но не диапазон «2010-2011» → «Выборжанин -2011».
  const trimAgeStr = trimAgeSuffix;
  function teamName(id, fallback) {
    const t = teams?.find((x) => x.id === id);
    return trimAgeStr(t?.shortName || t?.name || fallback || '—');
  }

  const list = matches || [];

  return (
    <div className="match-list">
      <Reveal variant="fade" duration={0.4} delay={0.2}>
        <div className="match-list__title">Матчи</div>
      </Reveal>
      {list.length > 0 && (
        <StaggerList speed="normal" whenInView className="match-list__items">
          {list.map((m, i) => {
            // API возвращает m.home/m.away (имена), а не teamId. Fallback на
            // teamName() через id если есть, иначе на имя из API напрямую.
            const home = trimAgeStr(m.home || teamName(m.homeTeamId, m.homeTeamName) || 'Команда');
            const away = trimAgeStr(m.away || teamName(m.awayTeamId, m.awayTeamName) || 'Соперник');
            const isActive = m.id === activeMatchId || pathname === `/matches/${m.id}`;
            // Список отсортирован от свежего к старому (matches[0] = последний),
            // поэтому первые RECENT_COUNT — самые свежие.
            const recent = i < RECENT_COUNT;
            const aged = !recent && isAged(m.date);
            const cls = [
              'match-list__item',
              isActive ? 'match-list__item--active' : '',
              recent ? 'match-list__item--recent' : '',
              aged ? 'match-list__item--aged' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={m.id}
                className={cls}
                onClick={() => navigate(`/matches/${m.id}`)}
              >
                <div className="match-list__date">{fmtDate(m.date)}</div>
                <div className="match-list__teams">
                  <span>{home}</span>
                  <span className="match-list__score">
                    {(() => {
                      // matches API возвращает scoreHome/scoreAway scalar, а fetchMatch (single) — score:{home,away}
                      const h = m.score?.home ?? m.scoreHome;
                      const a = m.score?.away ?? m.scoreAway;
                      if (h == null || a == null) return '—';
                      return `${h}:${a}`;
                    })()}
                  </span>
                  <span>{away}</span>
                </div>
                <div className="match-list__status">{m.statusLabel || 'МАТЧ РАЗОБРАН'}</div>
              </button>
            );
          })}
        </StaggerList>
      )}
      {list.length === 0 && (
        <div className="match-list__empty">Матчи не загружены</div>
      )}
    </div>
  );
}

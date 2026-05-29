import { useNavigate, useLocation } from 'react-router-dom';
import './MatchList.css';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export default function MatchList({ matches, teams, activeMatchId }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function trimAgeStr(s) {
    return String(s || '')
      .replace(/\s*[Uu]-?\s*\d{1,3}\s*/g, ' ')
      .replace(/\s+20\d{2}\s*/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function teamName(id, fallback) {
    const t = teams?.find((x) => x.id === id);
    return trimAgeStr(t?.shortName || t?.name || fallback || '—');
  }

  return (
    <div className="match-list">
      <div className="match-list__title">Матчи</div>
      {(matches || []).map((m) => {
        // API возвращает m.home/m.away (имена), а не teamId. Fallback на
        // teamName() через id если есть, иначе на имя из API напрямую.
        const home = trimAgeStr(m.home || teamName(m.homeTeamId, m.homeTeamName) || 'Команда');
        const away = trimAgeStr(m.away || teamName(m.awayTeamId, m.awayTeamName) || 'Соперник');
        const isActive = m.id === activeMatchId || pathname === `/matches/${m.id}`;
        return (
          <button
            key={m.id}
            className={`match-list__item ${isActive ? 'match-list__item--active' : ''}`}
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
      {(!matches || matches.length === 0) && (
        <div className="match-list__empty">Матчи не загружены</div>
      )}
    </div>
  );
}

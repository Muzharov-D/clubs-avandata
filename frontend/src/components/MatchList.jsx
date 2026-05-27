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

  function teamName(id, fallback) {
    const t = teams?.find((x) => x.id === id);
    return t?.shortName || t?.name || fallback || '—';
  }

  return (
    <div className="match-list">
      <div className="match-list__title">Матчи</div>
      {(matches || []).map((m) => {
        const home = teamName(m.homeTeamId, m.homeTeamName) || 'Команда';
        const awayResolved = teamName(m.awayTeamId, m.awayTeamName);
        const away = awayResolved === '—' ? (m.awayTeamName || 'Соперник') : awayResolved;
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
                {m.score?.home}:{m.score?.away}
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

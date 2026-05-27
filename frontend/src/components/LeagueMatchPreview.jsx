// Мини-аналитика любого матча Лиги — для bottom-sheet родителя.
//
// В отличие от OpponentPreview (он считает соперника Легируса для главной),
// этот компонент симметричный — показывает форму обеих команд, их позиции
// в таблице, средние голы за 5 матчей, и историю их прямых встреч в сезоне.
//
// Считаем всё на фронте из уже загруженного cal.matches + standings.
// Никаких новых API-вызовов. Лиговые матчи фильтруются по подгруппе из
// standings.table — кубковые без ограничения.

import { shieldFor, normalizeTeamName } from '../utils/legirus';
import './LeagueMatchPreview.css';

function shortTeamName(name) {
  if (!name) return '—';
  return String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .trim()
    .split(' ').slice(0, 3).join(' ');
}

function resultFor(match, teamNorm) {
  if (!match.score) return null;
  const isHome = normalizeTeamName(match.home) === teamNorm;
  const own = isHome ? match.score.home : match.score.away;
  const opp = isHome ? match.score.away : match.score.home;
  if (own == null || opp == null) return null;
  if (own > opp) return 'W';
  if (own < opp) return 'L';
  return 'D';
}

// Подсчёт стороны (home/away) для одной команды
function buildTeamStats(teamName, currentMatchId, allMatches, leagueTeamNames) {
  const norm = normalizeTeamName(teamName);
  if (!norm) return null;

  // Все past-матчи этой команды кроме текущего (отображаемого) + только в нашей
  // подгруппе для лиги (кубковые не фильтруем).
  const past = (allMatches || [])
    .filter((m) => m.isPast && m.score && m.matchId !== currentMatchId
      && (normalizeTeamName(m.home) === norm || normalizeTeamName(m.away) === norm))
    .filter((m) => {
      if (m.tournament === 'cup') return true;
      if (!leagueTeamNames || leagueTeamNames.size === 0) return true;
      const h = normalizeTeamName(m.home);
      const a = normalizeTeamName(m.away);
      return leagueTeamNames.has(h) && leagueTeamNames.has(a);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Последние 5 (новые слева для естественного чтения)
  const last5 = past.slice(0, 5).reverse().map((m) => ({
    result: resultFor(m, norm),
    score: m.score,
    isHome: normalizeTeamName(m.home) === norm,
  })).filter((r) => r.result);

  // Среднее за 5 матчей
  let scored = 0, conceded = 0, n = 0;
  for (const m of past.slice(0, 5)) {
    const isHome = normalizeTeamName(m.home) === norm;
    const own = isHome ? m.score?.home : m.score?.away;
    const opp = isHome ? m.score?.away : m.score?.home;
    if (own != null && opp != null) { scored += own; conceded += opp; n++; }
  }

  return {
    norm,
    last5,
    avgScored:   n > 0 ? (scored   / n).toFixed(1) : null,
    avgConceded: n > 0 ? (conceded / n).toFixed(1) : null,
  };
}

export default function LeagueMatchPreview({ match, allMatches, standings }) {
  if (!match || !match.home || !match.away) return null;

  const leagueTeamNames = new Set(
    (standings?.table || []).map((r) => normalizeTeamName(r.team)).filter(Boolean));

  const homeStats = buildTeamStats(match.home, match.matchId, allMatches, leagueTeamNames);
  const awayStats = buildTeamStats(match.away, match.matchId, allMatches, leagueTeamNames);

  const homeRow = (standings?.table || []).find((r) => normalizeTeamName(r.team) === homeStats?.norm);
  const awayRow = (standings?.table || []).find((r) => normalizeTeamName(r.team) === awayStats?.norm);

  // История прямых встреч в этом сезоне (между этими двумя командами, кроме текущего матча)
  const h2h = (allMatches || []).filter((m) => {
    if (!m.isPast || !m.score || m.matchId === match.matchId) return false;
    const h = normalizeTeamName(m.home);
    const a = normalizeTeamName(m.away);
    return (h === homeStats?.norm && a === awayStats?.norm)
        || (h === awayStats?.norm && a === homeStats?.norm);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Показываем блок ВСЕГДА (даже если у обеих команд нет данных) — пусть
  // родитель видит хотя бы заголовок и щиты с именами. Иначе в половине
  // матчей родитель открывает карточку чужого матча и не понимает почему
  // там пусто.
  const hasAnyContent = (homeRow || awayRow
    || (homeStats?.last5?.length) || (awayStats?.last5?.length)
    || h2h.length > 0);

  return (
    <div className="lmp">
      <div className="lmp__title">Обзор матча</div>
      {!hasAnyContent && (
        <div className="lmp__empty">Истории встреч пока нет — это первый матч этих команд в сезоне.</div>
      )}

      <div className="lmp__teams">
        {[
          { name: match.home, shield: match.homeShield, row: homeRow, stats: homeStats, side: 'home' },
          { name: match.away, shield: match.awayShield, row: awayRow, stats: awayStats, side: 'away' },
        ].map(({ name, shield, row, stats, side }) => (
          <div key={side} className="lmp__team">
            <div className="lmp__team-head">
              <img
                src={shieldFor(name, shield)}
                alt=""
                className="lmp__team-shield"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
              />
              <div className="lmp__team-name-block">
                <div className="lmp__team-name">{shortTeamName(name)}</div>
                {row && (
                  <div className="lmp__team-rank">#{row.pos} в лиге · {row.points ?? '—'} очк.</div>
                )}
              </div>
            </div>

            {stats?.last5?.length > 0 && (
              <div className="lmp__form-row">
                {stats.last5.map((m, i) => (
                  <span
                    key={i}
                    className={`lmp__form-cell lmp__form-cell--${m.result.toLowerCase()}`}
                    title={`${m.isHome ? 'дома' : 'в гостях'}: ${m.score.home}:${m.score.away}`}
                  >
                    {m.result}
                  </span>
                ))}
              </div>
            )}

            {stats?.avgScored && (
              <div className="lmp__avg">
                <span className="lmp__avg-num">{stats.avgScored}</span>
                <span className="lmp__avg-sep">·</span>
                <span className="lmp__avg-num lmp__avg-num--conc">{stats.avgConceded}</span>
                <span className="lmp__avg-label">за матч (5 игр)</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {h2h.length > 0 && (
        <div className="lmp__h2h">
          <div className="lmp__h2h-label">В этом сезоне:</div>
          <div className="lmp__h2h-row">
            {h2h.map((m, i) => (
              <span
                key={i}
                className="lmp__h2h-cell"
                title={`${m.home} ${m.score.home}:${m.score.away} ${m.away}`}
              >
                {m.score.home}:{m.score.away}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

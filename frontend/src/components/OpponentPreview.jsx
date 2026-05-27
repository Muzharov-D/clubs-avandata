// Мини-аналитика соперника под Hero ближайшего матча.
// Считает всё на фронте из уже загруженного cal.matches + standings —
// никаких новых API-запросов. Показывает родителю:
//   - Позицию соперника в таблице
//   - Последние 5 матчей (цветные квадраты W/L/D)
//   - Среднее голов забивает/пропускает
//   - История vs Легирус (если играли в этом сезоне)

import { isLegirus, shieldFor, normalizeTeamName } from '../utils/legirus';
import './OpponentPreview.css';

function shortTeamName(name) {
  if (!name) return '—';
  return String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .trim()
    .split(' ').slice(0, 3).join(' ');
}

// Из счёта одного матча со стороны указанной команды → W/L/D.
// teamNorm — уже нормализованное имя (normalizeTeamName), сравниваем
// нормализованные, потому что FFSPB пишет префиксы вразнобой.
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

export default function OpponentPreview({ nextMatch, allMatches, standings }) {
  if (!nextMatch) return null;
  const opponentName = isLegirus(nextMatch.home) ? nextMatch.away : nextMatch.home;
  if (!opponentName) return null;

  // Команды нашей подгруппы из standings. Имена нормализуем — FFSPB
  // непоследователен в префиксах («ФК Легирус» / «Легирус»).
  const leagueTeamNames = new Set(
    (standings?.table || []).map((r) => normalizeTeamName(r.team)).filter(Boolean),
  );
  const oppNorm = normalizeTeamName(opponentName);

  // Все прошлые матчи соперника (где он играл, кроме нашего).
  // Лиговые матчи — только в нашей подгруппе. Кубок — без ограничения.
  const opponentPastMatches = (allMatches || [])
    .filter((m) => m.isPast && m.score &&
      (normalizeTeamName(m.home) === oppNorm || normalizeTeamName(m.away) === oppNorm))
    .filter((m) => {
      if (m.tournament === 'cup') return true;
      if (leagueTeamNames.size === 0) return true; // нет standings — не фильтруем
      const h = normalizeTeamName(m.home);
      const a = normalizeTeamName(m.away);
      return leagueTeamNames.has(h) && leagueTeamNames.has(a);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // последние первыми

  // Последние 5 результатов (новые слева чтобы читать в правильном порядке)
  const last5 = opponentPastMatches.slice(0, 5).reverse().map((m) => ({
    result: resultFor(m, oppNorm),
    score: m.score,
    isHome: normalizeTeamName(m.home) === oppNorm,
  })).filter((r) => r.result);

  // Средние голы за последние 5 матчей
  let scored = 0, conceded = 0, n = 0;
  for (const m of opponentPastMatches.slice(0, 5)) {
    const isHome = normalizeTeamName(m.home) === oppNorm;
    const own = isHome ? m.score?.home : m.score?.away;
    const opp = isHome ? m.score?.away : m.score?.home;
    if (own != null && opp != null) { scored += own; conceded += opp; n++; }
  }
  const avgScored = n > 0 ? (scored / n).toFixed(1) : '—';
  const avgConceded = n > 0 ? (conceded / n).toFixed(1) : '—';

  // Позиция в таблице — матчим по нормализованному имени
  const standingsRow = (standings?.table || []).find(
    (r) => normalizeTeamName(r.team) === oppNorm,
  );

  // История vs Легирус (наши прошлые матчи с этим соперником)
  const vsLegirus = (allMatches || [])
    .filter((m) => m.isPast && m.score && m.isOurMatch &&
                   (normalizeTeamName(m.home) === oppNorm || normalizeTeamName(m.away) === oppNorm));

  // Шлём, только если есть хоть какая-то полезная инфа
  if (!standingsRow && last5.length === 0 && vsLegirus.length === 0) return null;

  return (
    <div className="opp-preview">
      <div className="opp-preview__head">
        <img
          src={shieldFor(opponentName, nextMatch.homeShield && nextMatch.awayShield
            ? (isLegirus(nextMatch.home) ? nextMatch.awayShield : nextMatch.homeShield)
            : null)}
          alt=""
          className="opp-preview__shield"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        />
        <div className="opp-preview__name-block">
          <div className="opp-preview__label">Соперник</div>
          <div className="opp-preview__name">{shortTeamName(opponentName)}</div>
        </div>
        {standingsRow && (
          <div className="opp-preview__rank">
            <div className="opp-preview__rank-num">#{standingsRow.pos}</div>
            <div className="opp-preview__rank-label">в лиге</div>
          </div>
        )}
      </div>

      {last5.length > 0 && (
        <div className="opp-preview__form">
          <div className="opp-preview__form-label">
            Последние {last5.length} {last5.length === 1 ? 'матч' : last5.length < 5 ? 'матча' : 'матчей'}
          </div>
          <div className="opp-preview__form-row">
            {last5.map((m, i) => (
              <span
                key={i}
                className={`opp-preview__form-cell opp-preview__form-cell--${m.result?.toLowerCase()}`}
                title={`${m.isHome ? 'дома' : 'в гостях'}: ${m.score.home}:${m.score.away}`}
              >
                {m.result}
              </span>
            ))}
          </div>
        </div>
      )}

      {n > 0 && (
        <div className="opp-preview__stats">
          <div className="opp-preview__stat">
            <span className="opp-preview__stat-num">{avgScored}</span>
            <span className="opp-preview__stat-label">забивает</span>
          </div>
          <div className="opp-preview__stat-sep">·</div>
          <div className="opp-preview__stat">
            <span className="opp-preview__stat-num">{avgConceded}</span>
            <span className="opp-preview__stat-label">пропускает</span>
          </div>
          <div className="opp-preview__stat-hint">в среднем за матч</div>
        </div>
      )}

      {vsLegirus.length > 0 && (
        <div className="opp-preview__history">
          <div className="opp-preview__history-label">В этом сезоне с Легирусом</div>
          <div className="opp-preview__history-row">
            {vsLegirus.map((m, i) => {
              const isHome = normalizeTeamName(m.home) === oppNorm;
              const oppScore = isHome ? m.score.home : m.score.away;
              const ourScore = isHome ? m.score.away : m.score.home;
              const win = ourScore > oppScore;
              const draw = ourScore === oppScore;
              return (
                <span
                  key={i}
                  className={`opp-preview__history-cell ${win ? 'is-win' : draw ? 'is-draw' : 'is-loss'}`}
                  title={`${isHome ? 'у них' : 'у нас'}: ${m.home} ${m.score.home}:${m.score.away} ${m.away}`}
                >
                  Легирус {ourScore}:{oppScore}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

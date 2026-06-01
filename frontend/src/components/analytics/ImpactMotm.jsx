/**
 * «Игрок матча» как МОДЕЛЬ вклада, а не просто макс. рейтинг (критика 7,
 * улучшение 38, вау 93). Рейтинг дополняется голами, ассистами, ключевыми
 * передачами, добавленной угрозой (xT) и реализацией (G−xG).
 */
import { rankImpact, teamXg, ourSideKey } from '../../utils/analytics';
import PlayerPhoto from '../PlayerPhoto';
import RatingPill from '../RatingPill';
import './analytics.css';

export default function ImpactMotm({ match, navigate, nameOf }) {
  if (!match?.players?.length) return null;
  const { our } = ourSideKey(match);
  const xgFor = teamXg(match, our);
  const { best } = rankImpact(match.players, xgFor);
  if (!best) return null;

  const p = best.player;
  const parts = best.parts;
  const chips = [];
  if (parts.goals > 0) chips.push(['голы', parts.goals]);
  if (parts.assists > 0) chips.push(['ассисты', parts.assists]);
  if (parts.keyPass > 0) chips.push(['ключевые', parts.keyPass]);
  if (parts.threat >= 0.2) chips.push(['xT', parts.threat.toFixed(2)]);
  if (parts.xg >= 0.3) chips.push(['xG', parts.xg.toFixed(2)]);

  return (
    <div className="card best-player an" onClick={() => navigate(`/players/${p.id}`)}>
      <div className="page-section-title">Игрок матча <span className="an-model-tag">модель вклада</span></div>
      <div className="best-player__body">
        <PlayerPhoto player={p} size={80} />
        <div className="best-player__info">
          <div className="best-player__name">{nameOf(p)}</div>
          <div className="best-player__pos">№{p.number} · {p.positionFull}</div>
        </div>
        <RatingPill value={p.ratings?.overall} size="xl" />
      </div>
      {chips.length > 0 && (
        <div className="an-motm__breakdown">
          {chips.map(([label, val]) => (
            <span className="an-motm__part" key={label}>{label} <b>{val}</b></span>
          ))}
        </div>
      )}
      <div className="an-note">Выбор по совокупному вкладу: рейтинг + голы/ассисты + созданная угроза, а не только оценка.</div>
    </div>
  );
}

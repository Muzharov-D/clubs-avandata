/**
 * Momentum матча по таймам + xG-гонка (прокси). Показывает, где команда поймала
 * волну (критики 9/12, улучшение 59, вау 85/96).
 */
import { teamMomentum, xgRace, teamXg, ourSideKey } from '../../utils/analytics';
import './analytics.css';

export default function MomentumStrip({ match }) {
  if (!match?.players?.length) return null;
  const mom = teamMomentum(match.players);
  if (!mom) return null;
  const { our } = ourSideKey(match);
  const race = xgRace(match.players, teamXg(match, our));

  const p1 = Math.round(mom.firstShare * 100);
  const p2 = 100 - p1;

  return (
    <div className="card an">
      <div className="page-section-title">Темп по таймам <span className="an-model-tag">модель</span></div>
      <div className="an-mom">
        <div className="an-mom__bar" role="img" aria-label={`Темп: 1-й тайм ${p1}%, 2-й тайм ${p2}%`}>
          <div className="an-mom__half an-mom__half--1" style={{ width: `${p1}%` }}>{p1 >= 14 ? `1-й ${p1}%` : ''}</div>
          <div className="an-mom__half an-mom__half--2" style={{ width: `${p2}%` }}>{p2 >= 14 ? `2-й ${p2}%` : ''}</div>
        </div>
        <div className="an-mom__legend">
          <span>{mom.shift > 0 ? 'прибавили во 2-м тайме ▲' : mom.shift < 0 ? 'сильнее 1-й тайм ▲' : 'ровно по таймам'}</span>
          {race && <span>xG-гонка: {race.first.toFixed(2)} → +{race.second.toFixed(2)}</span>}
        </div>
      </div>
      <div className="an-note">Темп — взвешенная сумма ударов/единоборств/прессинга/отборов по таймам. xG-гонка — распределение командного xG по доле ударов в тайме.</div>
    </div>
  );
}

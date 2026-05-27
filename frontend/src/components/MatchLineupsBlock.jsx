import './MatchLineupsBlock.css';

function PlayerRow({ p }) {
  return (
    <div className={`mds-lu__row${p.bench ? ' mds-lu__row--bench' : ''}`}>
      <span className="mds-lu__num">{p.number ?? '—'}</span>
      <span className="mds-lu__name">{p.name}</span>
    </div>
  );
}

function TeamColumn({ players, title, side }) {
  if (!Array.isArray(players) || players.length === 0) {
    return (
      <div className={`mds-lu__col mds-lu__col--${side}`}>
        <div className="mds-lu__team">{title}</div>
        <div className="mds-lu__empty">Состав ещё не объявлен</div>
      </div>
    );
  }
  const starters = players.filter((p) => !p.bench);
  const bench = players.filter((p) => p.bench);
  return (
    <div className={`mds-lu__col mds-lu__col--${side}`}>
      <div className="mds-lu__team">{title}</div>
      {starters.length > 0 && (
        <>
          <div className="mds-lu__group">Стартовый состав</div>
          {starters.map((p, i) => <PlayerRow key={p.playerId || i} p={p} />)}
        </>
      )}
      {bench.length > 0 && (
        <>
          <div className="mds-lu__group">Запасные</div>
          {bench.map((p, i) => <PlayerRow key={p.playerId || `b${i}`} p={p} />)}
        </>
      )}
    </div>
  );
}

export default function MatchLineupsBlock({ lineups, hostName, guestName, homeIsUs = true }) {
  if (!lineups) {
    return (
      <div className="mds-lu mds-lu--empty">
        Составы появятся за 6 часов до начала.
      </div>
    );
  }
  const usClass = homeIsUs ? 'mds-lu--us-home' : 'mds-lu--us-away';
  return (
    <div className={`mds-lu ${usClass}`}>
      <TeamColumn players={lineups.home} title={hostName || 'Хозяева'} side="home" />
      <TeamColumn players={lineups.away} title={guestName || 'Гости'} side="away" />
    </div>
  );
}

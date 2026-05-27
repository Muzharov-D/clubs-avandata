import './CupBracket.css';

// Универсальный bracket: получает rounds = [{ name, matches: [...] }]
// На десктопе — горизонтальные колонки раундов; на мобиле — аккордеон (вертикально).

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export default function CupBracket({ data }) {
  if (!data) return null;
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];

  if (!rounds.length) {
    return (
      <div className="cup-bracket__empty">
        Сетка кубка ещё не загружена.
        {data.parseHint && (
          <div className="cup-bracket__debug">debug: {data.parseHint}</div>
        )}
      </div>
    );
  }

  return (
    <div className="cup-bracket">
      {data.title && <div className="cup-bracket__title">{data.title}</div>}
      <div className="cup-bracket__rounds">
        {rounds.map((round, ri) => (
          <div className="cup-round" key={ri}>
            <div className="cup-round__name">{round.name}</div>
            <div className="cup-round__matches">
              {(round.matches || []).map((m, mi) => (
                <div
                  key={mi}
                  className={'cup-match' + (m.isOurClubMatch ? ' cup-match--ours' : '')}
                >
                  <div className="cup-match__row">
                    <span className="cup-match__team">
                      {m.homeShield && (
                        <img className="cup-match__shield" src={m.homeShield} alt="" />
                      )}
                      {m.home || '—'}
                    </span>
                    <span className="cup-match__score">
                      {m.score ? String(m.score).split(':')[0]?.trim() : ''}
                    </span>
                  </div>
                  <div className="cup-match__row">
                    <span className="cup-match__team">
                      {m.awayShield && (
                        <img className="cup-match__shield" src={m.awayShield} alt="" />
                      )}
                      {m.away || '—'}
                    </span>
                    <span className="cup-match__score">
                      {m.score ? String(m.score).split(':')[1]?.trim() : ''}
                    </span>
                  </div>
                  {m.date && <div className="cup-match__date">{fmtDate(m.date)}</div>}
                </div>
              ))}
              {(round.matches || []).length === 0 && (
                <div className="cup-match cup-match--placeholder">—</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {data.lastUpdated && (
        <div className="cup-bracket__updated">
          Обновлено: {new Date(data.lastUpdated).toLocaleString('ru-RU')}
        </div>
      )}
    </div>
  );
}

// Модалка с двумя таблицами: турнир и клубный зачёт.

import { useEffect } from 'react';
import { isLegirus } from '../utils/legirus';
import { tierForAge, leaguePosClass, clubPosClass } from '../utils/ageRating';
import useModalBack from '../utils/useModalBack';
import './StandingsModal.css';

function shortName(name) {
  if (!name) return '—';
  const cleaned = String(name)
    // Префиксы юридических форм — режем
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    // Сокращения чтобы влезла полная статистика
    .replace(/\bрайона\b/gi, 'р-на')
    .replace(/\bрайон\b/gi, 'р-н')
    .replace(/\s+/g, ' ')
    .trim();
  // Не больше 3 слов — режем хвост типа "Санкт-Петербурга", "Ленинградской области" и т.п.
  const words = cleaned.split(' ');
  return words.slice(0, 3).join(' ');
}

function medalRowClass(posClass) {
  if (posClass === 'rank-medal--gold') return 'sm-row--medal-gold';
  if (posClass === 'rank-medal--silver') return 'sm-row--medal-silver';
  if (posClass === 'rank-medal--bronze') return 'sm-row--medal-bronze';
  return '';
}

function posCell(pos) {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  return pos;
}

export default function StandingsModal({ tab = 'league', onClose, standings, clubRank, age }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  useModalBack(onClose, true);

  return (
    <div className="sm-backdrop" onClick={onClose}>
      <div className="sm-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sm-close" onClick={onClose} aria-label="Закрыть">✕</button>

        {tab === 'league' && standings?.table && (
          <>
            <div className="sm-head">
              <h3>Турнирная таблица {tierForAge(age)}</h3>
            </div>
            <div className="sm-table-wrap">
              <table className="sm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sm-team">Команда</th>
                    <th>И</th>
                    <th>В</th>
                    <th>Н</th>
                    <th>П</th>
                    <th>±</th>
                    <th>О</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.table.map((t) => {
                    const medalCls = medalRowClass(leaguePosClass(t.pos));
                    const oursCls = t.isOurClub ? 'sm-row--ours' : '';
                    return (
                      <tr key={t.team + (t.pos ?? '')} className={(oursCls + ' ' + medalCls).trim()}>
                        <td className="sm-pos">{posCell(t.pos)}</td>
                        <td className="sm-team">
                          {t.shield && <img src={t.shield} alt="" />}
                          <span>{shortName(t.team)}</span>
                        </td>
                        <td>{t.games ?? '—'}</td>
                        <td>{t.wins ?? '—'}</td>
                        <td>{t.draws ?? '—'}</td>
                        <td>{t.losses ?? '—'}</td>
                        <td>{(t.scored ?? 0) - (t.missed ?? 0)}</td>
                        <td className="sm-pts"><b>{t.points ?? '—'}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'club' && clubRank?.ranking && (
          <>
            <div className="sm-head">
              <h3>Клубный зачёт</h3>
              <div className="sm-sub">
                Сумма мест по {(clubRank.countedAgeGroups || []).join(', ') || 'возрастам'}
                {' · '}кто меньше — тот выше · {clubRank.totalClubs} клубов
              </div>
            </div>
            <div className="sm-table-wrap">
              <table className="sm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sm-team">Клуб</th>
                    {(clubRank.countedAgeGroups || []).map((a) => (
                      <th key={a} title={`Место в лиге ${a}`}>{a}</th>
                    ))}
                    <th title="Сумма мест по возрастам — главный показатель">Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {clubRank.ranking.map((c) => {
                    const medalCls = medalRowClass(clubPosClass(c.rank));
                    const isOurs = isLegirus(c.name);
                    const oursCls = isOurs ? 'sm-row--ours' : '';
                    return (
                      <tr key={c.name + c.rank} className={(oursCls + ' ' + medalCls).trim()}>
                        <td className="sm-pos">
                          {c.rank === 1 ? '🥇' : c.rank === 2 ? '🥈' : c.rank}
                        </td>
                        <td className="sm-team">
                          {c.shield && <img src={c.shield} alt="" />}
                          <span>{c.name}</span>
                        </td>
                        {(clubRank.countedAgeGroups || []).map((a) => {
                          const item = c.breakdown?.[a];
                          if (!item || !item.pos) {
                            return <td key={a} className="sm-pts" style={{ opacity: 0.4 }}>—</td>;
                          }
                          // Подсветка ячейки в зависимости от места клуба в той лиге
                          let cellMedal = '';
                          if (item.pos === 1) cellMedal = 'sm-cell--gold';
                          else if (item.pos === 2) cellMedal = 'sm-cell--silver';
                          else if (item.pos === 3) cellMedal = 'sm-cell--bronze';
                          return <td key={a} className={`sm-pts ${cellMedal}`.trim()}>{item.pos}</td>;
                        })}
                        <td className="sm-pts"><b>{c.posSum}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

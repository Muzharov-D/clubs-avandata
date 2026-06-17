import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { ratingColor } from './ratings';
import './avandata.css';

interface CPlayer { id: number; name: string; birthYear: number | null; position: string | null; rating: number | null }
interface CMatch { id: number; age: string; date: string; opponent: string; opponentLogo: string | null; gf: number | null; ga: number | null; outcome: 'w' | 'd' | 'l' }
interface ClubProfile {
  id: number; name: string; logo: string | null; division: string;
  rating: number; rank: number; divisionSize: number;
  teams: number; ageMin: number | null; ageMax: number | null;
  squad: number; avgRating: number | null;
  topPlayers: CPlayer[];
  talentShare: number | null; talentRank: number | null; talentClubs: number;
  recentMatches: CMatch[];
}

const num = (n: number) => n.toLocaleString('ru-RU');
const fmtDate = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', ''); } catch { return ''; } };
const OUT: Record<CMatch['outcome'], string> = { w: 'П', d: 'Н', l: 'М' };

/** Карточка клуба по клику — рейтинг, команды, лучшие игроки, производство таланта, матчи. */
export function ClubCard({ clubId, onClose }: { clubId: number; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'club', clubId], queryFn: () => api<ClubProfile>(`/federation/av/clubs/${clubId}`) });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const ages = data && data.ageMin && data.ageMax ? (data.ageMin === data.ageMax ? `${data.ageMin}` : `${data.ageMin}–${data.ageMax}`) : '—';

  return (
    <div className="av-modal__backdrop" onClick={onClose}>
      <div className="av-modal av-cc av-surface" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="av-modal__close" onClick={onClose} aria-label="Закрыть">×</button>

        {isLoading && <div className="av-skeleton" style={{ height: 420 }} />}
        {error && <div className="av-note">Не удалось загрузить карточку клуба.</div>}

        {data && (
          <>
            <header className="av-cc__head">
              <ClubShield name={data.name} logoUrl={data.logo} size={62} />
              <div style={{ minWidth: 0 }}>
                <h2 className="av-cc__name" title={data.name}>{data.name}</h2>
                <span className="av-chip av-chip--cyan">{data.division}</span>
              </div>
            </header>

            {/* Крыша из крупных чисел */}
            <div className="av-cc-roof">
              <div className="av-cc-stat av-cc-stat--hero">
                <div className="av-cc-stat__label">Место в лиге</div>
                <div className="av-cc-stat__value">#{data.rank}</div>
                <div className="av-cc-stat__sub">из {data.divisionSize}</div>
              </div>
              <div className="av-cc-stat">
                <div className="av-cc-stat__label">Рейтинг AvanData</div>
                <div className="av-cc-stat__value">{num(data.rating)}</div>
              </div>
              <div className="av-cc-stat">
                <div className="av-cc-stat__label">Команды</div>
                <div className="av-cc-stat__value">{data.teams}</div>
                <div className="av-cc-stat__sub">{ages} г.р.</div>
              </div>
              <div className="av-cc-stat">
                <div className="av-cc-stat__label">Средний класс</div>
                <div className="av-cc-stat__value" style={{ color: ratingColor(data.avgRating) }}>{data.avgRating != null ? num(data.avgRating) : '—'}</div>
                <div className="av-cc-stat__sub">{data.squad} игроков</div>
              </div>
            </div>

            {/* Лучшие игроки клуба */}
            {data.topPlayers.length > 0 && (
              <section className="av-cc-sec">
                <h3 className="av-cc-sec__title">Лучшие игроки</h3>
                <div className="av-cc-players">
                  {data.topPlayers.map((p) => (
                    <Link key={p.id} to={`/federation/players/${p.id}`} className="av-cc-player" onClick={onClose}>
                      <PlayerAvatar name={p.name} size={46} />
                      <span className="av-cc-player__name" title={p.name}>{p.name}</span>
                      <span className="av-cc-player__meta">{p.birthYear ?? '—'}{p.position ? ` · ${p.position.split(' ').pop()}` : ''}</span>
                      <span className="av-cc-player__rate" style={{ color: ratingColor(p.rating) }}>{p.rating ?? '—'}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Производство таланта */}
            <section className="av-cc-sec">
              <h3 className="av-cc-sec__title">Производство таланта</h3>
              {data.talentShare != null ? (
                <p className="av-cc-talent">
                  <b className="av-cc-talent__big">{data.talentShare}%</b>
                  <span>сильнейших игроков лиги — воспитанники клуба{data.talentRank ? <> · <b style={{ color: 'var(--av-text)' }}>{data.talentRank}-я</b> школа лиги по производству таланта из {data.talentClubs}</> : null}</span>
                </p>
              ) : (
                <p className="av-note" style={{ margin: 0 }}>Клуб пока вне топ-производителей таланта лиги.</p>
              )}
            </section>

            {/* Последние матчи */}
            {data.recentMatches.length > 0 && (
              <section className="av-cc-sec">
                <h3 className="av-cc-sec__title">Последние матчи</h3>
                <div className="av-cc-form">
                  {data.recentMatches.map((m, i) => (
                    <div key={i} className="av-cc-match">
                      <span className={`av-cc-out av-cc-out--${m.outcome}`}>{OUT[m.outcome]}</span>
                      <ClubShield name={m.opponent} logoUrl={m.opponentLogo} size={22} />
                      <span className="av-cc-match__opp" title={m.opponent}>{m.opponent}</span>
                      <span className="av-cc-match__age">{m.age}</span>
                      <span className="av-cc-match__score">{m.gf ?? '–'}:{m.ga ?? '–'}</span>
                      <span className="av-cc-match__date">{fmtDate(m.date)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

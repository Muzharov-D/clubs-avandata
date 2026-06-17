import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { ratingColor } from './ratings';
import './avandata.css';

interface Side { id: number | null; name: string; logo: string | null; score: number | null }
interface StatRow { eventType: string; title: string; home: number; away: number }
interface TopEvent { eventType: string; name: string; count: number }
interface Best { id: number | null; name: string; team: string | null; role: string | null; rating: number | null; topEvents: TopEvent[] }
interface Goal { team: 'home' | 'away'; player: string; minute: number | null; assist: string | null; kind: 'goal' | 'own_goal' | 'penalty'; addedTime: boolean }
interface CardEv { team: 'home' | 'away'; player: string; minute: number | null; kind: 'yellow' | 'red' | 'yellow_to_red'; reason: string }
interface Person { name: string; role: string }
interface Officials { referees: Person[]; homeCoaches: Person[]; awayCoaches: Person[] }
interface Detail {
  id: number; title: string; home: Side; away: Side; best: Best | null; stats: StatRow[];
  goals: Goal[]; cards: CardEv[]; officials: Officials | null; protocolUrl: string | null;
}

/** Базовый контекст из карточки результата — мгновенная шапка, пока грузится глубина. */
export interface MatchBase {
  id: number; age: string; division: string; date: string;
  home: { name: string; logo: string | null; score: number | null };
  away: { name: string; logo: string | null; score: number | null };
}

const fmtDate = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso)); } catch { return ''; } };
const goalSuffix = (g: Goal) => (g.kind === 'penalty' ? ' (пен)' : g.kind === 'own_goal' ? ' (аг)' : '');
const min = (m: number | null, added = false) => `${m ?? 0}${added ? '+' : ''}′`;

/** Карточка матча по клику: счёт, голы, игрок матча, сравнение команд, карточки, судьи/тренеры. */
export function MatchDetail({ base, onClose }: { base: MatchBase; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'match', base.id],
    queryFn: () => api<Detail>(`/federation/av/matches/${base.id}`),
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const hs = base.home.score ?? data?.home.score ?? 0;
  const as = base.away.score ?? data?.away.score ?? 0;
  const cardsHome = data?.cards.filter((c) => c.team === 'home') ?? [];
  const cardsAway = data?.cards.filter((c) => c.team === 'away') ?? [];
  const off = data?.officials;
  const hasOfficials = !!off && (off.referees.length > 0 || off.homeCoaches.length > 0 || off.awayCoaches.length > 0);

  return (
    <div className="av-modal__backdrop" onClick={onClose}>
      <div className="av-modal av-surface" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="av-modal__close" onClick={onClose} aria-label="Закрыть">×</button>

        {/* Шапка: контекст + счёт */}
        <div className="av-mhead">
          <div className="av-mhead__meta">{base.age} · {base.division} · {fmtDate(base.date)}</div>
          <div className="av-mscore">
            <div className="av-mscore__team">
              <ClubShield name={base.home.name} logoUrl={base.home.logo} size={46} />
              <span className="av-mscore__name" title={base.home.name}>{base.home.name}</span>
            </div>
            <div className="av-mscore__nums">
              <b className={hs >= as ? 'av-mscore__w' : 'av-mscore__l'}>{hs}</b>
              <span className="av-mscore__sep">:</span>
              <b className={as >= hs ? 'av-mscore__w' : 'av-mscore__l'}>{as}</b>
            </div>
            <div className="av-mscore__team">
              <ClubShield name={base.away.name} logoUrl={base.away.logo} size={46} />
              <span className="av-mscore__name" title={base.away.name}>{base.away.name}</span>
            </div>
          </div>
        </div>

        {error && <div className="av-note">Не удалось загрузить детали матча.</div>}
        {isLoading && <div className="av-skeleton" style={{ height: 280, marginTop: 8 }} />}

        {data && (
          <>
            {/* Голы */}
            {data.goals.length > 0 && (
              <section className="av-msection">
                <h3 className="av-msection__title">Голы</h3>
                <div className="av-goals">
                  {data.goals.map((g, i) => (
                    <div key={i} className="av-goal">
                      <span className="av-goal__h">{g.team === 'home' && <><span className="av-goal__pl">{g.player}{goalSuffix(g)}{g.assist ? <i className="av-goal__as"> · {g.assist}</i> : null}</span><span className="av-goal__ball">⚽</span></>}</span>
                      <span className="av-goal__min">{min(g.minute, g.addedTime)}</span>
                      <span className="av-goal__a">{g.team === 'away' && <><span className="av-goal__ball">⚽</span><span className="av-goal__pl">{g.player}{goalSuffix(g)}{g.assist ? <i className="av-goal__as"> · {g.assist}</i> : null}</span></>}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Игрок матча */}
            {data.best && (
              <section className="av-msection">
                <h3 className="av-msection__title">Игрок матча</h3>
                <div className="av-mbest">
                  {data.best.id ? (
                    <Link to={`/federation/players/${data.best.id}`} className="av-mbest__id" onClick={onClose}>
                      <PlayerAvatar name={data.best.name} size={48} ring />
                      <div style={{ minWidth: 0 }}>
                        <div className="av-mbest__name">{data.best.name}</div>
                        <div className="av-mbest__meta">{data.best.team ?? '—'}{data.best.role ? ` · ${data.best.role}` : ''}</div>
                      </div>
                    </Link>
                  ) : (
                    <div className="av-mbest__id">
                      <PlayerAvatar name={data.best.name} size={48} ring />
                      <div style={{ minWidth: 0 }}>
                        <div className="av-mbest__name">{data.best.name}</div>
                        <div className="av-mbest__meta">{data.best.team ?? '—'}{data.best.role ? ` · ${data.best.role}` : ''}</div>
                      </div>
                    </div>
                  )}
                  <span className="av-rate av-mbest__rate" style={{ color: ratingColor(data.best.rating) }}>{data.best.rating ?? '—'}</span>
                </div>
                {data.best.topEvents.length > 0 && (
                  <div className="av-mbest__events">
                    {data.best.topEvents.map((e) => (
                      <span key={e.eventType} className="av-chip av-chip--cyan">{e.name} · {e.count}</span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Сравнение команд по событиям */}
            {data.stats.length > 0 && (
              <section className="av-msection">
                <h3 className="av-msection__title">Команды в матче</h3>
                <div className="av-mstats">
                  {data.stats.map((s) => {
                    const tot = s.home + s.away || 1;
                    const hWin = s.home >= s.away;
                    return (
                      <div key={s.eventType} className="av-mstat">
                        <span className={`av-mstat__n${hWin ? ' av-mstat__n--w' : ''}`}>{s.home}</span>
                        <div className="av-mstat__mid">
                          <span className="av-mstat__title">{s.title}</span>
                          <span className="av-mstat__bar">
                            <span className="av-mstat__fh" style={{ width: `${(s.home / tot) * 100}%` }} />
                            <span className="av-mstat__fa" style={{ width: `${(s.away / tot) * 100}%` }} />
                          </span>
                        </div>
                        <span className={`av-mstat__n${!hWin ? ' av-mstat__n--w' : ''}`}>{s.away}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Карточки */}
            {data.cards.length > 0 && (
              <section className="av-msection">
                <h3 className="av-msection__title">Карточки</h3>
                <div className="av-mcards">
                  <CardCol cards={cardsHome} align="left" />
                  <CardCol cards={cardsAway} align="right" />
                </div>
              </section>
            )}

            {/* Судьи и тренеры */}
            {hasOfficials && (
              <section className="av-msection">
                <h3 className="av-msection__title">Судьи и тренеры</h3>
                <div className="av-mofficials">
                  {off!.referees.length > 0 && (
                    <div className="av-moff__block">
                      <div className="av-moff__lbl">Судейство</div>
                      {off!.referees.map((r, i) => (
                        <div key={i} className="av-moff__row"><span className="av-moff__role">{r.role}</span><span className="av-moff__name">{r.name}</span></div>
                      ))}
                    </div>
                  )}
                  <div className="av-moff__teams">
                    <CoachBlock title={base.home.name} coaches={off!.homeCoaches} />
                    <CoachBlock title={base.away.name} coaches={off!.awayCoaches} />
                  </div>
                </div>
              </section>
            )}

            {data.protocolUrl && (
              <a className="av-mprotocol" href={data.protocolUrl} target="_blank" rel="noreferrer">Протокол матча на stat.ffspb.org →</a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const CARD_CLS: Record<CardEv['kind'], string> = { yellow: 'yellow', red: 'red', yellow_to_red: 'red' };
function CardCol({ cards, align }: { cards: CardEv[]; align: 'left' | 'right' }) {
  return (
    <div className={`av-mcardcol av-mcardcol--${align}`}>
      {cards.length === 0 ? <span className="av-dim" style={{ fontSize: 12 }}>—</span> : cards.map((c, i) => (
        <div key={i} className="av-mcardrow" title={c.reason}>
          <span className={`av-card-pip av-card-pip--${CARD_CLS[c.kind]}`} />
          <span className="av-mcardrow__name">{c.player}</span>
          <span className="av-mcardrow__min">{min(c.minute)}</span>
        </div>
      ))}
    </div>
  );
}

function CoachBlock({ title, coaches }: { title: string; coaches: Person[] }) {
  return (
    <div className="av-moff__block">
      <div className="av-moff__lbl" title={title}>{title}</div>
      {coaches.length === 0 ? <span className="av-dim" style={{ fontSize: 12 }}>—</span> : coaches.map((c, i) => (
        <div key={i} className="av-moff__row"><span className="av-moff__role">{c.role}</span><span className="av-moff__name">{c.name}</span></div>
      ))}
    </div>
  );
}

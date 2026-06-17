import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { ratingColor } from './ratings';
import './avandata.css';

interface Card { player: string; minute: string }
interface Side { id: number | null; name: string; logo: string | null; score: number | null; yellow: Card[]; red: Card[] }
interface StatRow { eventType: string; title: string; home: number; away: number }
interface TopEvent { eventType: string; name: string; count: number }
interface Best { id: number | null; name: string; team: string | null; role: string | null; rating: number | null; topEvents: TopEvent[] }
interface Detail { id: number; title: string; home: Side; away: Side; best: Best | null; stats: StatRow[]; leaders: unknown[] }

/** Базовый контекст из карточки результата — мгновенная шапка, пока грузится глубина. */
export interface MatchBase {
  id: number; age: string; division: string; date: string;
  home: { name: string; logo: string | null; score: number | null };
  away: { name: string; logo: string | null; score: number | null };
}

const fmtDate = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso)); } catch { return ''; } };

/** Карточка матча по клику: счёт, игрок матча, сравнение команд по событиям, карточки. */
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

  const home = data?.home;
  const away = data?.away;
  const hs = base.home.score ?? home?.score ?? 0;
  const as = base.away.score ?? away?.score ?? 0;

  return (
    <div className="av-modal__backdrop" onClick={onClose}>
      <div className="av-modal av-surface" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="av-modal__close" onClick={onClose} aria-label="Закрыть">×</button>

        {/* Шапка: контекст + счёт (мгновенно из base) */}
        <div className="av-mhead">
          <div className="av-mhead__meta">{base.age} · {base.division} · {fmtDate(base.date)}</div>
          <div className="av-mscore">
            <div className="av-mscore__team av-mscore__team--h">
              <ClubShield name={base.home.name} logoUrl={base.home.logo} size={46} />
              <span className="av-mscore__name" title={base.home.name}>{base.home.name}</span>
            </div>
            <div className="av-mscore__nums">
              <b className={hs >= as ? 'av-mscore__w' : 'av-mscore__l'}>{hs}</b>
              <span className="av-mscore__sep">:</span>
              <b className={as >= hs ? 'av-mscore__w' : 'av-mscore__l'}>{as}</b>
            </div>
            <div className="av-mscore__team av-mscore__team--a">
              <ClubShield name={base.away.name} logoUrl={base.away.logo} size={46} />
              <span className="av-mscore__name" title={base.away.name}>{base.away.name}</span>
            </div>
          </div>
        </div>

        {error && <div className="av-note">Не удалось загрузить детали матча.</div>}
        {isLoading && <div className="av-skeleton" style={{ height: 280, marginTop: 8 }} />}

        {data && (
          <>
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
            {(home?.yellow.length || home?.red.length || away?.yellow.length || away?.red.length) ? (
              <section className="av-msection">
                <h3 className="av-msection__title">Карточки</h3>
                <div className="av-mcards">
                  <CardCol side={home} align="left" />
                  <CardCol side={away} align="right" />
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function CardCol({ side, align }: { side?: Side; align: 'left' | 'right' }) {
  if (!side) return <div />;
  const rows = [...side.red.map((c) => ({ ...c, kind: 'red' as const })), ...side.yellow.map((c) => ({ ...c, kind: 'yellow' as const }))];
  return (
    <div className={`av-mcardcol av-mcardcol--${align}`}>
      {rows.length === 0 ? <span className="av-dim" style={{ fontSize: 12 }}>—</span> : rows.map((c, i) => (
        <div key={i} className="av-mcardrow">
          <span className={`av-card-pip av-card-pip--${c.kind}`} />
          <span className="av-mcardrow__name">{c.player}</span>
          <span className="av-mcardrow__min">{c.minute}′</span>
        </div>
      ))}
    </div>
  );
}

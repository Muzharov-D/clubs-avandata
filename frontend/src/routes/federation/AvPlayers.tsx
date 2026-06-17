import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError, FedEmpty } from './FedState';
import { ratingColor } from './ratings';
import { useFedYear, fedQ } from './avYear';
import './avandata.css';

interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; rating: number | null }

const lastName = (s: string) => { const w = s.trim().split(/\s+/); return w.length > 1 ? w[w.length - 1] : s; };

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
const lineOf = (pos: string | null): Line | null => {
  const p = (pos ?? '').toLowerCase();
  if (/врат/.test(p)) return 'GK';
  if (/полуз/.test(p)) return 'MID';          // «полуЗАЩИТник» содержит «защит» — проверяем ПЕРВЫМ
  if (/защит|фулбек/.test(p)) return 'DEF';
  if (/напад|форвард/.test(p)) return 'FWD';
  return null;
};

// 4-3-3, координаты в % (атака вверх, ворота внизу)
const SLOTS: Array<{ line: Line; l: number; t: number; tag: string }> = [
  { line: 'GK', l: 50, t: 88, tag: 'ВРТ' },
  { line: 'DEF', l: 14, t: 70, tag: 'ЗАЩ' }, { line: 'DEF', l: 38, t: 74, tag: 'ЗАЩ' }, { line: 'DEF', l: 62, t: 74, tag: 'ЗАЩ' }, { line: 'DEF', l: 86, t: 70, tag: 'ЗАЩ' },
  { line: 'MID', l: 24, t: 50, tag: 'ПЗЩ' }, { line: 'MID', l: 50, t: 46, tag: 'ПЗЩ' }, { line: 'MID', l: 76, t: 50, tag: 'ПЗЩ' },
  { line: 'FWD', l: 24, t: 24, tag: 'НАП' }, { line: 'FWD', l: 50, t: 20, tag: 'НАП' }, { line: 'FWD', l: 76, t: 24, tag: 'НАП' },
];

/** Таланты региона — реестр + «Сборная региона» (лучшие по позициям на данных). */
export function FederationAvPlayers() {
  const { year, division } = useFedYear();
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'players', year, division], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, division)}`) });
  const players = data?.players ?? [];
  const [club, setClub] = useState('all');
  const [qStr, setQStr] = useState('');

  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.club).filter(Boolean))).sort() as string[], [players]);
  const shown = useMemo(() => {
    let list = players;
    if (club !== 'all') list = list.filter((p) => p.club === club);
    if (qStr.trim()) { const q = qStr.toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(q)); }
    return list.slice(0, 250);
  }, [players, club, qStr]);

  // Сборная региона: лучшие по РЕАЛЬНЫМ позициям. Без «добора» — пустой слот
  // честно показывает перекос состава (нет вратарей / мало защитников и т.п.).
  const xi = useMemo(() => {
    const rated = players.filter((p) => p.rating != null);
    const byLine: Record<Line, RPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of rated) { const l = lineOf(p.position); if (l) byLine[l].push(p); }
    (Object.keys(byLine) as Line[]).forEach((l) => byLine[l].sort((a, b) => (b.rating as number) - (a.rating as number)));
    const pool: Record<Line, RPlayer[]> = { GK: [...byLine.GK], DEF: [...byLine.DEF], MID: [...byLine.MID], FWD: [...byLine.FWD] };
    return SLOTS.map((s) => ({ ...s, player: pool[s.line].shift() }));
  }, [players]);
  const xiFilled = xi.filter((s) => s.player).length;

  // Восходящие — высокий рейтинг среди МЛАДШИХ когорт (честный сигнал «кто растёт»).
  const rising = useMemo(() => {
    const rated = players.filter((p) => p.rating != null && p.birthYear != null);
    if (rated.length < 3) return [];
    const years = Array.from(new Set(rated.map((p) => p.birthYear!))).sort((a, b) => b - a);
    const young = new Set(years.slice(0, 2));
    return rated.filter((p) => young.has(p.birthYear!)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 6);
  }, [players]);

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Игроки региона</h1>
          <p className="av-sub">{players.length.toLocaleString('ru-RU')} разобранных игроков · клик → профиль</p>
        </div>
        <input className="av-search" placeholder="Поиск по имени…" value={qStr} onChange={(e) => setQStr(e.target.value)} />
      </header>

      {error && <FedError />}

      <div className="av-split av-rise">
        {/* Реестр */}
        <section className="av-surface av-pad-lg">
          <div className="av-section"><h2 className="av-section-title">Рейтинг игроков</h2></div>

          {clubs.length > 1 && (
            <select className="av-select" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Фильтр по клубу">
              <option value="all">Все клубы ({clubs.length})</option>
              {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {isLoading ? [0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="av-skeleton" style={{ height: 42, marginBottom: 8 }} />)
            : shown.length === 0 ? <FedEmpty icon="🎯">Никого не нашли по фильтру.</FedEmpty>
              : shown.map((p, i) => (
                <Link key={p.id} to={`/federation/players/${p.id}`} className="av-trow t-reg av-trow--link">
                  <span className="av-trow__rank">{i + 1}</span>
                  <ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className="av-trow__name">{p.name}</div>
                    <div className="av-trow__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                  </div>
                  <span className="av-rate" style={{ color: ratingColor(p.rating) }}>{p.rating ?? '—'}</span>
                </Link>
              ))}
          {!isLoading && players.length > shown.length && (
            <p className="av-cap">Показаны топ-{shown.length} из {players.length.toLocaleString('ru-RU')} по рейтингу — уточни клубом или поиском, чтобы увидеть остальных.</p>
          )}
        </section>

        {/* Сборная региона + восходящие */}
        <aside className="av-sticky">
          <section className="av-surface av-surface--feature av-pad-lg">
            <div className="av-section" style={{ marginBottom: 10 }}>
              <div>
                <h2 className="av-section-title">Лучшие игроки региона</h2>
                <p className="av-section-sub">Лучшие по реальным позициям · пустой слот = нет игрока</p>
              </div>
            </div>
            {isLoading ? <div className="av-skeleton" style={{ aspectRatio: '4 / 5' }} /> : xiFilled < 4 ? (
              <div className="av-note">Мало разобранных игроков для сборной.</div>
            ) : (
              <div className="av-pitch">
                <svg className="av-pitch__field" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="av-grass" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#176b3c" /><stop offset="50%" stopColor="#0e4d2a" /><stop offset="100%" stopColor="#176b3c" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="100" height="100" fill="url(#av-grass)" />
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <rect key={i} x="0" y={i * 10} width="100" height="10" fill={i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.07)'} />)}
                  <g fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4">
                    <rect x="2" y="2" width="96" height="96" />
                    <line x1="2" y1="50" x2="98" y2="50" />
                    <circle cx="50" cy="50" r="9" />
                    <rect x="24" y="2" width="52" height="14" />
                    <rect x="38" y="2" width="24" height="5.5" />
                    <rect x="24" y="84" width="52" height="14" />
                    <rect x="38" y="92.5" width="24" height="5.5" />
                  </g>
                  <circle cx="50" cy="50" r="0.7" fill="rgba(255,255,255,0.5)" />
                </svg>
                {xi.map((s, idx) => s.player ? (
                  <Link key={idx} to={`/federation/players/${s.player.id}`} className="av-slot av-slot--filled" style={{ left: `${s.l}%`, top: `${s.t}%` }} title={s.player.name}>
                    <span className="av-slot__node">
                      <PlayerAvatar name={s.player.name} size={46} ring={s.line === 'GK'} />
                      <span className="av-slot__badge" style={{ color: ratingColor(s.player.rating) }}>{s.player.rating}</span>
                    </span>
                    <span className="av-slot__name">{lastName(s.player.name)}</span>
                  </Link>
                ) : (
                  <span key={idx} className="av-slot" style={{ left: `${s.l}%`, top: `${s.t}%` }}>
                    <span className="av-slot__empty" />
                    <span className="av-slot__tag">{s.tag}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          {rising.length > 0 && (
            <section className="av-surface av-pad-lg">
              <div className="av-section" style={{ marginBottom: 10 }}>
                <div>
                  <h2 className="av-section-title">Восходящие</h2>
                  <p className="av-section-sub">Высокий рейтинг среди младших</p>
                </div>
              </div>
              <div className="av-rising">
                {rising.map((p) => (
                  <Link key={p.id} to={`/federation/players/${p.id}`} className="av-rising__row">
                    <PlayerAvatar name={p.name} size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div className="av-rising__name">{p.name}</div>
                      <div className="av-rising__meta">{p.club ?? '—'} · {p.birthYear} г.р.</div>
                    </div>
                    <span className="av-rate">{p.rating}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

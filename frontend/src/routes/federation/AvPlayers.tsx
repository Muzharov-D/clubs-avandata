import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { useFedYear, yearQ } from './avYear';
import './avandata.css';

interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; rating: number | null }

const lastName = (s: string) => { const w = s.trim().split(/\s+/); return w.length > 1 ? w[w.length - 1] : s; };

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
const lineOf = (pos: string | null): Line | null => {
  const p = (pos ?? '').toLowerCase();
  if (/врат/.test(p)) return 'GK';
  if (/защит/.test(p)) return 'DEF';
  if (/полуз/.test(p)) return 'MID';
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
  const { year } = useFedYear();
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'players', year], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${yearQ(year)}`) });
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

  // Сборная региона: лучшие по линиям на клиенте (знаменатель — у федерации).
  const xi = useMemo(() => {
    const rated = players.filter((p) => p.rating != null);
    const byLine: Record<Line, RPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of rated) { const l = lineOf(p.position); if (l) byLine[l].push(p); }
    (Object.keys(byLine) as Line[]).forEach((l) => byLine[l].sort((a, b) => (b.rating as number) - (a.rating as number)));
    const used = new Set<number>();
    const need: Record<Line, number> = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
    const pick: Record<Line, RPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    (Object.keys(need) as Line[]).forEach((l) => { for (const p of byLine[l]) { if (pick[l].length >= need[l]) break; pick[l].push(p); used.add(p.id); } });
    // добор недостающих из любых рейтинговых
    const spare = rated.filter((p) => !used.has(p.id)).sort((a, b) => (b.rating as number) - (a.rating as number));
    return SLOTS.map((s) => {
      let pl = pick[s.line].shift();
      let provisional = false;
      if (!pl) { pl = spare.shift(); provisional = true; } // позиция дозаполнена — честно метим
      return { ...s, player: pl, provisional };
    });
  }, [players]);
  const xiReady = xi.filter((s) => s.player).length >= 7;
  const xiProvisional = xi.some((s) => s.player && s.provisional);
  // Корневой фикс: если позиций в данных мало — расстановка превращается в шум.
  // Честный фолбэк на «Топ-11 региона» списком, когда явных позиций < 6.
  const xiReal = xi.filter((s) => s.player && !s.provisional).length;
  const xiPitchOk = xiReady && xiReal >= 6;
  const top11 = useMemo(() => players.filter((p) => p.rating != null).slice(0, 11), [players]);

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
          <span className="av-kicker">Скаутинг-борд федерации</span>
          <h1 className="av-title">Таланты региона</h1>
          <p className="av-sub">{players.length.toLocaleString('ru-RU')} разобранных игроков · {year == null ? 'все возрасты' : `${year} г.р.`} · клик → профиль</p>
        </div>
        <input className="av-search" placeholder="Поиск по имени…" value={qStr} onChange={(e) => setQStr(e.target.value)} />
      </header>

      {error && <div className="av-surface av-pad av-note av-rise" style={{ color: 'var(--av-danger)' }}>База разборов недоступна — задан ли <code>AVANDATA_API_KEY</code> на сервере?</div>}

      <div className="av-split av-rise">
        {/* Реестр */}
        <section className="av-surface av-pad-lg">
          <div className="av-section">
            <div>
              <h2 className="av-section-title">Реестр игроков</h2>
              <p className="av-section-sub">Ранжированы по рейтингу разборов</p>
            </div>
            {players.length > shown.length && <span className="av-chip av-chip--dim">топ {shown.length}</span>}
          </div>

          {clubs.length > 1 && (
            <div className="av-pills" style={{ marginBottom: 14 }}>
              <button onClick={() => setClub('all')} className={`av-pill${club === 'all' ? ' av-pill--active' : ''}`}>все клубы</button>
              {clubs.slice(0, 18).map((c) => <button key={c} onClick={() => setClub(c)} className={`av-pill${club === c ? ' av-pill--active' : ''}`}>{c}</button>)}
              {clubs.length > 18 && <span className="av-chip av-chip--dim" title="Видны первые 18 — остальные доступны поиском">+{clubs.length - 18} клубов</span>}
            </div>
          )}

          {isLoading ? [0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="av-skeleton" style={{ height: 42, marginBottom: 8 }} />)
            : shown.length === 0 ? <div className="av-empty"><div className="av-empty__icon">🎯</div>Никого не нашли по фильтру.</div>
              : shown.map((p, i) => (
                <Link key={p.id} to={`/federation/players/${p.id}`} className="av-trow t-reg av-trow--link">
                  <span className="av-trow__rank">{i + 1}</span>
                  <ClubShield name={p.club ?? p.name} logoUrl={p.clubLogo} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className="av-trow__name">{p.name}</div>
                    <div className="av-trow__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                  </div>
                  <span className={`av-rate${p.rating != null && p.rating < 0 ? ' av-rate--neg' : ''}`}>{p.rating ?? '—'}</span>
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
                <h2 className="av-section-title">Сборная региона</h2>
                <p className="av-section-sub">{xiPitchOk ? 'Лучшие по позициям' : 'Топ-11 по рейтингу'} · {year == null ? 'все возрасты' : `${year} г.р.`}</p>
              </div>
            </div>
            {isLoading ? <div className="av-skeleton" style={{ aspectRatio: '4 / 5' }} /> : !xiReady ? (
              <div className="av-note">Мало разобранных игроков для сборной.</div>
            ) : xiPitchOk ? (
              <>
                <div className="av-pitch">
                  <span className="av-pitch__circle" />
                  <span className="av-pitch__mid" />
                  <span className="av-pitch__box av-pitch__box--top" />
                  <span className="av-pitch__box av-pitch__box--bot" />
                  {xi.map((s, idx) => s.player && (
                    <Link key={idx} to={`/federation/players/${s.player.id}`} className="av-slot" style={{ left: `${s.l}%`, top: `${s.t}%` }}>
                      <PlayerAvatar name={s.player.name} size={38} ring={s.line === 'FWD'} />
                      <span className="av-slot__name" title={s.player.name}>{lastName(s.player.name)}</span>
                      <span className="av-slot__rate">{s.player.rating}</span>
                      <span className="av-slot__prov">{s.provisional ? 'добор' : s.tag}</span>
                    </Link>
                  ))}
                </div>
                {xiProvisional && <p className="av-cap">«добор» — позиция дозаполнена лучшим доступным игроком (в данных нет явной позиции).</p>}
              </>
            ) : (
              <>
                <div className="av-rising">
                  {top11.map((p) => (
                    <Link key={p.id} to={`/federation/players/${p.id}`} className="av-rising__row">
                      <PlayerAvatar name={p.name} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div className="av-rising__name">{p.name}</div>
                        <div className="av-rising__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                      </div>
                      <span className="av-rate">{p.rating}</span>
                    </Link>
                  ))}
                </div>
                <p className="av-cap">Позиции игроков в данных не размечены — показываем топ-11 региона по рейтингу вместо расстановки.</p>
              </>
            )}
          </section>

          {rising.length > 0 && (
            <section className="av-surface av-pad-lg">
              <div className="av-section" style={{ marginBottom: 10 }}>
                <div>
                  <h2 className="av-section-title">Восходящие</h2>
                  <p className="av-section-sub">Высокий рейтинг среди младших · {year == null ? 'младшие возрасты региона' : `${year} г.р.`}</p>
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

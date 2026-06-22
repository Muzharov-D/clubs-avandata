import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError, FedEmpty } from './FedState';
import { ratingLabel, rating10Color } from './ratings';
import { useFedYear, fedQ } from './avYear';
import './avandata.css';

interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo?: string | null; rating: number | null; mp?: number }

const lastName = (s: string) => { const w = s.trim().split(/\s+/); return w.length > 1 ? w[w.length - 1] : s; };
const plMatch = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };

/**
 * «Рейтинг игроков региона» — реестр-лидерборд + восходящие младших когорт.
 * Поле «сборной» здесь УБРАНО намеренно: единственное поле на экране «Таланты» —
 * «Сборная региона» (BestXiBody), чтобы не дублировать питч. Этот блок отвечает
 * за длинный рейтинг + «кого регион обязан не потерять».
 *
 * Когорта: server-side через fedQ(year, division) из глобального useFedYear —
 * «все» = весь регион (совокупность), выбранный год = одна когорта.
 * Рейтинг — АБСОЛЮТНЫЙ AvanData (методика продукта), не нормируем; цвет — по rating10Color.
 */
export function FederationAvPlayers() {
  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Игроки региона</h1>
          <p className="av-sub">Рейтинг игроков по разбору AvanData · клик → профиль</p>
        </div>
      </header>
      <RegionLeaderboardBody />
    </>
  );
}

/**
 * Тело: рейтинг-лидерборд (с поиском/фильтром клуба) + восходящие. Без шапки экрана.
 * Флаги позволяют встраивать части по отдельности (лидерборд в колонку, восходящие
 * лентой во всю ширину). Один и тот же queryKey — повторный вызов дедуплицируется.
 */
export function RegionLeaderboardBody({ withRising = true, withLeaderboard = true }: { withRising?: boolean; withLeaderboard?: boolean }) {
  const { year, division } = useFedYear();
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'players', year, division], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, division)}`) });
  const players = data?.players ?? [];
  const [club, setClub] = useState('all');
  const [qStr, setQStr] = useState('');
  const [peek, setPeek] = useState<RPlayer | null>(null);

  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.club).filter(Boolean))).sort() as string[], [players]);
  // «С рейтингом» — минимум 2 оценённых матча (рейтинг = среднее по матчам, не пик).
  const ratedTotal = useMemo(() => players.filter((p) => (p.mp ?? 0) >= 2).length, [players]);

  const shown = useMemo(() => {
    // При поиске ищем по всем; при обычном просмотре — только игроки с рейтингом (≥2 матчей).
    let list = qStr.trim() ? players : players.filter((p) => (p.mp ?? 0) >= 2);
    if (club !== 'all') list = list.filter((p) => p.club === club);
    if (qStr.trim()) { const q = qStr.toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(q)); }
    // Сортировка — по АБСОЛЮТНОМУ рейтингу AvanData (методика). Возрастной срез — через
    // верхний фильтр (год = одна когорта; «Все» = совокупность региона).
    return list.slice().sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)).slice(0, 250);
  }, [players, club, qStr]);

  // Восходящие — высокий рейтинг среди МЛАДШИХ когорт (честный сигнал «кто растёт»):
  // ядро работы федерации — заметить талант в младших, пока есть время дать ему ход.
  const rising = useMemo(() => {
    const rated = players.filter((p) => p.rating != null && p.birthYear != null && (p.mp ?? 0) >= 2);
    if (rated.length < 3) return [] as RPlayer[];
    const years = Array.from(new Set(rated.map((p) => p.birthYear!))).sort((a, b) => b - a);
    const young = new Set(years.slice(0, 2));
    return rated.filter((p) => young.has(p.birthYear!)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 12);
  }, [players]);
  const risingYears = useMemo(() => Array.from(new Set(rising.map((p) => p.birthYear!))).sort((a, b) => b - a), [rising]);

  return (
    <>
      {error && <FedError />}

      {withLeaderboard && (
        <section className="av-surface av-pad-lg av-rise">
          <div className="av-section">
            <div>
              <h2 className="av-section-title">Рейтинг игроков</h2>
              <p className="av-section-sub" style={{ margin: '2px 0 0' }}>
                {players.length.toLocaleString('ru-RU')} разобранных{year != null ? ` · ${year} г.р.` : ' · все возрасты'} · рейтинг AvanData
              </p>
            </div>
            <input className="av-search" placeholder="Поиск по имени…" value={qStr} onChange={(e) => setQStr(e.target.value)} />
          </div>

          {clubs.length > 1 && (
            <select className="av-select" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Фильтр по клубу">
              <option value="all">Все клубы ({clubs.length})</option>
              {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {isLoading ? [0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="av-skeleton" style={{ height: 42, marginBottom: 8 }} />)
            : shown.length === 0 ? <FedEmpty>Никого не нашли по фильтру.</FedEmpty>
              : (
                <div className="av-leaders">
                  {shown.map((p, i) => (
                    <Link key={p.id} to={`/federation/players/${p.id}`} className="av-surface-soft av-leader">
                      <span className="av-leader__rank">{i + 1}</span>
                      <PlayerAvatar name={p.name} photoUrl={p.photo} size={40} />
                      <div className="av-leader__id">
                        <div className="av-leader__name" title={p.name}>{p.name}</div>
                        <div className="av-leader__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                      </div>
                      <span className="av-leader__rate" style={{ color: rating10Color(p.rating) }} title="рейтинг AvanData">{ratingLabel(p.rating)}</span>
                    </Link>
                  ))}
                </div>
              )}
          {!isLoading && !qStr.trim() && ratedTotal > shown.length && (
            <p className="av-cap">Показаны топ-{shown.length} из {ratedTotal.toLocaleString('ru-RU')} с рейтингом (≥2 матчей) — уточни клубом или поиском.</p>
          )}
        </section>
      )}

      {withRising && rising.length > 0 && (
        <section className="av-surface av-pad-lg av-rise">
          <div className="av-section">
            <div>
              <h2 className="av-section-title">Восходящие игроки</h2>
              <p className="av-section-sub">Сильнейшие в младших когортах{risingYears.length ? ` · ${risingYears.join(' · ')} г.р.` : ''} — кого регион обязан не потерять</p>
            </div>
          </div>
          <div className="av-rising-grid">
            {rising.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="av-surface-soft av-rcard">
                <span className="av-rcard__rank">{i + 1}</span>
                <PlayerAvatar name={p.name} photoUrl={p.photo} size={42} />
                <div className="av-rcard__id">
                  <div className="av-rcard__name" title={p.name}>{p.name}</div>
                  <div className="av-rcard__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}</div>
                </div>
                <span className="av-rcard__year" title="год рождения">{p.birthYear}</span>
                <span className="av-rcard__rate" style={{ color: rating10Color(p.rating) }}>{ratingLabel(p.rating)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {peek && <XiPeek p={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

/** Карточка игрока — открывается по клику, без ухода со страницы. */
function XiPeek({ p, onClose }: { p: RPlayer; onClose: () => void }) {
  return (
    <div className="av-modal__backdrop" onClick={onClose} role="presentation">
      <div className="av-peek" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <button type="button" className="av-modal__close" onClick={onClose} aria-label="Закрыть">✕</button>
        <div className="av-peek__head">
          <PlayerAvatar name={p.name} photoUrl={p.photo} size={66} ring />
          <div style={{ minWidth: 0 }}>
            <div className="av-peek__name">{p.name}</div>
            <div className="av-peek__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear} г.р.` : ''}</div>
          </div>
          <span className="av-peek__rate" style={{ color: rating10Color(p.rating) }}>{ratingLabel(p.rating)}</span>
        </div>
        <div className="av-peek__foot">
          <span className="av-peek__mp">{p.mp ? `рейтинг AvanData · среднее за ${p.mp} ${plMatch(p.mp)}` : 'рейтинг AvanData · среднее по матчам'}</span>
          <Link to={`/federation/players/${p.id}`} className="av-link" onClick={onClose}>Открыть профиль →</Link>
        </div>
      </div>
    </div>
  );
}

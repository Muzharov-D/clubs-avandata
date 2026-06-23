import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError, FedEmpty } from './FedState';
import { ratingLabel, rating10Color } from './ratings';
import { useFedYear, fedQ } from './avYear';
import { num, plMatch } from './utils';
import './federation.css';

interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo?: string | null; rating: number | null; mp?: number }

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
      <header className="fed-hero">
        <h1 className="fed-hero__title">Игроки региона</h1>
        <p className="fed-hero__sub">Рейтинг игроков по разбору AvanData · клик → профиль</p>
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
        <section className="fed-card fed-leaderboard-panel">
          <h2 className="fed-card__title" style={{ flex: 'none' }}>Рейтинг игроков</h2>
          <p className="fed-card__sub" style={{ flex: 'none' }}>
            {num(players.length)} разобранных{year != null ? ` · ${year} г.р.` : ' · все возрасты'} · рейтинг AvanData
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 0 16px', flex: 'none' }}>
            <input
              className="fed-input"
              placeholder="Поиск по имени…"
              value={qStr}
              onChange={(e) => setQStr(e.target.value)}
              style={{ flex: '1 1 220px', maxWidth: 320 }}
            />
            {clubs.length > 1 && (
              <select
                className="fed-select"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                aria-label="Фильтр по клубу"
              >
                <option value="all">Все клубы ({clubs.length})</option>
                {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px', flex: 1, minHeight: 0 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="fed-skeleton" style={{ height: 42 }} />)}
            </div>
          ) : shown.length === 0 ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FedEmpty>По заданному фильтру игроки не найдены.</FedEmpty>
            </div>
          ) : (
            <div className="fed-leaderboard-list">
              {shown.map((p, i) => (
                <Link key={p.id} to={`/federation/players/${p.id}`} className="fed-row" style={{ textDecoration: 'none' }}>
                  <span className="fed-table__num" style={{ width: 28, textAlign: 'right' }}>{i + 1}</span>
                  <PlayerAvatar name={p.name} photoUrl={p.photo} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fed-row__name" title={p.name}>{p.name}</div>
                    <div className="fed-row__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 24, fontWeight: 200, letterSpacing: '-0.02em', color: rating10Color(p.rating) }} title="рейтинг AvanData">{ratingLabel(p.rating)}</span>
                </Link>
              ))}
            </div>
          )}

          {!isLoading && !qStr.trim() && ratedTotal > shown.length && (
            <p className="fed-note" style={{ padding: '12px 16px 0', flex: 'none' }}>Отображены топ-{shown.length} из {num(ratedTotal)} игроков с рейтингом (не менее 2 матчей) — уточните выбор по клубу или поиску.</p>
          )}
        </section>
      )}

      {withRising && rising.length > 0 && (
        <>
          <div className="fed-divider">
            <h2 className="fed-divider__title">Восходящие игроки</h2>
            <div className="fed-divider__line" />
          </div>
          <p className="fed-note">Сильнейшие в младших когортах{risingYears.length ? ` · ${risingYears.join(' · ')} г.р.` : ''} — кого регион обязан не потерять</p>
          <div className="fed-grid fed-grid--4">
            {rising.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="fed-card" style={{ textDecoration: 'none' }}>
                <div className="fed-row" style={{ borderBottom: 'none', padding: 0 }}>
                  <span className="fed-table__num" style={{ width: 24, textAlign: 'right' }}>{i + 1}</span>
                  <PlayerAvatar name={p.name} photoUrl={p.photo} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fed-row__name" title={p.name}>{p.name}</div>
                    <div className="fed-row__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}</div>
                  </div>
                </div>
                <div className="fed-row" style={{ borderBottom: 'none', padding: '8px 0 0', marginTop: 8 }}>
                  <span className="fed-badge">{p.birthYear} г.р.</span>
                  <span style={{ fontSize: 28, fontWeight: 200, letterSpacing: '-0.02em', marginLeft: 'auto', color: rating10Color(p.rating) }}>{ratingLabel(p.rating)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {peek && <XiPeek p={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

/** Карточка игрока — открывается по клику, без ухода со страницы. */
function XiPeek({ p, onClose }: { p: RPlayer; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose} role="presentation">
      <div className="fed-card" style={{ width: '90%', maxWidth: 480, position: 'relative' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <button type="button" onClick={onClose} aria-label="Закрыть" style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        <div className="fed-row" style={{ borderBottom: 'none', padding: 0 }}>
          <PlayerAvatar name={p.name} photoUrl={p.photo} size={66} ring />
          <div style={{ minWidth: 0 }}>
            <div className="fed-row__name" style={{ fontSize: 16 }}>{p.name}</div>
            <div className="fed-row__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear} г.р.` : ''}</div>
          </div>
          <span style={{ fontSize: 32, fontWeight: 200, letterSpacing: '-0.02em', color: rating10Color(p.rating) }}>{ratingLabel(p.rating)}</span>
        </div>
        <div className="fed-row" style={{ borderBottom: 'none', padding: '12px 0 0', marginTop: 12, justifyContent: 'space-between' }}>
          <span className="fed-row__meta">{p.mp ? `рейтинг AvanData · среднее за ${p.mp} ${plMatch(p.mp)}` : 'рейтинг AvanData · среднее по матчам'}</span>
          <Link to={`/federation/players/${p.id}`} className="fed-link" onClick={onClose}>Открыть профиль →</Link>
        </div>
      </div>
    </div>
  );
}

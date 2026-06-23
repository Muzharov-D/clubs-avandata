import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { useFedYear, fedQ } from './avYear';
import { ratingLabel, rating10Color } from './ratings';
import { lineOf, LINE_LABEL, type Line } from './utils';
import './federation.css';

// Реестр игроков (та же форма, что в AvPlayers/LeaguesView).
interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo?: string | null; rating: number | null; mp?: number }

const MIN_MP = 2;            // гейт оценённости (как в сборной/звёздочках)
const MIN_HIGH_GROUP = 3;    // минимум игроков Высшей на линии+возрасте, иначе сравнивать не с чем
const SHOW = 14;

interface Signal { p: RPlayer; line: Line; beaten: number; total: number; weakest: number; margin: number }

/**
 * «Достойны лиги выше» — индивидуальный сигнал перехода (запрос владельца: «в каком клубе
 * из лиги выше на его позиции играет человек слабее»). Зеркалит КЛУБНЫЙ критерий ↑
 * (LeaguesView): игрок Первой достоин выше, если по абсолютному рейтингу AvanData обходит
 * хотя бы слабейшего игрока Высшей на СВОЕЙ линии и в СВОЁМ возрасте. Cross-league: тянем
 * обе лиги явно (фильтр лиги тут не режет — сравнение межлиговое); год-фильтр уважаем.
 * Read-only, поверх /av/players (тот же кэш). Решение остаётся за федерацией.
 */
export function RankAboveBody() {
  const { year } = useFedYear();
  const hi = useQuery({ queryKey: ['av', 'players', year, 'Высшая'], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, 'Высшая')}`) });
  const lo = useQuery({ queryKey: ['av', 'players', year, 'Первая'], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, 'Первая')}`) });

  const list = useMemo<Signal[]>(() => {
    const high = hi.data?.players ?? [];
    const low = lo.data?.players ?? [];
    // Высшая: рейтинги по ключу линия|возраст (гейт mp>=2, есть рейтинг и линия).
    const byKey = new Map<string, number[]>();
    for (const p of high) {
      const ln = lineOf(p.position);
      if (ln == null || p.birthYear == null || p.rating == null || (p.mp ?? 0) < MIN_MP) continue;
      const k = `${ln}|${p.birthYear}`;
      const arr = byKey.get(k);
      if (arr) arr.push(p.rating); else byKey.set(k, [p.rating]);
    }
    const out: Signal[] = [];
    for (const p of low) {
      const ln = lineOf(p.position);
      if (ln == null || p.birthYear == null || p.rating == null || (p.mp ?? 0) < MIN_MP) continue;
      const group = byKey.get(`${ln}|${p.birthYear}`);
      if (!group || group.length < MIN_HIGH_GROUP) continue;
      const beaten = group.filter((r) => r < p.rating!).length;
      if (beaten < 1) continue;                       // никого в Высшей не обходит — не сигнал
      const weakest = Math.min(...group);
      out.push({ p, line: ln, beaten, total: group.length, weakest, margin: p.rating - weakest });
    }
    // Сортировка по ДОЛЕ обойдённых игроков Высшей (процентаж — как показываем); тай-брейки:
    // абсолютное число обойдённых (крупный пул сильнее), затем рейтинг игрока.
    return out.sort((a, b) =>
      (b.beaten / b.total) - (a.beaten / a.total) || b.beaten - a.beaten || (b.p.rating ?? 0) - (a.p.rating ?? 0));
  }, [hi.data, lo.data]);

  if (hi.isLoading || lo.isLoading) return <div className="fed-skeleton" style={{ height: 200 }} />;
  if (list.length === 0) {
    return <div className="fed-note">Нет игроков Первой, обходящих по рейтингу кого-либо в Высшей на своей позиции и в своём возрасте.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.slice(0, SHOW).map((r) => (
        <Link key={r.p.id} to={`/federation/players/${r.p.id}`} className="fed-row" style={{ alignItems: 'center', textDecoration: 'none' }}>
          <PlayerAvatar name={r.p.name} photoUrl={r.p.photo} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="fed-row__name" style={{ flex: 'initial' }} title={r.p.name}>{r.p.name}</span>
              <span className="fed-badge">Первая</span>
              {r.p.club && <span className="fed-row__meta" title="Клуб">{r.p.club}</span>}
              {r.p.birthYear != null && <span className="fed-row__meta">{r.p.birthYear} г.р.</span>}
            </div>
            <p className="fed-note" style={{ margin: '4px 0 0' }}>
              обходит <b style={{ color: 'var(--accent)' }}>{Math.round((r.beaten / r.total) * 100)}%</b> {LINE_LABEL[r.line]} Высшей своего возраста
            </p>
          </div>
          <span className="fed-table__num" style={{ color: rating10Color(r.p.rating), fontWeight: 600, whiteSpace: 'nowrap' }} title="Абсолютный рейтинг игрока AvanData">
            {ratingLabel(r.p.rating)}
          </span>
          <span style={{ color: 'var(--success)', fontWeight: 600 }} aria-hidden>▲</span>
        </Link>
      ))}
    </div>
  );
}

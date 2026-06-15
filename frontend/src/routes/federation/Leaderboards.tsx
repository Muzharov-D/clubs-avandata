import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ratingColor } from './fedColors';
import './federation.css';

interface PlayerRow {
  playerId: string;
  name: string | null;
  club: string;
  ageGroup: string;
  position: string | null;
  rating: number | null;
  goals: number;
  assists: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  interceptions: number;
  distanceM: number;
}

type NumKey = 'goals' | 'assists' | 'rating' | 'keyPasses' | 'dribbles' | 'tackles' | 'interceptions' | 'distanceM';
interface Board { k: NumKey; title: string; fmt: (v: number) => string; rated?: boolean }

const BOARDS: Board[] = [
  { k: 'goals', title: 'Бомбардиры', fmt: (v) => String(v) },
  { k: 'assists', title: 'Ассистенты', fmt: (v) => String(v) },
  { k: 'rating', title: 'Индекс эффективности', fmt: (v) => v.toFixed(1), rated: true },
  { k: 'keyPasses', title: 'Ключевые передачи', fmt: (v) => String(v) },
  { k: 'dribbles', title: 'Дриблинг', fmt: (v) => String(v) },
  { k: 'tackles', title: 'Отборы', fmt: (v) => String(v) },
  { k: 'interceptions', title: 'Перехваты', fmt: (v) => String(v) },
  { k: 'distanceM', title: 'Дистанция', fmt: (v) => `${Math.round(v / 1000)} км` },
];

/** Лидерборды региона — топ игроков по ключевым метрикам. Клик по строке → профиль. */
export function FederationLeaderboards() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'talent', 0],
    queryFn: () => api<{ players: PlayerRow[] }>('/federation/talent?minMinutes=0'),
  });
  const players = data?.players ?? [];

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Лидерборды региона</h1>
          <p className="fed-sub">Лучшие игроки по ключевым показателям · клик — профиль</p>
        </div>
      </header>

      {isLoading && (
        <div className="fed-cols">{[0, 1, 2, 3].map((i) => <div key={i} className="fed-skeleton" style={{ height: 230 }} />)}</div>
      )}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && players.length === 0 && (
        <div className="fed-empty"><div className="fed-empty__icon">🏅</div>Нет игроков с данными.</div>
      )}

      {players.length > 0 && (
        <div className="fed-cols">
          {BOARDS.map((b) => <LeaderCard key={b.k} board={b} players={players} />)}
        </div>
      )}
    </div>
  );
}

function LeaderCard({ board, players }: { board: Board; players: PlayerRow[] }) {
  const val = (p: PlayerRow): number => {
    const v = p[board.k];
    return typeof v === 'number' ? v : -1;
  };
  const top = [...players].filter((p) => val(p) > 0).sort((a, b) => val(b) - val(a)).slice(0, 8);
  if (top.length === 0) return null;
  const max = val(top[0]);

  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">{board.title}</div>
        <div>
          {top.map((p, i) => {
            const v = val(p);
            const accent = board.rated ? ratingColor(v) : 'var(--accent-cyan)';
            return (
              <Link
                key={p.playerId}
                to={`/federation/players/${encodeURIComponent(p.playerId)}`}
                className="fed-row fed-row--link"
                style={{ textDecoration: 'none', color: 'inherit', gap: 10 }}
              >
                <span className="fed-faint fed-num" style={{ width: 18, fontSize: 12 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fed-row__name" style={{ fontSize: 13.5 }}>
                    {p.name ?? <span className="fed-faint" style={{ fontStyle: 'italic' }}>без согласия</span>}
                  </div>
                  <div className="fed-row__meta">{p.club} · {p.ageGroup}{p.position ? ` · ${p.position}` : ''}</div>
                </div>
                <span style={{ width: 70, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span className="fed-num" style={{ fontWeight: 700, color: accent, fontSize: 14 }}>{board.fmt(v)}</span>
                </span>
                <span className="fed-meter" style={{ width: 40, flex: 'none' }}>
                  <span className="fed-meter__fill" style={{ width: `${max > 0 ? (v / max) * 100 : 0}%`, background: accent }} />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

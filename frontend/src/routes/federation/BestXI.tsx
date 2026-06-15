import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ratingColor, tint } from './fedColors';
import './federation.css';

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
interface XIPlayer {
  playerId: string; name: string | null; club: string; ageGroup: string;
  position: string | null; line: Line; rating: number; pct: number; minutes: number; matches: number;
}

const MIN_OPTIONS = [0, 90, 270];
const LINE_ORDER: Line[] = ['FWD', 'MID', 'DEF', 'GK'];
const LINE_LABEL: Record<Line, string> = { GK: 'Вратарь', DEF: 'Защита', MID: 'Полузащита', FWD: 'Атака' };

/**
 * «Сборная региона по данным» — витрина монополии: объективно сильнейший XI
 * (1-4-3-3) по среднему индексу внутри линии. Это может посчитать только тот, у
 * кого данные всех клубов — у клуба нет знаменателя. Клик по игроку → профиль.
 */
export function FederationBestXI() {
  const [minMinutes, setMinMinutes] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'best-xi', minMinutes],
    queryFn: () => api<{ players: XIPlayer[] }>(`/federation/best-xi?minMinutes=${minMinutes}`),
  });
  const players = data?.players ?? [];
  const byLine = (l: Line) => players.filter((p) => p.line === l).sort((a, b) => b.rating - a.rating);
  const total = players.length;

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Сборная региона по данным</h1>
          <p className="fed-sub">Объективно сильнейший состав по индексу эффективности — то, что может посчитать только держатель данных всех клубов</p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 16 }}>
        <span className="fed-faint" style={{ fontSize: 12 }}>Мин. минут:</span>
        <div className="fed-tabs">
          {MIN_OPTIONS.map((m) => (
            <button key={m} onClick={() => setMinMinutes(m)} className={`fed-tab${minMinutes === m ? ' fed-tab--active' : ''}`}>
              {m === 0 ? 'все' : m}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="fed-skeleton" style={{ height: 460 }} />}
      {error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && total === 0 && (
        <div className="fed-empty"><div className="fed-empty__icon">⚽</div>Недостаточно игроков с рейтингом для состава.</div>
      )}

      {total > 0 && (
        <div className="fed-pitch fed-rise">
          {LINE_ORDER.map((line) => {
            const slots = byLine(line);
            if (slots.length === 0) return null;
            return (
              <div key={line} className="fed-pitch__line">
                {slots.map((p) => <XICard key={p.playerId} p={p} />)}
              </div>
            );
          })}
        </div>
      )}

      {total > 0 && (
        <p className="fed-faint" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 12 }}>
          {total} из 11 позиций заполнены ({['FWD', 'MID', 'DEF', 'GK'].map((l) => `${LINE_LABEL[l as Line]}: ${byLine(l as Line).length}`).join(' · ')}).
          Перцентиль — место игрока внутри своей линии по региону; на малой выборке он грубый и обостряется с ростом числа клубов.
        </p>
      )}
    </div>
  );
}

function XICard({ p }: { p: XIPlayer }) {
  const c = ratingColor(p.rating);
  return (
    <Link to={`/federation/players/${encodeURIComponent(p.playerId)}`} className="fed-xi">
      <div className="fed-xi__top">
        <span className="fed-rate" style={{ minWidth: 40, fontSize: 13, color: c, background: tint(c), borderColor: tint(c, 38) }}>{p.rating.toFixed(1)}</span>
        <span className="fed-xi__name">{p.name ?? <span className="fed-faint" style={{ fontStyle: 'italic' }}>без согласия</span>}</span>
      </div>
      <div className="fed-xi__meta">{p.position || LINE_LABEL[p.line]} · {p.club} · {p.ageGroup}</div>
      <div className="fed-xi__meta">перцентиль линии {p.pct} · {p.matches} м · {p.minutes}′</div>
    </Link>
  );
}

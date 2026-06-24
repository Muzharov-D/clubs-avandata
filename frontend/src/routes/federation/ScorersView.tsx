import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { FedError, FedEmpty } from './FedState';
import { useFedYear } from './avYear';
import { num } from './utils';
import './federation.css';

/**
 * Бомбардиры региона — ВТОРОЙ снимок поверх протоколов FFSPB (как Пирамида/Карта
 * возможностей: никакого живого обхода на запрос). Топ голеадоров Первенства
 * (когорты 2009–2016) из событий протоколов: гол + пенальти, автоголы исключены.
 * Читает последний месячный снимок region_scorers (sync:region-scorers).
 */

interface ScorerRow {
  name: string;
  club: string;
  logo: string | null;
  cohort: number;
  goals: number;
}
interface ScorersPayload {
  season: string;
  matchesScanned: number;
  topGoals: ScorerRow[];
  topAssists: never[];
  capturedAt?: string | null;
}

const TOP_N = 12;


export function FederationScorers() {
  const matchesScanned = useScorers().data?.matchesScanned ?? 0;
  return (
    <div>
      <header className="fed-hero">
        <h1 className="fed-hero__title">Бомбардиры региона</h1>
        <p className="fed-hero__sub">Голы из протоколов · Первенство 2009–2016 · {num(matchesScanned)} матчей</p>
      </header>
      <ScorersBody />
    </div>
  );
}

const useScorers = () => useQuery({
  queryKey: ['federation', 'region-scorers'],
  queryFn: () => api<ScorersPayload | null>('/federation/region-scorers'),
});

/**
 * Тело «Бомбардиров» — топ голеадоров. Когорта: клиентский фильтр по строкам
 * (`topGoals[].cohort`) из глобального useFedYear — снимок пулится по всем
 * возрастам, но каждая строка знает свой год, поэтому «2009 рядом с 2016»
 * чинится отбором по выбранной когорте. «Все» = весь регион. Без шапки экрана.
 */
export function ScorersBody() {
  const { year } = useFedYear();
  const { data: p, isLoading, error } = useScorers();

  if (isLoading) return <div className="fed-skeleton" style={{ height: 420 }} />;
  if (error) return <FedError subject="Бомбардиры региона" />;

  const all = p?.topGoals ?? [];
  const rows = year != null ? all.filter((r) => r.cohort === year) : all;
  if (!p || rows.length === 0) {
    return (
      <FedEmpty>
        {year != null
          ? `По возрасту ${year} г.р. голов пока нет — выберите другой год или «Все».`
          : 'Данные по бомбардирам региона ещё не готовы — появятся после ближайшего обновления протоколов ФФСПб.'}
      </FedEmpty>
    );
  }

  const top = rows.slice(0, TOP_N);
  const max = top[0]?.goals || 1;
  const captured = p.capturedAt ? new Date(p.capturedAt).toLocaleDateString('ru-RU') : null;

  return (
    <div className="fed-card">
      <h2 className="fed-card__title">Топ голеадоров · голы <span className="fed-table__muted">{year != null ? `${year} г.р.` : 'все возрасты'}</span></h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {top.map((r, i) => (
          <ScorerLine key={`${r.name}-${r.club}-${i}`} rank={i + 1} r={r} max={max} />
        ))}
      </div>
      <p className="fed-note" style={{ marginTop: 16 }}>
        Голы — из протоколов ФФСПб (гол/пенальти, автоголы исключены).
        {captured ? ` По состоянию на ${captured}.` : ''}
      </p>
    </div>
  );
}

function ScorerLine({ rank, r, max }: { rank: number; r: ScorerRow; max: number }) {
  // Топ-1 — золото (--warning), топ-2 — акцент, остальные — нейтраль.
  const accent = rank === 1 ? 'var(--warning)' : rank === 2 ? 'var(--accent)' : 'var(--text)';
  const barColor = rank === 1 ? 'var(--warning)' : rank === 2 ? 'var(--accent)' : 'var(--accent)';
  const pct = max > 0 ? (r.goals / max) * 100 : 0;

  return (
    <div className="fed-row">
      <span className="fed-table__muted" style={{ width: 24, textAlign: 'right' }}>{rank}</span>

      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          flex: 'none',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
        }}
      >
        {r.logo ? (
          <img src={r.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
        )}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="fed-row__name" style={{ color: accent }}>{r.name}</div>
        <div className="fed-row__meta">{r.club} · {r.cohort} г.р.</div>
      </div>

      <div className="fed-track" style={{ width: 88, flex: 'none' }}>
        <div className="fed-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="fed-table__num" style={{ fontWeight: 700, color: accent, width: 32, textAlign: 'right' }}>{r.goals}</span>
    </div>
  );
}

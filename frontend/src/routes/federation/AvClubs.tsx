import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { ClubCard } from './ClubCard';
import { FedError } from './FedState';
import { useFedYear, yearQ, fedQ, inDivision } from './avYear';
import { num } from './utils';
import './federation.css';

interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface DivStrength { division: string; clubs: number; avgRating: number | null; topRating: number | null; topClub: string | null }
interface Concentration { topPool: number; totalClubs: number; top3Share: number; top5Share: number; clubs: Array<{ club: string; logo: string | null; n: number; share: number }> }

const plClub = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'клубов'; if (b === 1) return 'клуб'; if (b >= 2 && b <= 4) return 'клуба'; return 'клубов'; };

// Зеркало backend `federation/teamName.ts` (normTeam) — ключ клуба для склейки ВАРИАНТОВ имени.
// СШ/СШОР НЕ схлопываем (это РАЗНЫЕ школы); срезаем «ФК», хвостовой год, скобку-программу,
// дефисы, город-квалификатор. Итог: «ФК Зенит» ≠ «СШОР Зенит», но «Автово 2011/2012» → один.
const normTeam = (s: string): string => s.toLowerCase()
  .replace(/[«»"']/g, '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/^фк\s+/, '')
  .replace(/\s*\d{4}\s*$/, '')
  .replace(/[-–—]/g, ' ')
  .replace(/(^|\s)(спб|санкт петербург)(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** Клубы региона — рейтинг школ по данным + сила лиг + кто производит талант. */
export function FederationAvClubs() {
  const { division } = useFedYear();
  return (
    <>
      <header className="fed-hero">
        <h1 className="fed-hero__title">Клубы региона</h1>
        <p className="fed-hero__sub">Рейтинг клубов по очкам · {division} лига</p>
      </header>
      <ClubsBody />
    </>
  );
}

/**
 * Тело «Клубов региона» — сила лиг + кто производит талант + рейтинг клубов.
 * Когорта/лига: server-side через yearQ/fedQ из глобального useFedYear (год +
 * дивизион фильтруют данные на бэке). Самонесущее, без шапки экрана.
 */
export function ClubsBody() {
  const { year, division } = useFedYear();
  const q = yearQ(year);
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });
  const ds = useQuery({ queryKey: ['av', 'divstr', year], queryFn: () => api<{ divisions: DivStrength[] }>(`/federation/av/division-strength${q}`) });
  const tc = useQuery({ queryKey: ['av', 'conc', year, division], queryFn: () => api<Concentration>(`/federation/av/concentration${fedQ(year, division)}`) });

  const [selectedClub, setSelectedClub] = useState<number | null>(null);
  const groups = cr.data?.groups ?? [];
  // Рейтинг клубов = ОБЕ лиги в одной таблице (рейтинг абсолютный — сравним между лигами) +
  // склейка ВАРИАНТОВ ИМЕНИ одного клуба по normTeam (год/«ФК»/программа/город — шум; СШ/СШОР
  // НЕ схлопываем — разные школы). Рейтинги вариантов суммируем (сумма рейтингов игроков),
  // представитель строки — сильнейший вариант. «ФК Зенит» и «СШОР Зенит» остаются ДВУМЯ.
  const shown = useMemo(() => {
    const flat = groups.flatMap((g) => g.rows.map((r) => ({ ...r, division: g.division })))
      .sort((a, b) => b.rating - a.rating);
    const m = new Map<string, RatingRow & { division: string }>();
    for (const r of flat) {
      const k = normTeam(r.name);
      const cur = m.get(k);
      if (cur) cur.rating += r.rating; else m.set(k, { ...r });
    }
    return Array.from(m.values()).sort((a, b) => b.rating - a.rating);
  }, [groups]);
  const max = Math.max(...shown.map((r) => Math.abs(r.rating)), 1);

  return (
    <>
      {/* Сила лиг — прямое сравнение дивизионов (обе лиги рядом); выбранная подсвечена.
          Большое число = средний рейтинг лиги по методике AvanData (абсолют, не нормируем). */}
      {ds.isLoading ? <div className="fed-skeleton" style={{ height: 116 }} /> : (
        <div className="fed-grid fed-grid--2">
          {(ds.data?.divisions ?? []).map((l) => {
            const sel = inDivision(l.division, division);
            return (
              <div key={l.division} className="fed-metric">
                <div className="fed-metric__label">{l.division}</div>
                <div className={`fed-metric__value${sel ? ' fed-metric__value--accent' : ''}`}>
                  {l.avgRating != null ? num(l.avgRating) : '—'}
                </div>
                <div className="fed-metric__extra">
                  {plClub(l.clubs)} в лиге · средний рейтинг AvanData{l.topClub ? ` (лидер ${l.topClub})` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Кто производит талант — концентрация сильнейших игроков лиги по школам */}
      <section className="fed-card">
        <h2 className="fed-card__title">Кто производит талант</h2>
        <p className="fed-card__sub">Доля сильнейших игроков {division} лиги по школам</p>
        {tc.isLoading ? <div className="fed-skeleton" style={{ height: 240 }} /> : tc.data && tc.data.clubs.length > 0 ? (() => {
          const d = tc.data;
          const maxN = Math.max(...d.clubs.map((c) => c.n), 1);
          return (
            <>
              <p className="fed-note">Три клуба сосредоточили <b style={{ color: 'var(--warning)' }}>{d.top3Share}%</b> сильнейших игроков лиги</p>
              <p className="fed-note" style={{ marginTop: 8 }}>Пул — топ-30 игроков каждого возраста ({d.topPool} игроков из {d.totalClubs} школ); команды объединены в школы (без привязки к году команды). На топ-5 школ приходится <b>{d.top5Share}%</b>.</p>
              {d.clubs.slice(0, 10).map((c) => (
                <div key={c.club} className="fed-row">
                  <ClubShield name={c.club} logoUrl={c.logo} size={24} />
                  <span className="fed-row__name" title={c.club}>{c.club}</span>
                  <div className="fed-track" style={{ flex: 1 }}>
                    <div className="fed-fill fed-fill--warning" style={{ width: `${(c.n / maxN) * 100}%` }} />
                  </div>
                  <span className="fed-table__num" style={{ color: 'var(--warning)', width: 48, textAlign: 'right' }}>{c.share}%</span>
                </div>
              ))}
              {d.totalClubs > d.clubs.slice(0, 10).length && <p className="fed-note">Отображены 10 школ из {d.totalClubs}.</p>}
            </>
          );
        })() : <div className="fed-note">Мало данных по игрокам для этого анализа.</div>}
      </section>

      {cr.error && <FedError />}
      {cr.isLoading ? <div className="fed-skeleton" style={{ height: 320 }} /> : (
        <section className="fed-card">
          <h2 className="fed-card__title">Рейтинг клубов</h2>
          <p className="fed-card__sub">Абсолютный рейтинг клуба по методике AvanData (сумма рейтингов игроков)</p>
          {shown.map((r, i) => (
            <button type="button" key={`${r.id}-${r.division}`} onClick={() => setSelectedClub(r.id)} className="fed-row" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span className="fed-table__num" style={{ width: 28, textAlign: 'right', color: i < 3 ? 'var(--accent)' : 'var(--text-secondary)' }}>{i + 1}</span>
              <ClubShield name={r.name} logoUrl={r.logo} size={26} />
              <span className="fed-row__name" title={r.name}>{r.name}</span>
              <span className="fed-badge fed-badge--accent">{r.division}</span>
              <div className="fed-track" style={{ flex: 1 }}>
                <div className="fed-fill" style={{ width: `${(Math.abs(r.rating) / max) * 100}%`, background: r.rating < 0 ? 'var(--danger)' : 'var(--accent)' }} />
              </div>
              <span className="fed-table__num" style={{ width: 64, textAlign: 'right' }} title="рейтинг клуба AvanData">{num(r.rating)}</span>
            </button>
          ))}
          <p className="fed-note">Рейтинг клуба — сумма рейтингов игроков по методике AvanData.</p>
        </section>
      )}

      {selectedClub != null && <ClubCard clubId={selectedClub} onClose={() => setSelectedClub(null)} />}
    </>
  );
}

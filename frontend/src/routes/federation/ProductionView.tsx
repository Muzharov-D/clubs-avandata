import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { FedError, FedEmpty } from './FedState';
import { useFedYear, yearQ } from './avYear';
import './federation.css';

/**
 * «Производство талантов» — квадрант-скаттер клубов: X = сколько топ-игроков клуб
 * дал (топ-22 по рейтингу когорты, разбор AvanData), Y = его результат (очки за игру).
 * Отвечает на «Победа ≠ производство таланта»: клуб может побеждать без топ-индивидов
 * (Зенит ~0 / PPG ~2.1) или растить таланты и проигрывать (ФК Динамо ~7 / ~0.6).
 * Источник — /federation/av/talent-production (живой расчёт по back.avandata.ru + ФФСПб).
 */

interface ProdClub { name: string; logo: string | null; talents: number; ppg: number; cohorts: number; }
interface Payload { clubs: ProdClub[]; medianTalents: number; medianPpg: number; }

const plClub = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'клубов'; if (b === 1) return 'клуб'; if (b >= 2 && b <= 4) return 'клуба'; return 'клубов'; };

export function FederationProduction() {
  return (
    <>
      <header className="fed-hero">
        <h1 className="fed-hero__title">Производство талантов</h1>
        <p className="fed-hero__sub">Топ-игроки клуба × результат · по данным AvanData</p>
      </header>
      <ProductionBody />
    </>
  );
}

/**
 * Тело «Производства талантов» — таблица клубов (топ-игроки × PPG).
 * Когорта: server-side через ?year из глобального useFedYear — «Все» = совокупность
 * всех когорт (поведение по умолчанию), выбранный год = одна возрастная группа.
 * Самонесущее, без шапки экрана.
 */
export function ProductionBody() {
  const { year } = useFedYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'talent-production', year],
    queryFn: () => api<Payload>(`/federation/av/talent-production${yearQ(year)}`),
  });

  const clubs = data?.clubs ?? [];
  const maxTalents = useMemo(() => Math.max(4, ...clubs.map((c) => c.talents)), [clubs]);
  const [peek, setPeek] = useState<ProdClub | null>(null);

  const zoneLabel = (c: ProdClub) => {
    const aboveTalents = c.talents >= (data?.medianTalents ?? 0);
    const abovePpg = c.ppg >= (data?.medianPpg ?? 0);
    if (aboveTalents && abovePpg) return { label: 'Производство и результат', cls: 'fed-badge--success' };
    if (!aboveTalents && abovePpg) return { label: 'Результат без производства', cls: 'fed-badge--accent' };
    if (aboveTalents && !abovePpg) return { label: 'Производство без результата', cls: 'fed-badge--warning' };
    return { label: 'Без производства и без результата', cls: '' };
  };

  return (
    <>
      {error && <FedError />}

      <section className="fed-card">
        {isLoading ? (
          <div className="fed-skeleton" style={{ height: 240 }} />
        ) : clubs.length === 0 ? (
          <FedEmpty>Недостаточно данных по возрастам для карты производства талантов.</FedEmpty>
        ) : (
          <>
            <h2 className="fed-card__title">Производство × результат</h2>
            <p className="fed-card__sub">
              {year == null ? 'по региону · все возрасты (совокупность)' : `возраст ${year} г.р.`} · {clubs.length} {plClub(clubs.length)} · медианы: талантов {data!.medianTalents}, очки/игра {data!.medianPpg}
            </p>

            <table className="fed-table">
              <thead>
                <tr>
                  <th>Клуб</th>
                  <th>Топ-игроков</th>
                  <th>Очки/игра</th>
                  <th>Зона</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((c) => {
                  const z = zoneLabel(c);
                  const pct = maxTalents > 0 ? (c.talents / maxTalents) * 100 : 0;
                  return (
                    <tr key={c.name} onClick={() => setPeek(c)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="fed-row" style={{ padding: 0, borderBottom: 'none', gap: 8 }}>
                          <ClubShield name={c.name} logoUrl={c.logo} size={30} />
                          <span className="fed-row__name">{c.name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="fed-row" style={{ padding: 0, borderBottom: 'none', gap: 8 }}>
                          <div className="fed-track" style={{ width: 80 }}>
                            <div className="fed-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="fed-table__num">{c.talents}</span>
                        </div>
                      </td>
                      <td className="fed-table__num">{c.ppg}</td>
                      <td>
                        {z.cls ? <span className={`fed-badge ${z.cls}`}>{z.label}</span> : <span className="fed-table__muted">{z.label}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="fed-note" style={{ marginTop: 16 }}>
              Топ — топ-22 по рейтингу возраста. За один сезон производство таланта и результат частично связаны; диагностическую ценность представляют отклонения: высокое производство при низком результате либо результат без производства собственных талантов.
            </p>
          </>
        )}
      </section>

      {peek && <ProdPeek c={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

const plYear = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'возрастов'; if (b === 1) return 'возрасту'; if (b >= 2 && b <= 4) return 'возраста'; return 'возрастов'; };

/** Карточка клуба из карты — по клику на герб, без ухода со страницы. */
function ProdPeek({ c, onClose }: { c: ProdClub; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose} role="presentation">
      <div className="fed-card" style={{ width: '90%', maxWidth: 420, position: 'relative' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={c.name}>
        <button type="button" onClick={onClose} aria-label="Закрыть" style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        <div className="fed-row" style={{ borderBottom: 'none', padding: 0 }}>
          <ClubShield name={c.name} logoUrl={c.logo} size={56} />
          <div style={{ minWidth: 0 }}>
            <div className="fed-row__name" style={{ fontSize: 16 }}>{c.name}</div>
            <div className="fed-row__meta">{c.talents} топ-игроков · по {c.cohorts} {plYear(c.cohorts)}</div>
          </div>
          <span style={{ fontSize: 32, fontWeight: 200, letterSpacing: '-0.02em' }}>{c.ppg}</span>
        </div>
        <div className="fed-row" style={{ borderBottom: 'none', padding: '12px 0 0', marginTop: 12 }}>
          <span className="fed-row__meta">очки за игру · среднее по возрастам</span>
        </div>
      </div>
    </div>
  );
}

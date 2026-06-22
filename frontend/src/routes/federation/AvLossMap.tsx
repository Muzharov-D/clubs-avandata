import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError } from './FedState';
import { useFedYear } from './avYear';
import { fmtStamp } from './utils';
import './federation.css';

interface LossQuarter { q: number; roster: number; medianPct: number; buried15: number; contrib50: number }
interface LossCohort { year: number; label: string; roster: number; byQuarter: LossQuarter[] }
interface LossMap {
  generatedAt: string; season: number; note: string;
  pooled: { roster: number; byQuarter: LossQuarter[] };
  cohorts: LossCohort[];
  examplesBuriedQ4: Array<{ name: string; team: string; pct: number; year: number }>;
}

const QLABEL = ['янв–мар', 'апр–июн', 'июл–сен', 'окт–дек'];

/**
 * Карта потерь — ядро боли федерации на ИГРОВОМ ВРЕМЕНИ: кого регион теряет на двери
 * (отбор) и на скамейке (числятся, но не играют), в разрезе квартала рождения.
 * Данные — снимок официального FFSPB (минуты), обновляется `npm run sync:lossmap`.
 */
export function FederationAvLossMap() {
  return (
    <>
      <header className="fed-hero">
        <h1 className="fed-hero__title">Карта потерь</h1>
        <p className="fed-hero__sub">Кого регион теряет: на отборе и на скамейке · по доле игрового времени</p>
      </header>
      <LossMapBody />
    </>
  );
}

/**
 * Тело «Карты потерь» — двойной штраф + воронка по кварталам + примеры.
 * Когорта: снимок ИМЕЕТ срез по годам (d.cohorts), поэтому выбранный в глобальном
 * useFedYear год берётся клиентски (d.cohorts.find), «все» → pooled. Самонесущее.
 */
export function LossMapBody() {
  const { year } = useFedYear();
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'loss-map'], queryFn: () => api<LossMap>('/federation/av/loss-map') });
  if (error) return <FedError subject="Карта потерь" />;
  if (isLoading) return <div className="fed-skeleton" style={{ height: 360 }} />;
  if (!data) return null;
  return <Body d={data} year={year} />;
}

function Body({ d, year }: { d: LossMap; year: number | null }) {
  const cohort = year != null ? d.cohorts.find((c) => c.year === year) ?? null : null;
  const view = cohort ?? d.pooled;
  const bq = view.byQuarter;
  const q1 = bq[0]!, q4 = bq[3]!;
  const maxRoster = Math.max(...bq.map((q) => q.roster), 1);
  const skew = q4.roster > 0 ? Math.round((q1.roster / q4.roster) * 10) / 10 : null;
  const examples = (cohort ? d.examplesBuriedQ4.filter((e) => e.year === cohort.year) : d.examplesBuriedQ4).slice(0, 8);
  const scopeLabel = cohort ? `${cohort.year} г.р. · ${cohort.label}` : 'все возрасты';

  return (
    <>
      {/* Двойной штраф — герой */}
      <section className="fed-metric">
        <div className="fed-metric__label">Двойная потеря поздно рождённых · {scopeLabel}</div>
        <div className="fed-grid fed-grid--2">
          <div>
            <div className="fed-metric__value">{skew != null ? `×${skew}` : '—'}</div>
            <div className="fed-metric__extra">реже включаются в заявку на этапе отбора (Q1 {q1.roster} · Q4 {q4.roster})</div>
          </div>
          <div>
            <div className="fed-metric__value fed-metric__value--warning">{q4.buried15}%</div>
            <div className="fed-metric__extra">из включённых — «погребённые» на скамейке (Q1 {q1.buried15}%)</div>
          </div>
        </div>
        <p className="fed-note" style={{ marginTop: 16 }}>
          Регион теряет поздно рождённых дважды: их <b>в {skew ?? '—'} раза реже</b> включают в заявку, а включённые — <b>чаще остаются на скамейке</b> (менее 15% игрового времени). Низкая игровая практика при формальном участии распределена неравномерно — перекос направлен против рождённых в конце года.
        </p>
      </section>

      {/* Воронка по кварталам рождения */}
      <section className="fed-card">
        <h2 className="fed-card__title">По кварталу рождения</h2>
        <p className="fed-card__sub">Размер заявки · медиана игрового времени · доля «погребённых» (&lt;15% времени)</p>
        <table className="fed-table">
          <thead>
            <tr>
              <th>Квартал</th>
              <th>В заявке</th>
              <th>Медиана времени</th>
              <th>«Погребены» &lt;15%</th>
            </tr>
          </thead>
          <tbody>
            {bq.map((q) => (
              <tr key={q.q}>
                <td>Q{q.q} · {QLABEL[q.q - 1]}</td>
                <td>
                  <div className="fed-row" style={{ padding: 0, borderBottom: 'none', gap: 8 }}>
                    <div className="fed-track" style={{ width: 80 }}>
                      <div className="fed-fill" style={{ width: `${(q.roster / maxRoster) * 100}%`, background: q.q === 4 ? 'var(--danger)' : 'var(--accent)' }} />
                    </div>
                    <span className="fed-table__num">{q.roster}</span>
                  </div>
                </td>
                <td className="fed-table__num" style={{ color: q.medianPct < 35 ? 'var(--warning)' : undefined }}>{q.medianPct}%</td>
                <td>
                  <div className="fed-row" style={{ padding: 0, borderBottom: 'none', gap: 8 }}>
                    <div className="fed-track" style={{ width: 80 }}>
                      <div className="fed-fill fed-fill--danger" style={{ width: `${q.buried15}%` }} />
                    </div>
                    <span className="fed-table__num" style={{ color: 'var(--danger)' }}>{q.buried15}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fed-note" style={{ marginTop: 16 }}>«Погребённые» — игроки в заявке, проведшие на поле менее 15% игрового времени команды. Приоритетные зоны для мер федерации — <b>отбор</b> (основной перекос) и контроль доступа молодых игроков к игровой практике.</p>
      </section>

      {/* Кого именно теряем */}
      {examples.length > 0 && (
        <section className="fed-card">
          <h2 className="fed-card__title">Кого регион теряет</h2>
          <p className="fed-card__sub">поздно рождённые игроки в заявке с минимальным игровым временем</p>
          <div>
            {examples.map((e, i) => (
              <div key={i} className="fed-row">
                <PlayerAvatar name={e.name} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fed-row__name" title={e.name}>{e.name}</div>
                  <div className="fed-row__meta"><ClubShield name={e.team} size={16} /> {e.team} · {e.year} г.р.</div>
                </div>
                <span style={{ fontSize: 24, fontWeight: 200, letterSpacing: '-0.02em', color: 'var(--danger)' }}>{e.pct}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="fed-note">Снимок официального FFSPB от {fmtStamp(d.generatedAt)} · реестр {view.roster} игроков{cohort ? '' : ` (${d.cohorts.length} когорт)`}. {d.note}.</p>
    </>
  );
}

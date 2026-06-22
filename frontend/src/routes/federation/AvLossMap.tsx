import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError } from './FedState';
import { useFedYear } from './avYear';
import './avandata.css';

interface LossQuarter { q: number; roster: number; medianPct: number; buried15: number; buried30: number; contrib50: number }
interface LossCohort { year: number; label: string; roster: number; byQuarter: LossQuarter[] }
interface LossMap {
  generatedAt: string; season: number; note: string;
  pooled: { roster: number; byQuarter: LossQuarter[] };
  cohorts: LossCohort[];
  examplesBuriedQ4: Array<{ name: string; team: string; pct: number; year: number }>;
}

const QLABEL = ['янв–мар', 'апр–июн', 'июл–сен', 'окт–дек'];
const fmtStamp = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch { return ''; } };

/**
 * Карта потерь — ядро боли федерации на ИГРОВОМ ВРЕМЕНИ: кого регион теряет на двери
 * (отбор) и на скамейке (числятся, но не играют), в разрезе квартала рождения.
 * Данные — снимок официального FFSPB (минуты), обновляется `npm run sync:lossmap`.
 */
export function FederationAvLossMap() {
  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Карта потерь</h1>
          <p className="av-sub">Кого регион теряет: на отборе и на скамейке · по доле игрового времени</p>
        </div>
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
  if (isLoading) return <div className="av-skeleton av-rise" style={{ height: 360 }} />;
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
      <section className="av-surface av-finding av-finding--hero av-pad-lg av-rise">
        <span className="av-finding__kicker">Двойная потеря поздно рождённых · {scopeLabel}</span>
        <div className="av-loss-twin">
          <div className="av-loss-twin__cell">
            <span className="av-loss-twin__n">{skew != null ? `×${skew}` : '—'}</span>
            <span className="av-loss-twin__l">реже включаются в заявку<br /><b>на этапе отбора</b> (Q1 {q1.roster} · Q4 {q4.roster})</span>
          </div>
          <span className="av-loss-twin__plus">+</span>
          <div className="av-loss-twin__cell">
            <span className="av-loss-twin__n" style={{ color: 'var(--av-magenta)' }}>{q4.buried15}%</span>
            <span className="av-loss-twin__l">из включённых — <b>«погребённые»</b><br />на скамейке (Q1 {q1.buried15}%)</span>
          </div>
        </div>
        <p className="av-why" style={{ marginTop: 16 }}>
          Регион теряет поздно рождённых дважды: их <b style={{ color: 'var(--av-text)' }}>в {skew ?? '—'} раза реже</b> включают в заявку, а включённые — <b style={{ color: 'var(--av-text)' }}>чаще остаются на скамейке</b> (менее 15% игрового времени). Низкая игровая практика при формальном участии распределена неравномерно — перекос направлен против рождённых в конце года.
        </p>
      </section>

      {/* Воронка по кварталам рождения */}
      <section className="av-surface av-pad-lg av-rise">
        <div className="av-section">
          <div>
            <h2 className="av-section-title">По кварталу рождения</h2>
            <p className="av-section-sub" style={{ margin: '2px 0 0' }}>Размер заявки · медиана игрового времени · доля «погребённых» (&lt;15% времени)</p>
          </div>
        </div>
        <div className="av-loss-funnel">
          <div className="av-lossrow av-lossrow--head">
            <span>Квартал</span><span>В заявке</span><span>Медиана времени</span><span>«Погребены» &lt;15%</span>
          </div>
          {bq.map((q) => (
            <div key={q.q} className="av-lossrow">
              <span className="av-lossrow__q">Q{q.q} · {QLABEL[q.q - 1]}</span>
              <span className="av-lossrow__roster">
                <span className="av-lossrow__bar"><span style={{ width: `${(q.roster / maxRoster) * 100}%`, background: q.q === 4 ? 'var(--av-magenta)' : 'var(--av-cyan)' }} /></span>
                <b>{q.roster}</b>
              </span>
              <span className="av-lossrow__med" style={{ color: q.medianPct < 35 ? 'var(--av-warning)' : 'var(--av-text)' }}>{q.medianPct}%</span>
              <span className="av-lossrow__buried">
                <span className="av-lossrow__bar"><span style={{ width: `${q.buried15}%`, background: 'var(--av-magenta)' }} /></span>
                <b style={{ color: 'var(--av-magenta)' }}>{q.buried15}%</b>
              </span>
            </div>
          ))}
        </div>
        <p className="av-why" style={{ marginTop: 14 }}>«Погребённые» — игроки в заявке, проведшие на поле менее 15% игрового времени команды. Приоритетные зоны для мер федерации — <b style={{ color: 'var(--av-text)' }}>отбор</b> (основной перекос) и контроль доступа молодых игроков к игровой практике.</p>
      </section>

      {/* Кого именно теряем */}
      {examples.length > 0 && (
        <section className="av-surface av-pad-lg av-rise">
          <div className="av-section"><h2 className="av-section-title">Кого регион теряет</h2>
            <span className="av-section-sub" style={{ margin: 0 }}>поздно рождённые игроки в заявке с минимальным игровым временем</span></div>
          <div className="av-loss-ex">
            {examples.map((e, i) => (
              <div key={i} className="av-loss-excard">
                <PlayerAvatar name={e.name} size={38} />
                <div className="av-loss-excard__id">
                  <div className="av-loss-excard__name" title={e.name}>{e.name}</div>
                  <div className="av-loss-excard__team"><ClubShield name={e.team} size={16} /> {e.team} · {e.year} г.р.</div>
                </div>
                <span className="av-loss-excard__pct">{e.pct}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="av-dim" style={{ fontSize: 11, lineHeight: 1.5 }}>
        Снимок официального FFSPB от {fmtStamp(d.generatedAt)} · реестр {view.roster} игроков{cohort ? '' : ` (${d.cohorts.length} когорт)`}. {d.note}.
      </p>
    </>
  );
}

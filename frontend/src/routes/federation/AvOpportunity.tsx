import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { FedError } from './FedState';
import { useFedYear, fedQ } from './avYear';
import './avandata.css';

interface OppQuarter { q: number; players: number; startRate: number }
interface OpportunityMap {
  players: number; alwaysShare: number; benchShare: number; gini: number;
  buckets: Array<{ from: number; to: number; n: number }>;
  quarters: OppQuarter[]; quartersTop: OppQuarter[];
  q1q4Gap: number | null; q1q4GapTop: number | null; asOf: string;
}

const QLABEL = ['янв–мар', 'апр–июн', 'июл–сен', 'окт–дек'];
// Корзины старт-рейта: от «вечно на скамейке» к «несменяемой основе».
const BUCKET_LABEL = ['Скамейка', 'Ротация', 'Полуоснова', 'Основа'];
const BUCKET_COLOR = ['var(--av-danger)', 'var(--av-warning)', 'var(--av-cyan)', 'var(--av-success)'];

/**
 * Карта возможностей/потерь — ядро боли федерации: кто получает игру, а кого
 * «теряют» на скамейке. «Возможность» = доля матчей в старте (минут в базе нет).
 */
export function FederationAvOpportunity() {
  const { year, division } = useFedYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'opportunity', year, division],
    queryFn: () => api<OpportunityMap>(`/federation/av/opportunity${fedQ(year, division)}`),
  });
  const [strong, setStrong] = useState(false);

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Карта возможностей</h1>
          <p className="av-sub">Кто получает игру, а кого теряют на скамейке · по доле матчей в старте</p>
        </div>
        <Link to="/federation/fairness" className="av-link">Эффект возраста →</Link>
      </header>

      {error && <FedError subject="Карта возможностей" />}
      {isLoading && <div className="av-skeleton av-rise" style={{ height: 360 }} />}
      {data && (data.players < 5
        ? <div className="av-surface av-pad av-note av-rise">Мало расстановок для карты возможностей по выбранному фильтру.</div>
        : <Body d={data} strong={strong} setStrong={setStrong} />)}
    </>
  );
}

function Body({ d, strong, setStrong }: { d: OpportunityMap; strong: boolean; setStrong: (v: boolean) => void }) {
  const total = d.buckets.reduce((s, b) => s + b.n, 0) || 1;
  const qs = strong ? d.quartersTop : d.quarters;
  const gap = strong ? d.q1q4GapTop : d.q1q4Gap;
  const maxRate = Math.max(...qs.map((q) => q.startRate), 50);

  return (
    <>
      {/* Ф1 — Ширина возможностей (герой): сколько в основе, сколько похоронено на скамейке */}
      <section className="av-surface av-finding av-finding--hero av-pad-lg av-rise">
        <span className="av-finding__kicker">Ширина возможностей</span>
        <div className="av-finding__top">
          <div className="av-hero-fig">
            <span className="av-hero-fig__n">{d.benchShare}%</span>
            <span className="av-hero-fig__l">вечно на скамейке</span>
          </div>
          <div>
            <h2 className="av-verdict" style={{ marginTop: 0 }}>{d.alwaysShare}% игроков живут в старте — а <b>{d.benchShare}%</b> почти не выходят со скамейки</h2>
            <p className="av-why">На <b style={{ color: 'var(--av-text)' }}>{d.players}</b> игроках региона с расстановками (≥2 матчей). «Возможность» = доля матчей, начатых в старте (истинных минут в базе нет — берём факт старта). Индекс неравенства стартов (Gini) <b style={{ color: 'var(--av-text)' }}>{d.gini.toFixed(2)}</b>: 0 — игру делят поровну, 1 — вся игра у немногих.</p>
          </div>
        </div>
        {/* распределение игроков по доле стартов — одна полоса */}
        <div className="av-oppdist">
          <div className="av-oppdist__bar" role="img" aria-label="Распределение игроков по доле стартов">
            {d.buckets.map((b, i) => b.n > 0 && (
              <span key={i} className="av-oppdist__seg" style={{ width: `${(b.n / total) * 100}%`, background: BUCKET_COLOR[i] }} title={`${BUCKET_LABEL[i]} (${b.from}–${b.to}% в старте): ${b.n}`}>
                {b.n / total >= 0.08 && <><b>{b.n}</b><i>{BUCKET_LABEL[i]}</i></>}
              </span>
            ))}
          </div>
          <div className="av-oppdist__legend">
            {d.buckets.map((b, i) => <span key={i}><i style={{ background: BUCKET_COLOR[i] }} />{BUCKET_LABEL[i]} · {b.from}–{b.to}% в старте</span>)}
          </div>
        </div>
      </section>

      {/* Ф2 — Справедливость старта по кварталам рождения */}
      <section className="av-surface av-finding av-finding--cyan av-pad-lg av-rise">
        <div className="av-section" style={{ alignItems: 'flex-start' }}>
          <div>
            <span className="av-finding__kicker">Справедливость старта</span>
            <h2 className="av-verdict" style={{ marginTop: 10 }}>
              {gap != null && gap >= 1
                ? <>Поздно-рождённые получают на <b>{gap} п.п.</b> меньше стартов</>
                : 'Старт распределён ровно по кварталам рождения'}
            </h2>
          </div>
          <button type="button" className={`av-pill${strong ? ' av-pill--active' : ''}`} onClick={() => setStrong(!strong)} title="Только игроки с рейтингом ≥ медианы — сравнение «при равном классе»">
            {strong ? 'При равном классе' : 'Все игроки'}
          </button>
        </div>
        <div className="av-oppq">
          {qs.map((q) => (
            <div key={q.q} className="av-oppq__row">
              <span className="av-oppq__label">Q{q.q} · {QLABEL[q.q - 1]}</span>
              <span className="av-oppq__track"><span className="av-oppq__fill" style={{ width: `${Math.min(100, (q.startRate / maxRate) * 100)}%`, background: q.q === 1 ? 'var(--av-cyan)' : q.q === 4 ? 'var(--av-magenta)' : 'rgba(94,235,252,0.5)' }} /></span>
              <span className="av-oppq__val" style={{ color: q.q === 4 ? 'var(--av-magenta)' : 'var(--av-text)' }}>{q.startRate}%</span>
              <span className="av-oppq__n">{q.players} игр.</span>
            </div>
          ))}
        </div>
        <p className="av-why" style={{ marginTop: 14 }}>
          Доля матчей в старте по кварталу рождения{strong ? ' — только игроки с рейтингом ≥ медианы (при равном классе)' : ''}. <b style={{ color: 'var(--av-text)' }}>Главный перекос — не здесь, а на ВХОДЕ</b>: поздно-рождённых в разы реже отбирают вообще (<Link to="/federation/fairness" className="av-link">Эффект возраста</Link>). Разрыв в старте — вторичная, но та же потеря: кого взяли — тому ещё и реже доверяют старт.
        </p>
      </section>
    </>
  );
}

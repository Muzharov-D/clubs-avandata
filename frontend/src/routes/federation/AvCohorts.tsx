import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { useFedYear } from './avYear';
import './avandata.css';

interface Cohort {
  year: number; registry: number; analyzed: number; raeSkew: number | null;
  q1pct: number; q4pct: number; avgRating: number | null;
  top: { id: number; name: string; club: string | null; clubLogo: string | null; rating: number | null } | null;
}

const num = (n: number) => n.toLocaleString('ru-RU');
const skewVerdict = (s: number | null) => (s == null ? '' : s >= 2 ? 'сильный' : s >= 1.5 ? 'умеренный' : 'слабый');
const skewColor = (s: number | null) => (s == null ? 'var(--av-text-dim)' : s >= 2 ? 'var(--av-magenta)' : s >= 1.5 ? 'var(--av-warning)' : 'var(--av-success)');

/**
 * Регион по когортам — главный экран-телескоп. Каждый год рождения: размер
 * реестра, разбор, возрастной перекос (RAE), средний класс, звезда. Клик →
 * проваливание в когорту (фильтр возраста + обзор).
 */
export function FederationAvCohorts() {
  const navigate = useNavigate();
  const { setYear } = useFedYear();
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'cohorts'], queryFn: () => api<{ cohorts: Cohort[] }>('/federation/av/cohorts') });
  const cohorts = data?.cohorts ?? [];

  function drill(year: number) { setYear(year); navigate('/federation'); }

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <span className="av-kicker">Телескоп региона</span>
          <h1 className="av-title">Регион по когортам</h1>
          <p className="av-sub">Каждый год рождения как организм · размер · возрастной перекос · класс · звезда. Клик — провалиться в когорту.</p>
        </div>
      </header>

      {error && <div className="av-note" style={{ color: 'var(--av-danger)' }}>База недоступна — задан ли AVANDATA_API_KEY на сервере?</div>}
      {isLoading && <div className="av-cohorts">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="av-skeleton" style={{ height: 90 }} />)}</div>}

      {cohorts.length > 0 && (
        <div className="av-cohorts av-rise">
          {cohorts.map((c) => {
            const rest = Math.max(0, 100 - c.q1pct - c.q4pct);
            const q2q3 = rest; // средние кварталы
            const convPct = c.registry ? Math.round((c.analyzed / c.registry) * 100) : 0;
            return (
              <button key={c.year} className="av-surface av-cohort" onClick={() => drill(c.year)}>
                {/* Год + воронка */}
                <div>
                  <div className="av-cohort__year">{c.year}</div>
                  <div className="av-cohort__funnel">реестр <b style={{ color: 'var(--av-text-2)' }}>{num(c.registry)}</b> · разбор {c.analyzed} ({convPct}%)</div>
                </div>

                {/* Возрастной перекос (RAE) */}
                <div>
                  <div className="av-cohort__lbl">Возрастной перекос</div>
                  <div className="av-qbar" title={`Q1 ${c.q1pct}% · середина ${Math.round(q2q3)}% · Q4 ${c.q4pct}%`}>
                    <span style={{ width: `${c.q1pct}%`, background: 'var(--av-magenta)' }} />
                    <span style={{ width: `${q2q3}%`, background: 'rgba(255,255,255,0.18)' }} />
                    <span style={{ width: `${c.q4pct}%`, background: 'var(--av-accent)' }} />
                  </div>
                  <div className="av-cohort__skew">
                    <span>начало года ⁄ конец</span>
                    <b style={{ color: skewColor(c.raeSkew) }}>×{c.raeSkew ?? '—'}</b>
                    <span style={{ color: skewColor(c.raeSkew) }}>{skewVerdict(c.raeSkew)}</span>
                  </div>
                </div>

                {/* Средний класс */}
                <div>
                  <div className="av-cohort__lbl">Средний класс</div>
                  <div className="av-cohort__class">{c.avgRating != null ? num(c.avgRating) : '—'}</div>
                </div>

                {/* Звезда когорты */}
                <div>
                  <div className="av-cohort__lbl">Звезда когорты</div>
                  {c.top ? (
                    <Link className="av-cohort__star" to={`/federation/players/${c.top.id}`} onClick={(e) => e.stopPropagation()}>
                      <ClubShield name={c.top.club ?? c.top.name} logoUrl={c.top.clubLogo} size={30} />
                      <div style={{ minWidth: 0 }}>
                        <div className="av-cohort__star-name">{c.top.name}</div>
                        <div className="av-cohort__star-meta">{c.top.club ?? '—'}</div>
                      </div>
                      <span className="av-rate" style={{ marginLeft: 'auto' }}>{c.top.rating}</span>
                    </Link>
                  ) : <div className="av-dim" style={{ fontSize: 12 }}>нет разбора</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {cohorts.length > 0 && (
        <p className="av-dim av-rise" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
          Перекос — во сколько раз рождённых в начале года (Q1) больше, чем в конце (Q4); эталон равномерности — ровно ×1.
          Перекос ≥2 у большинства когорт = регион системно отбирает физически старших внутри возраста и теряет поздних.
        </p>
      )}
    </>
  );
}

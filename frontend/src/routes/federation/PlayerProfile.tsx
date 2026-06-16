import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { StatTile } from '../../components/StatTile';
import { Sparkline } from '../../components/Sparkline';
import { api } from '../../api/client';
import { FedPizza, type PizzaSlice } from './FedPizza';
import { ratingColor, pctColor, tint } from './fedColors';
import {
  METRIC_CATALOG, FACETS, DEFAULT_PIZZA, LINE_LABEL,
  computeMetricRows, percentileIn, poolFor, lineOf, fmtValue, unitOf,
  type PoolPlayer, type Baseline, type MetricRow,
} from './fedMetrics';
import './federation.css';

interface Profile {
  playerId: string;
  name: string | null;
  club: string;
  ageGroup: string;
  position: string | null;
  positionFull: string | null;
  birthYear: number | null;
  matches: number;
  minutes: number;
  ratings: { overall: number | null; attack: number | null; defence: number | null; passing: number | null; fitness: number | null; creativity: number | null };
  totals: {
    goals: number; shots: number; dribbles: number; progressivePasses: number;
    tackles: number; interceptions: number;
  };
  trend: Array<{ date: string | null; overall: number }>;
  splits: { first: number | null; second: number | null } | null;
}

type PoolRow = PoolPlayer;

const TILE_METRICS: Array<{ k: keyof Profile['totals']; l: string; accent: 'gold' | 'cyan' | 'violet' | 'green' | 'muted' }> = [
  { k: 'goals', l: 'Голы', accent: 'gold' },
  { k: 'progressivePasses', l: 'Прогрессивные пасы', accent: 'cyan' },
  { k: 'shots', l: 'Удары', accent: 'violet' },
  { k: 'dribbles', l: 'Обводки', accent: 'violet' },
  { k: 'tackles', l: 'Отборы', accent: 'green' },
  { k: 'interceptions', l: 'Перехваты', accent: 'green' },
];

/** Профиль игрока (дриллдаун из талант-пула). Скаут-карточка с перцентилями. */
export function FederationPlayerProfile() {
  const { id = '' } = useParams();
  const profileQ = useQuery({
    queryKey: ['federation', 'player', id],
    queryFn: () => api<Profile>(`/federation/players/${encodeURIComponent(id)}`),
  });
  // Талант-пул региона — знаменатель для перцентилей (есть только у федерации).
  const poolQ = useQuery({
    queryKey: ['federation', 'talent', 0],
    queryFn: () => api<{ players: PoolRow[] }>(`/federation/talent?minMinutes=0`),
  });

  return (
    <div>
      <Link to="/federation/talent" className="fed-link" style={{ display: 'inline-block', marginBottom: 14 }}>← К игрокам</Link>

      {profileQ.isLoading && <div className="fed-skeleton" style={{ height: 340 }} />}
      {profileQ.error && <div className="fed-empty"><div className="fed-empty__icon">🔍</div>Игрок не найден или вне федерации.</div>}

      {profileQ.data && <ProfileBody p={profileQ.data} pool={poolQ.data?.players ?? []} poolLoading={poolQ.isLoading} />}
    </div>
  );
}

function poolPlayerFromProfile(p: Profile): PoolPlayer {
  return {
    playerId: p.playerId, club: p.club, ageGroup: p.ageGroup, position: p.position, minutes: p.minutes,
    rating: p.ratings.overall, attack: p.ratings.attack, defence: p.ratings.defence,
    passing: p.ratings.passing, fitness: p.ratings.fitness, creativity: p.ratings.creativity,
    goals: p.totals.goals, shots: p.totals.shots, dribbles: p.totals.dribbles,
    progressivePasses: p.totals.progressivePasses, tackles: p.totals.tackles, interceptions: p.totals.interceptions,
  };
}

/** Разница год рождения − номинальный год команды: >0 играет на возраст старше. */
function ageDelta(ageGroup: string, birthYear: number | null): number | null {
  const gy = /^\d{4}$/.test(ageGroup) ? Number(ageGroup) : null;
  if (gy == null || birthYear == null) return null;
  return birthYear - gy;
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function ProfileBody({ p, pool, poolLoading }: { p: Profile; pool: PoolRow[]; poolLoading: boolean }) {
  const [baseline, setBaseline] = useState<Baseline>('team');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_PIZZA));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);

  // Целевой игрок — из пула (каноничные значения); если фильтр его не вернул, строим из профиля.
  const target = useMemo<PoolPlayer>(() => {
    const inPool = pool.find((x) => x.playerId === p.playerId);
    return inPool ?? poolPlayerFromProfile(p);
  }, [pool, p]);
  const fullPool = useMemo<PoolPlayer[]>(
    () => (pool.some((x) => x.playerId === p.playerId) ? pool : [...pool, target]),
    [pool, p.playerId, target],
  );

  const rows = useMemo<MetricRow[]>(() => computeMetricRows(fullPool, target, baseline), [fullPool, target, baseline]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.def.key, r])), [rows]);
  const comparePool = useMemo(() => poolFor(fullPool, target, baseline), [fullPool, target, baseline]);

  // Вердикт в шапке: место по общему индексу В РЕГИОНЕ по линии (фишка федерации).
  const line = lineOf(p.position);
  const regionOverall = useMemo(
    () => percentileIn(poolFor(fullPool, target, 'region'), target, METRIC_CATALOG.find((m) => m.key === 'overall')!),
    [fullPool, target],
  );

  const delta = ageDelta(p.ageGroup, p.birthYear);
  const fitness = p.ratings.fitness;
  const highLoad = fitness != null && fitness >= 8;

  // Сильные / слабые грани по перцентилю текущей базы.
  const ranked = useMemo(() => rows.filter((r) => r.res.pct != null), [rows]);
  const strengths = useMemo(() => [...ranked].sort((a, b) => (b.res.pct! - a.res.pct!)).slice(0, 5), [ranked]);
  const weaknesses = useMemo(() => [...ranked].sort((a, b) => (a.res.pct! - b.res.pct!)).slice(0, 5), [ranked]);

  // Амплуа по данным — топ-грани CIES по среднему перцентилю.
  const topFacets = useMemo(() => {
    return FACETS.map((f) => {
      const ps = rows.filter((r) => r.def.facet === f && r.res.pct != null).map((r) => r.res.pct!);
      return { facet: f, avg: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null };
    })
      .filter((x): x is { facet: typeof x.facet; avg: number } => x.avg != null && x.avg >= 55)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 2)
      .map((x) => x.facet);
  }, [rows]);

  const slices: PizzaSlice[] = useMemo(
    () =>
      METRIC_CATALOG.filter((m) => selected.has(m.key)).map((m) => {
        const r = byKey.get(m.key);
        const pct = r?.res.pct ?? null;
        return { key: m.key, short: m.short, pct, badge: pct == null ? '—' : String(pct) };
      }),
    [selected, byKey],
  );

  const trend = p.trend.map((t) => t.overall);
  const per90 = (total: number) => (p.minutes > 0 ? Math.round((total / p.minutes) * 90 * 100) / 100 : null);
  const tiles = TILE_METRICS.filter((m) => p.totals[m.k] > 0);

  const poolNote =
    baseline === 'team'
      ? `товарищи по команде · ${p.club} ${p.ageGroup}`
      : `регион · ${LINE_LABEL[line]}`;

  return (
    <>
      <header className="fed-head fed-rise" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          {p.ratings.overall != null && (
            <span
              className="fed-rate"
              style={{ fontSize: 22, minWidth: 64, padding: '10px 0', color: ratingColor(p.ratings.overall), background: tint(ratingColor(p.ratings.overall)), borderColor: tint(ratingColor(p.ratings.overall), 38) }}
            >
              {p.ratings.overall.toFixed(1)}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="fed-title" style={{ fontSize: 24 }}>
              {p.name ?? <span className="fed-faint" style={{ fontStyle: 'italic' }}>Без согласия</span>}
            </h1>
            <p className="fed-sub">
              {p.positionFull || p.position || 'позиция не указана'} · {p.club} · возраст {p.ageGroup}
              {p.birthYear ? ` (${p.birthYear} г.р.)` : ''} · {p.matches}{' '}
              {plural(p.matches, 'матч', 'матча', 'матчей')} · {p.minutes}′
            </p>
            <div className="fed-verdict">
              {regionOverall.pct != null ? (
                <span className="fed-vchip" style={{ color: pctColor(regionOverall.pct), borderColor: tint(pctColor(regionOverall.pct), 40), background: tint(pctColor(regionOverall.pct)) }}>
                  топ {Math.max(1, 100 - regionOverall.pct)}% · {LINE_LABEL[line]} региона
                </span>
              ) : regionOverall.rank != null && regionOverall.poolSize > 1 ? (
                <span className="fed-vchip fed-vchip--soft">{regionOverall.rank}-й из {regionOverall.poolSize} · {LINE_LABEL[line]} региона</span>
              ) : null}
              {delta != null && delta !== 0 && (
                <span className="fed-vchip fed-vchip--soft" style={{ color: delta > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                  {delta > 0
                    ? `играет на ${delta} ${plural(delta, 'год', 'года', 'лет')} старше`
                    : `старше команды на ${-delta} ${plural(-delta, 'год', 'года', 'лет')}`}
                </span>
              )}
              {topFacets.length > 0 && (
                <span className="fed-vchip fed-vchip--soft">амплуа по данным: {topFacets.join(' · ').toLowerCase()}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="fed-scout fed-rise">
        {/* ---- Перцентильная «пицца» ---- */}
        <section className="fed-card">
          <div className="fed-card__pad">
            <div className="fed-card__title" style={{ marginBottom: 10 }}>
              <span>Профиль по перцентилям</span>
              <div className="fed-tabs">
                <button className={`fed-tab${baseline === 'team' ? ' fed-tab--active' : ''}`} onClick={() => setBaseline('team')}>в команде</button>
                <button className={`fed-tab${baseline === 'region' ? ' fed-tab--active' : ''}`} onClick={() => setBaseline('region')}>в регионе</button>
              </div>
            </div>

            {poolLoading ? (
              <div className="fed-skeleton" style={{ height: 320 }} />
            ) : slices.length < 3 ? (
              <div className="fed-note">Выберите минимум 3 показателя для «пиццы».</div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <FedPizza slices={slices} />
              </div>
            )}

            <div className="fed-pizza__foot">
              <span className="fed-faint">
                Сравнение: <b style={{ color: 'var(--text-muted)' }}>{poolNote}</b>
                {comparePool.length > 0 && <> · {comparePool.length} {plural(comparePool.length, 'игрок', 'игрока', 'игроков')}</>}
              </span>
              <button className="fed-pizza__cfg" onClick={() => setPickerOpen((v) => !v)}>
                Показатели ({selected.size}) {pickerOpen ? '▴' : '▾'}
              </button>
            </div>
            <p className="fed-pizza__hint">Длина и цвет луча — перцентиль: место игрока в пуле (100 = лучший). Числа у обода — перцентиль.</p>

            {comparePool.length < 3 && !poolLoading && (
              <p className="fed-pizza__hint" style={{ color: 'var(--warning)' }}>
                Пул сравнения мал ({comparePool.length}) — перцентили показываются там, где база ≥ 3 игроков. Узор обострится с ростом региона.
              </p>
            )}

            {pickerOpen && (
              <div className="fed-facets">
                {FACETS.map((f) => {
                  const ms = METRIC_CATALOG.filter((m) => m.facet === f);
                  return (
                    <div key={f} className="fed-facet">
                      <div className="fed-facet__name">{f}</div>
                      {ms.map((m) => {
                        const r = byKey.get(m.key);
                        const on = selected.has(m.key);
                        return (
                          <label key={m.key} className="fed-chk">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(m.key)) next.delete(m.key);
                                  else next.add(m.key);
                                  return next;
                                })
                              }
                            />
                            <span>{m.label}</span>
                            {r?.res.value != null && (
                              <span className="fed-chk__v" style={{ color: r.res.pct != null ? pctColor(r.res.pct) : 'var(--text-faint)' }}>
                                {fmtValue(m, r.res.value)}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ---- Правая колонка ---- */}
        <div className="fed-stack">
          {/* Атлетизм и нагрузка */}
          <section className="fed-card">
            <div className="fed-card__pad">
              <div className="fed-card__title">Атлетизм и нагрузка</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, fontVariantNumeric: 'tabular-nums', color: fitness == null ? 'var(--text-faint)' : ratingColor(fitness) }}>
                  {fitness == null ? '—' : fitness.toFixed(1)}
                </span>
                <span className="fed-faint" style={{ fontSize: 12 }}>индекс физики · {p.matches} {plural(p.matches, 'матч', 'матча', 'матчей')} · {p.minutes}′</span>
              </div>
              {highLoad && (
                <div className="fed-risk">
                  <button className="fed-risk__pill" onClick={() => setRiskOpen((v) => !v)} aria-expanded={riskOpen}>
                    ⚠ Высокая нагрузка{delta != null && delta > 0 ? ' · играет старше' : ''}
                  </button>
                  {riskOpen && (
                    <div className="fed-pop" role="tooltip">
                      <div className="fed-pop__title">Внимание к риску травмы</div>
                      <p>
                        Высокий индекс физики у юного игрока — это и достоинство, и зона внимания.
                        Спортивная наука о нагрузке (модель «острой/хронической» нагрузки) показывает:
                        резкий рост игрового объёма у растущего организма повышает риск травм перенапряжения.
                        {delta != null && delta > 0 && ' Игрок регулярно выходит на возраст старше — нагрузка ещё выше.'}
                      </p>
                      <p className="fed-pop__rec">Рекомендация: отслеживать минуты и пики нагрузки, дозировать матчи на возраст старше.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {trend.length >= 2 && (
            <section className="fed-card">
              <div className="fed-card__pad">
                <div className="fed-card__title">Индекс по матчам</div>
                <Sparkline values={trend} width={320} height={56} color="var(--accent-cyan)" />
                <div className="fed-faint" style={{ fontSize: 11.5, marginTop: 6 }}>
                  от {Math.min(...trend).toFixed(1)} до {Math.max(...trend).toFixed(1)} за {trend.length} {plural(trend.length, 'матч', 'матча', 'матчей')}
                </div>
              </div>
            </section>
          )}

          {p.splits && (p.splits.first != null || p.splits.second != null) && (
            <section className="fed-card">
              <div className="fed-card__pad">
                <div className="fed-card__title">Индекс по таймам</div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <SplitVal label="1-й тайм" v={p.splits.first} />
                  <SplitVal label="2-й тайм" v={p.splits.second} />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ---- Сильные / слабые стороны ---- */}
      {ranked.length > 0 && (
        <div className="fed-sw fed-rise">
          <section className="fed-card">
            <div className="fed-card__pad">
              <div className="fed-card__title">Сильные стороны <span className="fed-faint" style={{ fontWeight: 400 }}>({poolNote})</span></div>
              {strengths.map((r) => <SwRow key={r.def.key} r={r} />)}
            </div>
          </section>
          <section className="fed-card">
            <div className="fed-card__pad">
              <div className="fed-card__title">Зоны роста <span className="fed-faint" style={{ fontWeight: 400 }}>({poolNote})</span></div>
              {weaknesses.map((r) => <SwRow key={r.def.key} r={r} />)}
            </div>
          </section>
        </div>
      )}

      {/* ---- Вклад за период ---- */}
      {tiles.length > 0 && (
        <section className="fed-card fed-rise">
          <div className="fed-card__pad">
            <div className="fed-card__title">Вклад за период · всего (и за 90 минут)</div>
            <div className="fed-kpis">
              {tiles.map((m) => {
                const total = p.totals[m.k];
                const p90 = per90(total);
                return <StatTile key={m.k} label={m.l} value={total} extra={p90 != null ? `${p90} за 90` : undefined} accent={m.accent} />;
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** Строка сильной/слабой стороны: показатель, значение, перцентиль-бар. */
function SwRow({ r }: { r: MetricRow }) {
  const { def, res } = r;
  const color = pctColor(res.pct);
  return (
    <div className="fed-swrow">
      <div className="fed-swrow__top">
        <span className="fed-swrow__lbl">{def.label}</span>
        <span className="fed-swrow__val">
          {fmtValue(def, res.value)} <span className="fed-faint" style={{ fontSize: 10.5 }}>{unitOf(def)}</span>
        </span>
      </div>
      <div className="fed-swrow__bar">
        <span className="fed-swrow__fill" style={{ width: `${res.pct ?? 0}%`, background: color }} />
      </div>
      <div className="fed-swrow__pct" style={{ color }}>
        {res.pct == null
          ? (res.rank != null ? `${res.rank}-й из ${res.poolSize}` : '—')
          : `перцентиль ${res.pct} · ${res.rank}-й из ${res.poolSize}`}
      </div>
    </div>
  );
}

function SplitVal({ label, v }: { label: string; v: number | null }) {
  return (
    <div>
      <div className="fed-faint" style={{ fontSize: 11.5, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: v == null ? 'var(--text-faint)' : ratingColor(v) }}>
        {v == null ? '—' : v.toFixed(1)}
      </div>
    </div>
  );
}

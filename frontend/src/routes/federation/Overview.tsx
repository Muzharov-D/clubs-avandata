import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { StatTile } from '../../components/StatTile';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { healthColor } from './fedColors';
import { FedRadar, type RadarAxis } from './FedRadar';
import './federation.css';

interface OverviewData {
  clubs: { total: number; paid: number; free: number };
  teams: number;
  players: number;
  matches: number;
}
interface DqRow { slug: string; name: string; players: number; birthPct: number | null; photoPct: number | null; positionPct: number | null; consentPct: number | null }
interface ClubRow { slug: string; name: string; plan: string; teams: number; players: number; matches: number; coverage: number | null }
interface RegionProfile {
  ratings: { overall: number | null; attack: number | null; defence: number | null; passing: number | null; fitness: number | null; creativity: number | null };
  style: {
    shots: number | null; shotsOnTarget: number | null; dribbles: number | null;
    keyPasses: number | null; progressivePasses: number | null;
    tackles: number | null; interceptions: number | null; recoveries: number | null;
    touchesInBox: number | null; accuratePasses: number | null; crosses: number | null; distanceKm: number | null;
  };
  matchesRated: number;
  matchesStyled: number;
}
const STYLE_DEFS: Array<{ k: keyof RegionProfile['style']; l: string; accent: 'cyan' | 'gold' | 'green' | 'violet' | 'muted' }> = [
  { k: 'shots', l: 'Удары', accent: 'gold' },
  { k: 'shotsOnTarget', l: 'Удары в створ', accent: 'gold' },
  { k: 'dribbles', l: 'Обводки', accent: 'violet' },
  { k: 'keyPasses', l: 'Ключевые передачи', accent: 'cyan' },
  { k: 'progressivePasses', l: 'Прогрессивные пасы', accent: 'cyan' },
  { k: 'accuratePasses', l: 'Точные передачи', accent: 'cyan' },
  { k: 'crosses', l: 'Кроссы', accent: 'cyan' },
  { k: 'touchesInBox', l: 'Касания в штрафной', accent: 'violet' },
  { k: 'tackles', l: 'Отборы', accent: 'green' },
  { k: 'interceptions', l: 'Перехваты', accent: 'green' },
  { k: 'recoveries', l: 'Подборы', accent: 'green' },
  { k: 'distanceKm', l: 'Дистанция, км', accent: 'muted' },
];

/**
 * Обзор региона (Эпик 1, FR4–5) — лендинг кабинета. Три слоя:
 *  1. KPI-ряд: честный охват клубов (база/глубина не суммируются) + StatTile.
 *  2. Целостность данных по региону — взвешенные проценты паспортизации + согласие.
 *  3. Мини-реестр клубов (топ по составу) со ссылкой в полный реестр.
 * Данные: /federation/overview + /federation/data-quality + /federation/clubs.
 */
export function FederationOverview() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const ov = useQuery({ queryKey: ['federation', 'overview'], queryFn: () => api<OverviewData>('/federation/overview') });
  const rp = useQuery({ queryKey: ['federation', 'region-profile'], queryFn: () => api<RegionProfile>('/federation/region-profile') });
  const dq = useQuery({ queryKey: ['federation', 'data-quality'], queryFn: () => api<{ clubs: DqRow[] }>('/federation/data-quality') });
  const cl = useQuery({ queryKey: ['federation', 'clubs'], queryFn: () => api<{ clubs: ClubRow[] }>('/federation/clubs') });

  const data = ov.data;

  // Охват данными по региону — взвешенное среднее data_quality.score по числу матчей.
  const clubsCov = cl.data?.clubs ?? [];
  const covMatches = clubsCov.reduce((s, c) => s + (c.coverage != null ? c.matches : 0), 0);
  const regionCoverage = covMatches
    ? Math.round(clubsCov.reduce((s, c) => s + (c.coverage != null ? c.coverage * c.matches : 0), 0) / covMatches)
    : null;

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Обзор региона</h1>
          <p className="fed-sub">{federation?.region ?? federation?.name ?? 'Регион'} · детско-юношеский футбол</p>
        </div>
      </header>

      {ov.isLoading && (
        <div className="fed-kpis">
          {[0, 1, 2, 3].map((i) => <div key={i} className="fed-skeleton" style={{ height: 104 }} />)}
        </div>
      )}
      {ov.error && <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить данные региона</div>}

      {data && (
        <div className="fed-stack">
          {/* 1. KPI-ряд */}
          <div className="fed-kpis">
            <div className="fed-coverage fed-rise">
              <div className="fed-coverage__label">Клубы региона</div>
              <div className="fed-coverage__value">{data.clubs.total}</div>
              <div className="fed-coverage__split">
                <span className="fed-chip fed-chip--deep">{data.clubs.paid} на глубине</span>
                <span className="fed-chip fed-chip--base">{data.clubs.free} базовый слой</span>
              </div>
            </div>
            <div className="fed-rise"><StatTile label="Команд" value={data.teams} accent="muted" /></div>
            <div className="fed-rise"><StatTile label="Игроков в реестре" value={data.players} accent="violet" /></div>
            <div className="fed-rise"><StatTile label="Матчей разобрано" value={data.matches} accent="gold" /></div>
          </div>

          {/* 2. Профиль качества региона — 6-мерный рейтинг (реальная глубина) */}
          <RegionProfileSection data={rp.data} loading={rp.isLoading} matches={data.matches} coverage={regionCoverage} />

          {/* 3 + 4. Целостность данных + мини-реестр клубов */}
          <div className="fed-cols">
            <DataQualityCard rows={dq.data?.clubs} loading={dq.isLoading} />
            <ClubsCard rows={cl.data?.clubs} loading={cl.isLoading} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Взвешенный по числу игроков процент по региону (полнота данных). */
function weightedPct(rows: DqRow[], sel: (r: DqRow) => number | null): number | null {
  const total = rows.reduce((s, r) => s + r.players, 0);
  if (total === 0) return null;
  const acc = rows.reduce((s, r) => s + r.players * (sel(r) ?? 0), 0);
  return Math.round(acc / total);
}

function DataQualityCard({ rows, loading }: { rows?: DqRow[]; loading: boolean }) {
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          Целостность данных
          <Link to="/federation/data-quality" className="fed-link">По клубам →</Link>
        </div>
        {loading && <div className="fed-skeleton" style={{ height: 120 }} />}
        {rows && rows.length === 0 && <div className="fed-note">Нет данных по клубам</div>}
        {rows && rows.length > 0 && (
          <div>
            <QualityLine label="Согласие 152-ФЗ" pct={weightedPct(rows, (r) => r.consentPct)} />
            <QualityLine label="Дата рождения" pct={weightedPct(rows, (r) => r.birthPct)} />
            <QualityLine label="Позиция" pct={weightedPct(rows, (r) => r.positionPct)} />
            <QualityLine label="Фото" pct={weightedPct(rows, (r) => r.photoPct)} />
            <p className="fed-faint" style={{ fontSize: 11.5, margin: '12px 0 0', lineHeight: 1.5 }}>
              Доля по региону, взвешенная по числу игроков. Именные данные детей закрыты —
              федерация видит только обезличенную полноту.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function QualityLine({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div className="fed-dist__row" style={{ marginBottom: 11 }}>
      <span className="fed-dist__label">{label}</span>
      <span className="fed-meter">
        <span className="fed-meter__fill" style={{ width: `${pct ?? 0}%`, background: healthColor(pct) }} />
      </span>
      <span className="fed-dist__val fed-num" style={{ width: 48, color: pct == null ? 'var(--text-faint)' : undefined }}>
        {pct == null ? '—' : `${pct}%`}
      </span>
    </div>
  );
}

function RegionProfileSection({ data, loading, matches, coverage }: { data?: RegionProfile; loading: boolean; matches?: number; coverage: number | null }) {
  if (loading) return <div className="fed-skeleton" style={{ height: 240 }} />;
  if (!data) return null;
  const r = data.ratings;
  const axes = ([
    { label: 'Общий', value: r.overall },
    { label: 'Атака', value: r.attack },
    { label: 'Оборона', value: r.defence },
    { label: 'Пас', value: r.passing },
    { label: 'Физика', value: r.fitness },
    { label: 'Креатив', value: r.creativity },
  ] as RadarAxis[]).filter((a) => a.value != null);
  if (axes.length < 3) return null; // радар осмыслен от 3 измерений
  const styleTiles = STYLE_DEFS.filter((d) => data.style[d.k] != null);

  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          Профиль качества региона
          <span className="fed-faint" style={{ fontWeight: 400 }}>{data.matchesRated} матчей с рейтингом</span>
        </div>
        <div className="fed-profile">
          <FedRadar data={axes} />
          <div>
            <div className="fed-kpis">
              <StatTile label="Средний индекс" value={r.overall ?? 0} accent="cyan" />
              {coverage != null && <StatTile label="Охват данными" value={coverage} unit="%" accent="green" />}
              {matches != null && <StatTile label="Матчей разобрано" value={matches} accent="muted" />}
            </div>
            <p className="fed-faint" style={{ fontSize: 11.5, margin: '14px 2px 0', lineHeight: 1.55 }}>
              Радар — средний индекс эффективности региона (0–10) по измерениям игры.
            </p>
          </div>
        </div>

        {styleTiles.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="fed-card__title" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              Стиль игры · в среднем за матч
            </div>
            <div className="fed-kpis">
              {styleTiles.map((d) => (
                <StatTile key={d.k} label={d.l} value={data.style[d.k] as number} accent={d.accent} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ClubsCard({ rows, loading }: { rows?: ClubRow[]; loading: boolean }) {
  const top = rows ? [...rows].sort((a, b) => b.players - a.players).slice(0, 5) : [];
  const more = rows ? rows.length - top.length : 0;
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          Клубы региона
          <Link to="/federation/clubs" className="fed-link">Весь реестр →</Link>
        </div>
        {loading && <div className="fed-skeleton" style={{ height: 120 }} />}
        {rows && rows.length === 0 && <div className="fed-note">В регионе пока нет клубов</div>}
        {top.length > 0 && (
          <div>
            {top.map((c) => (
              <div className="fed-row" key={c.slug} style={{ padding: '10px 0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fed-row__name">{c.name}</div>
                  <div className="fed-row__meta">{c.teams} команд · {c.players} игроков · {c.matches} матчей</div>
                </div>
                <span className={`fed-tag fed-tag--${c.plan === 'paid' ? 'deep' : 'base'}`}>
                  {c.plan === 'paid' ? 'глубина' : 'база'}
                </span>
                <div style={{ width: 92, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="fed-meter">
                    <span className="fed-meter__fill" style={{ width: `${c.coverage ?? 0}%`, background: healthColor(c.coverage) }} />
                  </span>
                </div>
              </div>
            ))}
            {more > 0 && (
              <Link to="/federation/clubs" className="fed-link" style={{ display: 'inline-block', marginTop: 10 }}>
                +{more} {more === 1 ? 'клуб' : 'клубов'} в реестре →
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

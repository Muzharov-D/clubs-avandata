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
  style: { possession: number | null; xg: number | null; shots: number | null; shotsOnTarget: number | null; passAccuracy: number | null; duelsWon: number | null; distanceKm: number | null };
  matchesRated: number;
  matchesStyled: number;
}

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

          {/* 2. Профиль качества и стиль игры региона (реальная глубина) */}
          <RegionProfileSection data={rp.data} loading={rp.isLoading} />

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

function RegionProfileSection({ data, loading }: { data?: RegionProfile; loading: boolean }) {
  if (loading) return <div className="fed-skeleton" style={{ height: 240 }} />;
  if (!data) return null;
  const hasRatings = data.matchesRated > 0 && data.ratings.overall != null;
  const hasStyle = data.matchesStyled > 0;
  if (!hasRatings && !hasStyle) return null;

  const axes: RadarAxis[] = [
    { label: 'Общий', value: data.ratings.overall },
    { label: 'Атака', value: data.ratings.attack },
    { label: 'Пас', value: data.ratings.passing },
    { label: 'Креатив', value: data.ratings.creativity },
    { label: 'Физика', value: data.ratings.fitness },
    { label: 'Оборона', value: data.ratings.defence },
  ];
  const st = data.style;
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          Профиль качества и стиль игры
          <span className="fed-faint" style={{ fontWeight: 400 }}>
            {hasRatings ? `${data.matchesRated} матчей с рейтингом` : `${data.matchesStyled} матчей`}
          </span>
        </div>
        <div className="fed-profile">
          {hasRatings ? <FedRadar data={axes} /> : <div className="fed-note">Нет матчей с рейтингом игроков</div>}
          <div className="fed-kpis" style={{ flex: 1 }}>
            {hasStyle ? (
              <>
                <StatTile label="Владение" value={st.possession ?? 0} unit="%" accent="cyan" />
                <StatTile label="xG за матч" value={st.xg ?? 0} accent="gold" />
                <StatTile label="Удары" value={st.shots ?? 0} extra={st.shotsOnTarget != null ? `${st.shotsOnTarget} в створ` : undefined} accent="violet" />
                <StatTile label="Точность паса" value={st.passAccuracy ?? 0} unit="%" accent="green" />
                <StatTile label="Единоборства" value={st.duelsWon ?? 0} unit="%" accent="muted" />
                <StatTile label="Дистанция" value={st.distanceKm ?? 0} unit="км" accent="cyan" />
              </>
            ) : (
              <div className="fed-note">Командных метрик стиля пока нет в разобранных матчах.</div>
            )}
          </div>
        </div>
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

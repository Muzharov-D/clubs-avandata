import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { MatchDetail, type MatchBase } from './MatchDetail';
import { FedError } from './FedState';
import { ratingColor, ratingLabel } from './ratings';
import { num, pm, fmtDate, fmtStamp, plMatch, normTeam } from './utils';
import './federation.css';
import './holding.css';

// ─── Форма ответа /federation/av/holdings/:slug (зеркало backend/federation/holdings.ts) ───
type Outcome = 'w' | 'd' | 'l';
interface Brand { primary: string; bright: string; soft: string; onPrimary: string }
interface Member { key: string; label: string; logo: string | null; teams: number }
interface Side { name: string; logo: string | null; score: number | null; isMember: boolean }
interface HMatch { id: number; date: string; tour: number; age: string; division: string; home: Side; away: Side; outcome: Outcome | null; played: boolean }
interface HPlayer { id: number; name: string; birthYear: number | null; position: string | null; rating: number | null; mp: number; photo: string | null; team: string; clubKey: string; clubLabel: string; division: string }
interface Standing { place: number; size: number; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface TableRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number; isMember: boolean }
interface HTeam {
  key: string; clubKey: string; clubLabel: string; name: string; logo: string | null;
  year: number; category: string; ageTitle: string; division: string; divisionKey: string | null;
  standing: Standing | null; standingsSource: 'ffspb' | 'mirror'; standingsDegraded: boolean; table: TableRow[];
  rating: { value: number; rank: number; size: number } | null;
  squad: { players: number; rated: number; avgRating: number | null; inTop30: number };
  top: HPlayer[]; form: Outcome[]; last: HMatch | null; next: HMatch | null; matches: HMatch[];
}
interface HXi { line: 'GK' | 'DEF' | 'MID' | 'FWD'; players: HPlayer[] }
interface HoldingProfile {
  slug: string; name: string; short: string; region: string; brand: Brand; season: number; asOf: string;
  members: Member[]; years: number[];
  summary: { teams: number; byDivision: Array<{ division: string; teams: number }>; avgPlace: number | null; sumRating: number; players: number; rated: number; inTop30: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number };
  teams: HTeam[]; topPlayers: HPlayer[]; xi: HXi[];
}

const OUT: Record<Outcome, string> = { w: 'П', d: 'Н', l: 'М' };
const LINE_TITLE: Record<HXi['line'], string> = { GK: 'Вратарь', DEF: 'Защита', MID: 'Полузащита', FWD: 'Атака' };
const plTeam = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'команд'; if (b === 1) return 'команда'; if (b >= 2 && b <= 4) return 'команды'; return 'команд'; };
const plPlayer = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'игроков'; if (b === 1) return 'игрок'; if (b >= 2 && b <= 4) return 'игрока'; return 'игроков'; };
const shortDiv = (d: string) => d.replace(/\s*лига\s*/i, ' лига').trim();
/** Сторона холдинга и соперник в матче. */
const sides = (m: HMatch) => (m.home.isMember ? { us: m.home, them: m.away, home: true } : { us: m.away, them: m.home, home: false });
const toBase = (m: HMatch): MatchBase => ({
  id: m.id, age: m.age, division: m.division, date: m.date,
  home: { name: m.home.name, logo: m.home.logo, score: m.home.score }, away: { name: m.away.name, logo: m.away.logo, score: m.away.score },
});

/**
 * Страница холдинга — группа школ одного бренда как единая вертикаль: сводка, матрица
 * «возраст × школа» с местом/рейтингом/формой каждой команды, разбор выбранной команды
 * (таблица дивизиона, состав, матчи), лучшие игроки и сборная холдинга.
 * Фирменные цвета приходят с бэка (конфиг холдинга) и попадают в CSS-переменные корня.
 */
export function FederationHolding() {
  const { slug = '' } = useParams();
  // Пока профиль собирается на бэке (холодный старт), приходит 202 «идёт прогрев» —
  // показываем скелетон и переспрашиваем каждые 8 секунд.
  const q = useQuery({
    queryKey: ['av', 'holding', slug],
    queryFn: () => api<HoldingProfile | { status: 'warming' }>(`/federation/av/holdings/${slug}`),
    staleTime: 5 * 60_000,
    retry: 2,
    refetchInterval: (query) => (query.state.data && 'status' in query.state.data ? 8_000 : false),
    refetchIntervalInBackground: true, // вкладка может быть не в фокусе, пока идёт прогрев
  });
  const warming = !!q.data && 'status' in q.data;
  const data = q.data && !('status' in q.data) ? q.data : undefined;
  const isLoading = q.isLoading || warming;
  const error = q.error;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchBase | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => data?.teams.find((t) => t.key === selectedKey) ?? null, [data, selectedKey]);
  useEffect(() => {
    if (selected && detailRef.current) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  if (error) return <FedError subject="Страница холдинга" />;
  if (isLoading || !data) return <HoldingSkeleton />;

  const brandVars = {
    '--hold-primary': data.brand.primary, '--hold-bright': data.brand.bright,
    '--hold-soft': data.brand.soft, '--hold-on': data.brand.onPrimary,
  } as CSSProperties;
  const degraded = data.teams.some((t) => t.standingsDegraded);
  const byDiv = data.summary.byDivision.map((d) => `${d.teams} · ${shortDiv(d.division)}`).join(' · ');

  return (
    <div className="hold" style={brandVars}>
      {/* Шапка в цветах клуба */}
      <header className="hold-hero">
        <div className="hold-hero__logos">
          {data.members.map((m) => <ClubShield key={m.key} name={m.label} logoUrl={m.logo} size={72} />)}
        </div>
        <div className="hold-hero__text">
          <div className="hold-hero__kicker">Холдинг · {data.region} · сезон {data.season === 2 ? 2026 : data.season}</div>
          <h1 className="hold-hero__title">{data.name}</h1>
          <p className="hold-hero__sub">
            {data.members.map((m, i) => <span key={m.key}>{i > 0 ? ' и ' : ''}<b>{m.label}</b> ({m.teams} {plTeam(m.teams)})</span>)}
            {' · '}{data.years[data.years.length - 1]}–{data.years[0]} г.р. · Высшая и Первая лига
          </p>
          <div className="hold-hero__badges">
            <span className={`fed-badge ${degraded ? 'fed-badge--warning' : 'fed-badge--success'}`} title={degraded ? 'Официальный API ФФСПб был недоступен — часть таблиц из зеркала AvanData, в нём бывают пропуски команд.' : 'Турнирные таблицы — из официального API ФФСПб.'}>
              {degraded ? '⚠ Часть таблиц — зеркало AvanData' : '● Официальные таблицы ФФСПб'}
            </span>
            <span className="fed-badge">обновлено {fmtStamp(data.asOf)}</span>
          </div>
        </div>
      </header>

      {/* Крыша из крупных чисел */}
      <div className="fed-grid fed-grid--4 hold-kpi">
        <div className="fed-metric hold-metric">
          <div className="fed-metric__label">Команд в Первенстве</div>
          <div className="fed-metric__value hold-metric__value">{data.summary.teams}</div>
          <div className="fed-metric__extra">{byDiv}</div>
        </div>
        <div className="fed-metric hold-metric">
          <div className="fed-metric__label">Среднее место</div>
          <div className="fed-metric__value hold-metric__value">{data.summary.avgPlace != null ? data.summary.avgPlace.toLocaleString('ru-RU') : '—'}</div>
          <div className="fed-metric__extra">по всем командам в своих дивизионах · баланс {data.summary.won}-{data.summary.drawn}-{data.summary.lost}, мячи {data.summary.goalsFor}:{data.summary.goalsAgainst}</div>
        </div>
        <div className="fed-metric hold-metric">
          <div className="fed-metric__label">Игроков с рейтингом</div>
          <div className="fed-metric__value hold-metric__value">{data.summary.rated}</div>
          <div className="fed-metric__extra">из {data.summary.players} вышедших в разобранных матчах · суммарный рейтинг {num(data.summary.sumRating)}</div>
        </div>
        <div className="fed-metric hold-metric">
          <div className="fed-metric__label">В топ-30 своей лиги</div>
          <div className="fed-metric__value hold-metric__value hold-metric__value--accent">{data.summary.inTop30}</div>
          <div className="fed-metric__extra">игроков холдинга среди 30 сильнейших своего возраста и лиги</div>
        </div>
      </div>

      {/* Вертикаль: возраст × школа */}
      <div className="fed-divider">
        <h2 className="fed-divider__title">Вертикаль холдинга</h2>
        <div className="fed-divider__line" />
      </div>
      <p className="fed-note" style={{ marginTop: -8, marginBottom: 16 }}>
        Каждая команда по возрастам: место в своём дивизионе, очки, рейтинг AvanData и форма последних матчей. Клик по команде — разбор ниже.
      </p>
      <Matrix data={data} selectedKey={selectedKey} onSelect={(k) => setSelectedKey((cur) => (cur === k ? null : k))} />

      {/* Разбор выбранной команды */}
      <div ref={detailRef} style={{ scrollMarginTop: 16 }}>
        {selected && <TeamDetail team={selected} onMatch={(m) => setMatch(toBase(m))} onClose={() => setSelectedKey(null)} />}
      </div>

      {/* Лучшие игроки и сборная */}
      <div className="fed-divider">
        <h2 className="fed-divider__title">Лучшие игроки холдинга</h2>
        <div className="fed-divider__line" />
      </div>
      <div className="hold-two">
        <section className="fed-card">
          <h3 className="fed-card__title">Рейтинг игроков</h3>
          <p className="fed-card__sub">Топ-10 по рейтингу AvanData среди всех команд холдинга · не меньше 2 разобранных матчей</p>
          {data.topPlayers.length === 0 ? <div className="fed-note">Пока нет игроков с рейтингом.</div> : data.topPlayers.map((p, i) => (
            <Link key={p.id} to={`/federation/players/${p.id}`} className="fed-row hold-player" style={{ textDecoration: 'none' }}>
              <span className="fed-table__num hold-player__rank">{i + 1}</span>
              <PlayerAvatar name={p.name} photoUrl={p.photo} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fed-row__name" title={p.name}>{p.name}</div>
                <div className="fed-row__meta hold-ellipsis">{p.team}{p.position ? ` · ${p.position}` : ''} · {p.mp} {plMatch(p.mp)}</div>
              </div>
              <span className="hold-player__rating" style={{ color: ratingColor(p.rating) }} title="рейтинг AvanData">{ratingLabel(p.rating)}</span>
            </Link>
          ))}
        </section>
        <section className="fed-card">
          <h3 className="fed-card__title">Сборная холдинга</h3>
          <p className="fed-card__sub">1-4-3-3 · сильнейшие в каждой линии по рейтингу AvanData, все возрасты</p>
          <Xi xi={data.xi} />
        </section>
      </div>

      <p className="fed-note" style={{ marginTop: 24 }}>
        Данные: база разборов AvanData (рейтинги, составы, матчи) и официальный API ФФСПб (турнирные таблицы). Рейтинг игрока — среднее по разобранным матчам; рейтинг команды — сумма рейтингов игроков.
      </p>

      {match && <MatchDetail base={match} onClose={() => setMatch(null)} />}
    </div>
  );
}

function HoldingSkeleton() {
  return (
    <div className="hold">
      <div className="fed-skeleton" style={{ height: 120, marginBottom: 20 }} />
      <div className="fed-grid fed-grid--4" style={{ marginBottom: 24 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="fed-skeleton" style={{ height: 130 }} />)}</div>
      <div className="fed-skeleton" style={{ height: 420 }} />
      <p className="fed-note" style={{ marginTop: 16 }}>Собираем данные по всем командам холдинга: таблицы, составы и матчи каждого возраста. Первая загрузка может занять до минуты.</p>
    </div>
  );
}

/** Матрица «возраст × школа»: строка — год рождения, колонка — школа холдинга. */
function Matrix({ data, selectedKey, onSelect }: { data: HoldingProfile; selectedKey: string | null; onSelect: (key: string) => void }) {
  const cols = data.members;
  const rows = data.years.map((year) => ({ year, teams: cols.map((m) => data.teams.find((t) => t.year === year && t.clubKey === m.key) ?? null) }));
  return (
    <div className="hold-matrix" style={{ gridTemplateColumns: `120px repeat(${cols.length}, minmax(0, 1fr))` }}>
      <div className="hold-matrix__corner" />
      {cols.map((m) => (
        <div key={m.key} className="hold-matrix__head">
          <ClubShield name={m.label} logoUrl={m.logo} size={28} />
          <span>{m.label}</span>
        </div>
      ))}
      {rows.map(({ year, teams }) => {
        const any = teams.find((t) => t);
        return [
          <div key={`y-${year}`} className="hold-matrix__age">
            <div className="hold-matrix__age-year">{year} г.р.</div>
            <div className="hold-matrix__age-title">{any?.ageTitle ?? ''}</div>
          </div>,
          ...teams.map((t, i) => (
            t ? <TeamCell key={t.key} team={t} active={t.key === selectedKey} onClick={() => onSelect(t.key)} />
              : <div key={`e-${year}-${i}`} className="hold-cell hold-cell--empty">нет команды в Первенстве</div>
          )),
        ];
      })}
    </div>
  );
}

function TeamCell({ team, active, onClick }: { team: HTeam; active: boolean; onClick: () => void }) {
  const s = team.standing, r = team.rating;
  const last = team.last ? sides(team.last) : null;
  return (
    <button type="button" className={`hold-cell${active ? ' hold-cell--active' : ''}`} onClick={onClick} aria-pressed={active} aria-label={`${team.name}, ${team.division}: разбор команды`}>
      <div className="hold-cell__top">
        <span className={`fed-badge ${team.divisionKey === 'Высшая' ? 'hold-badge--top' : 'hold-badge--first'}`}>{shortDiv(team.division)}</span>
        {s && <span className="hold-cell__pts">{s.points} оч · {s.won}-{s.drawn}-{s.lost}</span>}
      </div>
      <div className="hold-cell__main">
        <div className="hold-cell__place">
          <span className="hold-cell__place-no">{s ? `#${s.place}` : '—'}</span>
          <span className="hold-cell__place-of">{s ? `из ${s.size}` : 'нет таблицы'}</span>
        </div>
        <div className="hold-cell__rating" title="рейтинг команды AvanData (сумма рейтингов игроков) и место по рейтингу в дивизионе">
          <span className="hold-cell__rating-val" style={{ color: r ? ratingColor(r.value) : undefined }}>{r ? num(r.value) : '—'}</span>
          <span className="hold-cell__rating-sub">{r ? `рейтинг · ${r.rank}-й из ${r.size}` : 'нет рейтинга'}</span>
        </div>
      </div>
      <div className="hold-cell__foot">
        <Form form={team.form} />
        {last && <span className="hold-cell__last hold-ellipsis" title={`${team.last!.home.name} ${team.last!.home.score ?? '–'}:${team.last!.away.score ?? '–'} ${team.last!.away.name}`}>
          {last.us.score ?? '–'}:{last.them.score ?? '–'} {last.them.name.replace(/\s*20\d{2}\s*$/, '')}
        </span>}
      </div>
    </button>
  );
}

function Form({ form }: { form: Outcome[] }) {
  if (form.length === 0) return <span className="fed-row__meta">матчей ещё нет</span>;
  return (
    <span className="hold-form" aria-label={`форма: ${form.map((o) => OUT[o]).join(' ')}`}>
      {form.map((o, i) => <span key={i} className={`hold-form__dot hold-form__dot--${o}`}>{OUT[o]}</span>)}
    </span>
  );
}

/** Разбор команды: таблица её дивизиона, состав с рейтингами, все матчи. */
function TeamDetail({ team, onMatch, onClose }: { team: HTeam; onMatch: (m: HMatch) => void; onClose: () => void }) {
  const s = team.standing, r = team.rating;
  const [showAll, setShowAll] = useState(false);
  const rated = useMemo(() => team.matches, [team]);
  const played = rated.filter((m) => m.played);
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const upcoming = rated.filter((m) => !m.played && m.date >= yesterday).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <section className="hold-detail fed-card">
      <header className="hold-detail__head">
        <ClubShield name={team.name} logoUrl={team.logo} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="hold-detail__title">{team.name}</h2>
          <div className="hold-detail__sub">{team.ageTitle} · {team.division} · {team.squad.players} {plPlayer(team.squad.players)} в разобранных матчах</div>
        </div>
        <button type="button" className="hold-detail__close" onClick={onClose} aria-label="Свернуть разбор">×</button>
      </header>

      <div className="fed-grid fed-grid--4 hold-detail__kpi">
        <div className="hold-stat hold-stat--hero">
          <div className="hold-stat__label">Место в дивизионе</div>
          <div className="hold-stat__value">{s ? `#${s.place}` : '—'}</div>
          <div className="hold-stat__sub">{s ? `из ${s.size} · ${s.points} оч · ${s.won}-${s.drawn}-${s.lost} · мячи ${pm(s.goalDiff)}` : 'таблица недоступна'}</div>
        </div>
        <div className="hold-stat">
          <div className="hold-stat__label">Рейтинг AvanData</div>
          <div className="hold-stat__value" style={{ color: r ? ratingColor(r.value) : undefined }}>{r ? num(r.value) : '—'}</div>
          <div className="hold-stat__sub">{r ? `${r.rank}-й из ${r.size} по рейтингу` : 'нет данных'}{r && s ? ` · ${deltaText(r.rank, s.place)}` : ''}</div>
        </div>
        <div className="hold-stat">
          <div className="hold-stat__label">Средний класс</div>
          <div className="hold-stat__value" style={{ color: ratingColor(team.squad.avgRating) }}>{team.squad.avgRating != null ? num(team.squad.avgRating) : '—'}</div>
          <div className="hold-stat__sub">{team.squad.rated} {plPlayer(team.squad.rated)} с рейтингом (≥2 матчей)</div>
        </div>
        <div className="hold-stat">
          <div className="hold-stat__label">В топ-30 лиги</div>
          <div className="hold-stat__value hold-stat__value--accent">{team.squad.inTop30}</div>
          <div className="hold-stat__sub">среди 30 сильнейших своего возраста · {shortDiv(team.division)}</div>
        </div>
      </div>

      <div className="hold-detail__grid">
        {/* Таблица дивизиона */}
        <div className="hold-block">
          <h3 className="hold-block__title">Таблица · {team.division}</h3>
          {team.table.length === 0 ? <div className="fed-note">Таблица недоступна.</div> : (
            <table className="fed-table hold-table">
              <thead><tr><th style={{ width: 28 }} /><th /><th>Команда</th><th className="fed-table__num">И</th><th className="fed-table__num">В</th><th className="fed-table__num">Н</th><th className="fed-table__num">П</th><th className="fed-table__num">±</th><th className="fed-table__num">О</th></tr></thead>
              <tbody>
                {team.table.map((row, i) => (
                  <tr key={row.id} className={row.isMember ? 'hold-table__me' : undefined}>
                    <td className="fed-table__num">{i + 1}</td>
                    <td><ClubShield name={row.name} logoUrl={row.logo} size={20} /></td>
                    <td className="hold-table__name"><div className="fed-row__name hold-ellipsis" title={row.name}>{row.name}</div></td>
                    <td className="fed-table__muted">{row.played}</td>
                    <td className="fed-table__num">{row.won}</td>
                    <td className="fed-table__num">{row.drawn}</td>
                    <td className="fed-table__num">{row.lost}</td>
                    <td className="fed-table__num" style={{ color: row.goalDiff > 0 ? 'var(--success)' : row.goalDiff < 0 ? 'var(--danger)' : undefined }}>{pm(row.goalDiff)}</td>
                    <td className="fed-table__num" style={{ fontWeight: 700 }}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {team.standingsDegraded && <p className="fed-note" style={{ marginTop: 8 }}>⚠ Зеркало AvanData — официальный API ФФСПб был недоступен, возможны пропуски команд.</p>}
        </div>

        {/* Состав */}
        <div className="hold-block">
          <h3 className="hold-block__title">Состав по рейтингу</h3>
          <Squad team={team} />
        </div>

        {/* Матчи */}
        <div className="hold-block">
          <h3 className="hold-block__title">Матчи · {played.length} {plMatch(played.length)}</h3>
          {upcoming[0] && (
            <div className="hold-next">
              <span className="fed-badge fed-badge--accent">следующий</span>
              <span className="hold-ellipsis">{upcoming[0].home.name} — {upcoming[0].away.name}</span>
              <span className="fed-row__meta">{fmtDate(upcoming[0].date)} · {upcoming[0].tour}-й тур</span>
            </div>
          )}
          <div className="hold-matches">
            {(showAll ? played : played.slice(0, 8)).map((m) => {
              const { us, them, home } = sides(m);
              return (
                <button type="button" key={m.id} className="hold-match" onClick={() => onMatch(m)} title="Открыть карточку матча">
                  <span className={`hold-form__dot hold-form__dot--${m.outcome ?? 'd'}`}>{m.outcome ? OUT[m.outcome] : '·'}</span>
                  <ClubShield name={them.name} logoUrl={them.logo} size={22} />
                  <span className="hold-match__opp hold-ellipsis" title={them.name}>{them.name.replace(/\s*20\d{2}\s*$/, '')}</span>
                  <span className="hold-match__ha">{home ? 'дома' : 'в гостях'}</span>
                  <span className="hold-match__score">{us.score ?? '–'}:{them.score ?? '–'}</span>
                  <span className="hold-match__date">{fmtDate(m.date)}</span>
                </button>
              );
            })}
            {played.length === 0 && <div className="fed-note">Сыгранных матчей пока нет.</div>}
          </div>
          {played.length > 8 && (
            <button type="button" className="fed-link hold-more" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Свернуть' : `Показать все ${played.length} ${plMatch(played.length)}`}</button>
          )}
        </div>
      </div>
    </section>
  );
}

const deltaText = (ratingRank: number, place: number) => {
  const d = ratingRank - place;
  if (d === 0) return 'место соответствует рейтингу';
  return d > 0 ? `в таблице выше рейтинга на ${d}` : `в таблице ниже рейтинга на ${-d}`;
};

/** Состав: игроки команды с рейтингом; без рейтинга — свёрнуты. */
function Squad({ team }: { team: HTeam }) {
  const q = useQuery({
    queryKey: ['av', 'holding-squad', team.key],
    // Состав уже в профиле (top-3); полный список подтягиваем из общего лидерборда когорты,
    // чтобы не раздувать профиль холдинга (~10 команд × 20 игроков).
    queryFn: () => api<{ players: Array<{ id: number; name: string; birthYear: number | null; position: string | null; club: string | null; photo?: string | null; rating: number | null; mp?: number }> }>(`/federation/av/players?year=${team.year}`),
    staleTime: 10 * 60_000,
  });
  const mine = useMemo(() => {
    const list = (q.data?.players ?? []).filter((p) => normTeam(p.club ?? '') === team.clubKey);
    return list.slice().sort((a, b) => ((b.rating ?? -1) - (a.rating ?? -1)) || ((b.mp ?? 0) - (a.mp ?? 0)));
  }, [q.data, team.clubKey]);
  const [all, setAll] = useState(false);
  if (q.isLoading) return <div className="fed-skeleton" style={{ height: 220 }} />;
  const list = mine.length ? mine : team.top.map((p) => ({ ...p, club: p.team }));
  const rated = list.filter((p) => (p.mp ?? 0) >= 2 && p.rating != null);
  const rest = list.filter((p) => !((p.mp ?? 0) >= 2 && p.rating != null));
  const shown = all ? list : rated;
  return (
    <>
      {shown.length === 0 && <div className="fed-note">Игроков с рейтингом пока нет.</div>}
      {shown.map((p, i) => (
        <Link key={p.id} to={`/federation/players/${p.id}`} className="fed-row hold-player hold-player--tight" style={{ textDecoration: 'none' }}>
          <span className="fed-table__num hold-player__rank">{i + 1}</span>
          <PlayerAvatar name={p.name} photoUrl={p.photo ?? null} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fed-row__name hold-ellipsis" title={p.name}>{p.name}</div>
            <div className="fed-row__meta hold-ellipsis">{p.position ?? '—'} · {p.mp ?? 0} {plMatch(p.mp ?? 0)}</div>
          </div>
          <span className="hold-player__rating" style={{ color: ratingColor(p.rating) }}>{ratingLabel(p.rating)}</span>
        </Link>
      ))}
      {rest.length > 0 && (
        <button type="button" className="fed-link hold-more" onClick={() => setAll((v) => !v)}>{all ? 'Только с рейтингом' : `Ещё ${rest.length} без рейтинга (меньше 2 матчей)`}</button>
      )}
    </>
  );
}

/** Сборная холдинга — четыре линии на условном поле. */
function Xi({ xi }: { xi: HXi[] }) {
  const empty = xi.every((l) => l.players.length === 0);
  if (empty) return <div className="fed-note">Мало данных для сборной.</div>;
  return (
    <div className="hold-pitch">
      {[...xi].reverse().map((l) => (
        <div key={l.line} className="hold-pitch__line">
          <div className="hold-pitch__line-title">{LINE_TITLE[l.line]}</div>
          <div className="hold-pitch__players">
            {l.players.map((p) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="hold-xi" title={`${p.name} · ${p.team} · ${p.position ?? ''}`}>
                <PlayerAvatar name={p.name} photoUrl={p.photo} size={44} ring />
                <span className="hold-xi__name hold-ellipsis">{p.name.split(' ').slice(-1)[0]}</span>
                <span className="hold-xi__meta hold-ellipsis">{p.birthYear ?? ''} · {p.clubLabel.replace('Царское Село-Динамо', 'Ц. Село').replace('ФК ', '')}</span>
                <span className="hold-xi__rating" style={{ color: ratingColor(p.rating) }}>{ratingLabel(p.rating)}</span>
              </Link>
            ))}
            {l.players.length === 0 && <span className="fed-row__meta">нет кандидатов</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

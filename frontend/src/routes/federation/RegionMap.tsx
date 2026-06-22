import { useQuery } from '@tanstack/react-query';
import { StatTile } from '../../components/StatTile';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Reveal } from '../../components/motion';
import { useFedYear, inDivision, type Division } from './avYear';
import './federation.css';

interface Registry {
  coaches: number | null;
  referees: number | null;
  participants: number | null;
  source: string;
  period: string;
}
interface PyramidLeague {
  league: string;
  teams: number;
  clubs: number;
  players: number;
  q1pct: number;
  q4pct: number;
  skew: number | null;
}
interface PyramidPayload {
  season: string;
  leagues: PyramidLeague[];
  totals: {
    playersDistinct: number;
    teamsTotal: number;
    clubsDistinct: number;
    matches: number;
    q1pct: number;
    q4pct: number;
  };
  capturedAt?: string | null;
}
interface RegionMapData {
  players: number;
  clubs: { total: number; paid: number; free: number };
  teams: number;
  competitions: number;
  leagues: number;
  ageGroups: string[];
  matches: number;
  goals: number;
  byAge: Array<{ ageGroup: string; teams: number; players: number }>;
  /** Пирамида лиг FFSPB (ВСЕ лиги региона) — последний месячный снимок, null если ещё нет. */
  pyramid: PyramidPayload | null;
  registry: Registry | null;
}

/**
 * Карта региона (слой №1) — перепись «что у меня есть» одним взглядом.
 * Живые счётчики из данных (футболисты/клубы/команды/соревнования/матчи/голы) +
 * кадры из административного реестра федерации (тренеры/судьи) с пометкой источника.
 */
export function FederationRegionMap() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Карта региона</h1>
          <p className="fed-sub">{federation?.region ?? federation?.name ?? 'Регион'} · детско-юношеский футбол — перепись</p>
        </div>
      </header>
      <RegionCensusBody />
    </div>
  );
}

/**
 * Тело переписи региона — KPI-тоталы пирамиды FFSPB (futboltы/клубы/команды/лиги/
 * матчи/голы) + таблица «По лигам» + «Кадры региона». Источник тоталов — pyramid.totals
 * (ВСЕ лиги региона), НЕ byAge клубов-членов (он 1-клубно разрежен). Блок «Состав
 * по возрастам» НАМЕРЕННО опущен (sparse). Самонесущее (fetch внутри), без шапки.
 */
export function RegionCensusBody() {
  const { year, division } = useFedYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'region-map'],
    queryFn: () => api<RegionMapData>('/federation/region-map'),
  });
  if (isLoading) {
    return (
      <div className="fed-kpis">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="fed-skeleton" style={{ height: 104 }} />)}
      </div>
    );
  }
  if (error) return <div className="fed-note" style={{ color: 'var(--danger)' }}>Не удалось загрузить карту региона</div>;
  if (!data) return null;
  const d = data;
  const p = d.pyramid;
  // При наличии переписи по пирамиде (ВСЕ лиги региона) счётчики предпочитают её
  // тоталы — иначе остаются числа клубов-членов (текущее поведение, fallback).
  const players = p ? p.totals.playersDistinct : d.players;
  const teams = p ? p.totals.teamsTotal : d.teams;
  const matches = p ? p.totals.matches : d.matches;
  const clubsTotal = p ? p.totals.clubsDistinct : d.clubs.total;
  const leaguesCount = p ? p.leagues.length : d.leagues;
  // Клубы пирамиды распределены по лигам — это правда для всего региона. Старое
  // «N в кабинетах · M база» — рудимент framing «клубы-члены» (для пирамиды бессмысленно).
  const clubsExtra = p
    ? `в ${plural(p.leagues.length, 'лиге', 'лигах', 'лигах')}`
    : `${d.clubs.paid} глубина · ${d.clubs.free} база`;
  const leaguesExtra = p
    ? `${plural(p.leagues.length, 'лига', 'лиги', 'лиг')} · пирамида FFSPB`
    : `${d.competitions} ${plural(d.competitions, 'возраст', 'возраста', 'возрастов')}`;

  return (
    <div className="fed-stack">
      {/* ---- Перепись: живые счётчики (пирамида FFSPB при наличии, иначе клубы-члены) ---- */}
      <Reveal variant="slide-up">
        <div className="fed-census">
          <div className="fed-census__cell">
            <StatTile label="Футболисты" value={players} accent="violet" big />
          </div>
          <div className="fed-census__cell">
            <StatTile label="Клубы" value={clubsTotal} extra={clubsExtra} accent="cyan" big />
          </div>
          <div className="fed-census__cell"><StatTile label="Команды" value={teams} accent="muted" big /></div>
          <div className="fed-census__cell">
            <StatTile label="Лиги" value={leaguesCount} extra={leaguesExtra} accent="gold" big />
          </div>
          <div className="fed-census__cell"><StatTile label="Матчи" value={matches} accent="cyan" big /></div>
        </div>
      </Reveal>

      {/* ---- По лигам: пирамида FFSPB (скрывается, если снимка ещё нет). Выбранная лига
              в верхнем фильтре — подсвечена; перепись — по всему региону (см. пометку). ---- */}
      {p && p.leagues.length > 0 && <Reveal variant="slide-up" delay={0.05}><PyramidCard p={p} division={division} /></Reveal>}

      {/* ---- Честная пометка охвата: перепись региона — все лиги и все когорты; срез по
              году рождения живёт на экранах «Таланты»/«Клубы», где данные режутся по когорте. ---- */}
      <ScopeNote year={year} division={division} hasPyramid={!!(p && p.leagues.length > 0)} />

      {/* ---- Кадры региона (реестр). «Состав по возрастам» опущен — sparse (1 клуб). ---- */}
      <Reveal variant="slide-up" delay={0.1}><RegistryCard r={d.registry} /></Reveal>
    </div>
  );
}

/**
 * Честная пометка охвата переписи: снимок region_census — по всему региону (все лиги,
 * все когорты), per-year/одно-лиговый срез в нём отсутствует. Поэтому фильтры на «Обзоре»
 * не молчат: выбранная лига подсвечивает строку «По лигам», а пометка прямо говорит, что
 * срез по возрасту применяется на экранах с когортными данными.
 */
function ScopeNote({ year, division, hasPyramid }: { year: number | null; division: Division; hasPyramid: boolean }) {
  return (
    <p className="fed-faint" style={{ fontSize: 11.5, margin: '-2px 2px 0', lineHeight: 1.55 }}>
      Перепись региона — по всем лигам и всем когортам.{' '}
      {hasPyramid ? <>Лига <b style={{ color: 'var(--accent-cyan)' }}>{division}</b> подсвечена в таблице «По лигам».</> : null}
      {year != null
        ? ` Срез по году рождения (${year}) применяется на экранах «Таланты» и «Клубы», где данные разобраны по когортам.`
        : ' Срез по году рождения доступен на экранах «Таланты» и «Клубы».'}
    </p>
  );
}

/**
 * Пирамида лиг региона (FFSPB): по каждой лиге — команды/клубы/игроки/доля Q4 и
 * перекос Q1÷Q4 с токен-баром. Чем выше лига, тем сильнее перекос к рождённым в
 * начале года (отбор по физической зрелости) — это видно одним взглядом по барам.
 * Выбранная в верхнем фильтре лига (division) подсвечивается — фильтр «делает» видимое.
 */
function PyramidCard({ p, division }: { p: PyramidPayload; division: Division }) {
  const maxSkew = Math.max(1, ...p.leagues.map((l) => l.skew ?? 0));
  const captured = p.capturedAt ? new Date(p.capturedAt).toLocaleDateString('ru-RU') : null;
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          По лигам
          <span className="fed-faint" style={{ fontWeight: 400 }}>
            сезон {p.season} · пирамида FFSPB{captured ? ` · данные с ${captured}` : ''}
          </span>
        </div>
        <div className="fed-table__scroll">
          <table className="fed-dt">
            <thead>
              <tr>
                <th>Лига</th>
                <th>Команды</th>
                <th>Клубы</th>
                <th>Игроки</th>
                <th>Q4 доля</th>
                <th style={{ minWidth: 168 }}>Перекос Q1÷Q4</th>
              </tr>
            </thead>
            <tbody>
              {p.leagues.map((l) => {
                // Подсветка строки выбранной лиги: левый акцент-рейл + усиление контраста.
                const sel = inDivision(l.league, division);
                return (
                  <tr
                    key={l.league}
                    style={sel ? {
                      background: 'color-mix(in srgb, var(--accent-cyan) 9%, transparent)',
                      boxShadow: 'inset 3px 0 0 var(--accent-cyan)',
                    } : undefined}
                  >
                    <td style={sel ? { fontWeight: 700, color: 'var(--accent-cyan)' } : undefined}>{l.league}</td>
                    <td className="fed-num">{l.teams}</td>
                    <td className="fed-num">{l.clubs}</td>
                    <td className="fed-num">{l.players}</td>
                    <td className="fed-num">{l.q4pct}%</td>
                    <td>
                      <span className="fed-skew">
                        <span className="fed-skew__track">
                          <span
                            className="fed-skew__fill"
                            style={{ width: `${l.skew != null ? Math.min(100, (l.skew / maxSkew) * 100) : 0}%` }}
                          />
                        </span>
                        <span className="fed-skew__val fed-num">{l.skew != null ? `${l.skew}×` : '—'}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fed-faint" style={{ fontSize: 11.5, margin: '12px 2px 0', lineHeight: 1.55 }}>
          Перекос Q1÷Q4 — во сколько раз больше игроков рождено в начале года (январь–март),
          чем в конце (октябрь–декабрь). Чем выше лига, тем сильнее отбор по физической зрелости.
        </p>
      </div>
    </section>
  );
}

function RegistryCard({ r }: { r: Registry | null }) {
  return (
    <section className="fed-card fed-rise">
      <div className="fed-card__pad">
        <div className="fed-card__title">
          Кадры региона
          {r && <span className="fed-faint" style={{ fontWeight: 400 }}>{r.source} · {r.period}</span>}
        </div>
        {!r ? (
          <div className="fed-note">Реестр кадров не задан для этого региона.</div>
        ) : (
          <>
            <div className="fed-kpis">
              <StatTile label="Тренеры" value={r.coaches ?? 0} accent="cyan" />
              <StatTile label="Судьи" value={r.referees ?? 0} accent="gold" />
              {r.participants != null && <StatTile label="Всего занимающихся" value={r.participants} accent="muted" />}
            </div>
            <p className="fed-faint" style={{ fontSize: 11.5, margin: '12px 2px 0', lineHeight: 1.55 }}>
              Тренеры и судьи — из административного реестра федерации (не из матчевых данных).
              Футбольный контур выше — живые счётчики из базы.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

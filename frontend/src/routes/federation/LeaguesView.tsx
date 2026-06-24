import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { useFedYear, yearQ, fedQ, inDivision, type Division } from './avYear';
import { ratingLabel, rating10Color } from './ratings';
import './federation.css';

// ── Формы ответов существующих эндпоинтов (см. StandingsBody.tsx / AvClubs.tsx) ──
interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface StandingsResp { groups: Group<StandRow>[]; source?: 'ffspb' | 'mirror'; degraded?: boolean; asOf?: string }
interface RatingsResp { groups: Group<RatingRow>[] }
// Реестр игроков региона (та же форма, что в AvPlayers.tsx). У игрока есть имя клуба
// (club), но НЕ id клуба — стыковка игрок→клуб идёт по canon(club).
interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo?: string | null; rating: number | null; mp?: number }

// Лиги, охваченные рейтингом AvanData, «в логическом порядке»: Высшая над Первой.
// Переход — между этими двумя соседними лигами.
const TOP: Division = 'Высшая';
const LOWER: Division = 'Первая';

// Звёздочка команды = игрок в топ-N своей возрастной когорты по абсолютному рейтингу.
const COHORT_TOP = 22;

// Канон-склейка названий клубов между источниками (таблица ФФСПб ↔ рейтинг AvanData):
// id совпадают (общий бэк), но если клуб попал только в один источник — стыкуем по
// нормализованному названию. Та же нормализация, что в ClubShield (ФК/СШОР/№, кавычки).
const canon = (s: string): string =>
  s.toLowerCase().replace(/[«»"'()]/g, '').replace(/\bфк\b|\bсшор\b|\bсш\b|№\s*\d+/gi, '').replace(/\s+/g, ' ').trim();

// Медиана / квартиль по массиву рейтингов (по возрастанию). q ∈ [0,1].
// Оставлен для совместимости с buildLeague (модель лиги шире, чем новые критерии).
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Единица лиги: клуб с турнирной позицией (если есть в таблице) + абсолютным
// рейтингом AvanData.
interface LeagueClub {
  id: number; name: string; logo: string | null;
  rating: number;                 // абсолютный рейтинг AvanData (методика, не нормируем)
  tableRank: number | null;       // место в таблице (1 = лидер); null — нет в таблице
  tableSize: number;              // число команд в турнирной таблице лиги
  points: number | null;
  delta: number | null;           // ratingRank − tableRank (внутри лиги): >0 перевыполняет
}

interface LeagueModel { clubs: LeagueClub[]; median: number | null; q1: number | null; q3: number | null; rated: number }

// Собираем модель одной лиги: склейка таблицы и рейтинга по id (канон-фолбэк по
// названию), место по рейтингу — СРЕДИ команд таблицы (тот же знаменатель, что у
// очков). Пороги median/Q1/Q3 — по рейтингам всех клубов лиги (для совместимости).
function buildLeague(stand: StandRow[], rated: RatingRow[]): LeagueModel {
  const ratingById = new Map<number, number>();
  const ratingByName = new Map<string, number>();
  rated.forEach((r) => { ratingById.set(r.id, r.rating); ratingByName.set(canon(r.name), r.rating); });
  const ratingOf = (id: number, name: string): number | null =>
    ratingById.has(id) ? ratingById.get(id)! : (ratingByName.get(canon(name)) ?? null);

  // Место по рейтингу среди команд таблицы (для Δ).
  const ratingRank = new Map<number, number>();
  [...stand]
    .map((r) => ({ id: r.id, rt: ratingOf(r.id, r.name) }))
    .filter((x) => x.rt != null)
    .sort((a, b) => (b.rt as number) - (a.rt as number))
    .forEach((x, i) => ratingRank.set(x.id, i + 1));

  const seen = new Set<number>();
  const clubs: LeagueClub[] = [];
  stand.forEach((r, i) => {
    const rt = ratingOf(r.id, r.name);
    if (rt == null) return;        // без рейтинга AvanData клуб в борде не участвует
    seen.add(r.id);
    const rr = ratingRank.get(r.id) ?? null;
    clubs.push({
      id: r.id, name: r.name, logo: r.logo, rating: rt,
      tableRank: i + 1, tableSize: stand.length, points: r.points,
      delta: rr != null ? rr - (i + 1) : null,
    });
  });
  // Клубы с рейтингом, но без турнирной таблицы — учитываем и показываем (место «—»),
  // чтобы лига не «теряла» команды.
  rated.forEach((r) => {
    if (seen.has(r.id)) return;
    if (clubs.some((c) => canon(c.name) === canon(r.name))) return;
    clubs.push({ id: r.id, name: r.name, logo: r.logo, rating: r.rating, tableRank: null, tableSize: stand.length, points: null, delta: null });
  });

  const vals = clubs.map((c) => c.rating).sort((a, b) => a - b);
  return { clubs, median: quantile(vals, 0.5), q1: quantile(vals, 0.25), q3: quantile(vals, 0.75), rated: clubs.length };
}

const scopeLabel = (year: number | null) => (year != null ? `${year} г.р.` : 'все возрасты');

/**
 * Совместимость со старым маршрутом: экран-обёртка вокруг тела «Управление лигами».
 * Сам контент теперь живёт блоком внизу экрана «Клубы» (ClubsView), поэтому в навигации
 * отдельной вкладки нет; экспорт сохранён на случай прямой ссылки.
 */
export function FederationLeagues() {
  const { year } = useFedYear();
  return (
    <>
      <header className="fed-hero">
        <h1 className="fed-hero__title">Управление лигами</h1>
        <p className="fed-hero__sub">
          Кого повысить, кого понизить — по данным AvanData · {scopeLabel(year)} · решение за федерацией
        </p>
      </header>
      <LeagueMgmtBody />
    </>
  );
}

// ── Зона пересечения рейтингов двух соседних лиг ──────────────────────────────
// Звезда команды: игрок, попавший в топ-22 своей возрастной когорты (по абсолютному
// рейтингу). Когорта = birthYear; гейт mp>=2; считается по всему реестру /av/players.
interface CohortStar { player: RPlayer; cohort: number; cohortRank: number }

interface CandidateClub {
  club: LeagueClub;
  margin: number;          // ↑ rating − min(Высшая);  ↓ max(Первая) − rating
  stars: CohortStar[];     // игроки клуба в топ-22 своей когорты
}

/**
 * Тело «Управление лигами» — read-only советник регулятора (ни записей, ни состояния,
 * ни аудита; решение остаётся за федерацией). Монтируется блоком внизу экрана «Клубы».
 *
 * Простой критерий зоны пересечения двух соседних лиг (Высшая над Первой):
 *  ↑ кандидат на ПОВЫШЕНИЕ — клуб Первой, чей рейтинг выше минимума Высшей
 *    (обошёл бы слабейший клуб Высшей); ранг — по запасу над min(Высшая).
 *  ↓ кандидат на ПОНИЖЕНИЕ — клуб Высшей, чей рейтинг ниже максимума Первой
 *    (его обошёл бы сильнейший клуб Первой); ранг — по провалу ниже max(Первая).
 *
 * Данные — из существующих эндпоинтов: /av/standings + /av/club-ratings (год),
 * плюс /av/players (год=null → весь реестр для расчёта когортных топ-22).
 */
export function LeagueMgmtBody() {
  const { year, division } = useFedYear();
  const q = yearQ(year);
  const st = useQuery({ queryKey: ['av', 'standings', year], queryFn: () => api<StandingsResp>(`/federation/av/standings${q}`) });
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<RatingsResp>(`/federation/av/club-ratings${q}`) });
  // Реестр игроков обеих лиг выбранной когорты (division=null → весь регион). Тот же
  // queryKey, что у AvPlayers c division=null — кэш TanStack дедуплицирует.
  const pl = useQuery({ queryKey: ['av', 'players', year, null], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, null)}`) });

  const model = useMemo(() => {
    const standOf = (d: Division) => (st.data?.groups ?? []).find((g) => inDivision(g.division, d))?.rows ?? [];
    const ratedOf = (d: Division) => (cr.data?.groups ?? []).find((g) => inDivision(g.division, d))?.rows ?? [];
    const top = buildLeague(standOf(TOP), ratedOf(TOP));
    const lower = buildLeague(standOf(LOWER), ratedOf(LOWER));

    // Граничные значения зоны пересечения.
    const topRatings = top.clubs.map((c) => c.rating);
    const lowerRatings = lower.clubs.map((c) => c.rating);
    const minTop = topRatings.length ? Math.min(...topRatings) : null;       // слабейший клуб Высшей
    const maxLower = lowerRatings.length ? Math.max(...lowerRatings) : null;  // сильнейший клуб Первой

    // Звёздочки: топ-22 каждой когорты (по абсолютному рейтингу, mp>=2) → set id игроков.
    const stars = topCohortPlayers(pl.data?.players ?? []);
    const starsByClub = starsByCanonClub(stars);

    const withStars = (c: LeagueClub): CohortStar[] => starsByClub.get(canon(c.name)) ?? [];

    // ↑ Достойны повышения: клубы Первой с рейтингом строго выше минимума Высшей.
    // Ранжируем по запасу над порогом (насколько уверенно обходят слабейший клуб Высшей).
    const promote: CandidateClub[] = minTop == null ? [] : lower.clubs
      .filter((c) => c.rating > minTop)
      .map((c) => ({ club: c, margin: c.rating - minTop, stars: withStars(c) }))
      .sort((a, b) => b.margin - a.margin);

    // ↓ Кандидаты на понижение: клубы Высшей с рейтингом строго ниже максимума Первой.
    // Ранжируем по провалу ниже порога (насколько сильнейший клуб Первой их обходит).
    const relegate: CandidateClub[] = maxLower == null ? [] : top.clubs
      .filter((c) => c.rating < maxLower)
      .map((c) => ({ club: c, margin: maxLower - c.rating, stars: withStars(c) }))
      .sort((a, b) => b.margin - a.margin);

    return { top, lower, minTop, maxLower, promote, relegate };
  }, [st.data, cr.data, pl.data]);

  const isLoading = st.isLoading || cr.isLoading;
  const noRated = !isLoading && model.top.rated === 0 && model.lower.rated === 0;
  const noBoundary = !isLoading && (model.minTop == null || model.maxLower == null);

  return (
    <section className="fed-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 className="fed-card__title">Кандидаты на переход</h2>
          <p className="fed-card__sub" style={{ margin: '4px 0 0' }}>
            Граничная зона между соседними лигами · {TOP} над {LOWER} · {scopeLabel(year)}
          </p>
        </div>
        <span className="fed-badge fed-badge--accent" title="Верхний фильтр лиги фокусирует колонку, но борд показывает обе лиги — переход межлиговый">
          фокус: {division}
        </span>
      </div>

      {isLoading ? (
        <div className="fed-skeleton" style={{ height: 300, marginTop: 20 }} />
      ) : noRated ? (
        <div className="fed-note" style={{ marginTop: 20 }}>
          Для выбранной когорты ({scopeLabel(year)}) нет клубов с рейтингом AvanData в {TOP} и {LOWER} лигах — рекомендация не строится.
        </div>
      ) : noBoundary ? (
        <div className="fed-note" style={{ marginTop: 20 }}>
          В этой когорте рейтинг есть только в одной из лиг ({TOP} / {LOWER}) — границу пересечения не на чем построить.
        </div>
      ) : (
        <>
          <BoundaryLine minTop={model.minTop} maxLower={model.maxLower} top={model.top} lower={model.lower} />

          <div className="fed-grid fed-grid--2" style={{ marginTop: 16 }}>
            {/* ↑ Достойны повышения */}
            <BoardColumn
              tone="up"
              title="Кандидаты на повышение"
              arrow="▲"
              focused={division === LOWER}
              subtitle={`Клубы ${LOWER}, обходящие по рейтингу слабейший клуб ${TOP} (${ratingLabel(model.minTop)})`}
              empty="Нет кандидатов на повышение по данным выбранной когорты"
            >
              {model.promote.map((cc) => (
                <BoardRow
                  key={`up-${cc.club.id}`}
                  cand={cc}
                  league={LOWER}
                  tone="up"
                  why={whyPromote(cc.club, model.minTop!)}
                />
              ))}
            </BoardColumn>

            {/* ↓ Кандидаты на понижение */}
            <BoardColumn
              tone="down"
              title="Кандидаты на понижение"
              arrow="▼"
              focused={division === TOP}
              subtitle={`Клубы ${TOP}, уступающие по рейтингу сильнейшему клубу ${LOWER} (${ratingLabel(model.maxLower)})`}
              empty="Нет кандидатов на понижение по данным выбранной когорты"
            >
              {model.relegate.map((cc) => (
                <BoardRow
                  key={`down-${cc.club.id}`}
                  cand={cc}
                  league={TOP}
                  tone="down"
                  why={whyRelegate(cc.club, model.maxLower!)}
                />
              ))}
            </BoardColumn>
          </div>

          <StarTeams promote={model.promote} relegate={model.relegate} />

          <p className="fed-note" style={{ marginTop: 18 }}>
            Правило — граничная зона между двумя соседними лигами ({TOP} над {LOWER}): клуб {LOWER} готов к повышению,
            если по рейтингу AvanData обходит хотя бы слабейший клуб {TOP}; клуб {TOP} — кандидат на понижение, если уступает
            хотя бы сильнейшему клубу {LOWER}. Рейтинг абсолютный (сумма рейтингов игроков, методика AvanData; не нормируем).
            «<b>Звёздочка команды</b>» — игрок в топ-{COHORT_TOP} своей возрастной когорты. Решение остаётся за федерацией.
          </p>
        </>
      )}

      {st.data?.degraded && (
        <p className="fed-note" style={{ marginTop: 12, color: 'var(--warning)' }}>
          ⚠ Турнирная таблица показана из зеркала AvanData (официальный API ФФСПб был недоступен) — возможны пропуски команд.
        </p>
      )}
    </section>
  );
}

// Полоска границ: оба граничных значения зоны пересечения + сила лиг рядом — чтобы
// вердикт «выше/ниже» читался с одного взгляда.
function BoundaryLine({ minTop, maxLower, top, lower }: { minTop: number | null; maxLower: number | null; top: LeagueModel; lower: LeagueModel }) {
  return (
    <div className="fed-grid fed-grid--2" style={{ marginTop: 20 }}>
      <div className="fed-metric">
        <div className="fed-metric__label">Слабейший клуб {TOP} — порог повышения</div>
        <div className="fed-metric__value fed-metric__value--success">{ratingLabel(minTop)}</div>
        <div className="fed-metric__extra">{top.rated} {top.rated === 1 ? 'клуб' : 'клубов'} с рейтингом</div>
      </div>
      <div className="fed-metric">
        <div className="fed-metric__label">Сильнейший клуб {LOWER} — порог понижения</div>
        <div className="fed-metric__value" style={{ color: 'var(--danger)', fontWeight: 500 }}>{ratingLabel(maxLower)}</div>
        <div className="fed-metric__extra">{lower.rated} {lower.rated === 1 ? 'клуб' : 'клубов'} с рейтингом</div>
      </div>
    </div>
  );
}

function BoardColumn({ tone, title, arrow, subtitle, empty, focused, children }: {
  tone: 'up' | 'down'; title: string; arrow: string; subtitle: string; empty: string; focused: boolean; children: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  const accent = tone === 'up' ? 'var(--success)' : 'var(--danger)';
  return (
    <div className="fed-card" style={focused ? { borderColor: 'var(--border-strong)' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span aria-hidden style={{ color: accent, fontSize: 18, lineHeight: 1.2 }}>{arrow}</span>
        <div>
          <div className="fed-card__title" style={{ marginBottom: 4 }}>{title}</div>
          <div className="fed-card__sub" style={{ marginBottom: 0 }}>{subtitle}</div>
        </div>
      </div>
      {has
        ? <div style={{ marginTop: 12 }}>{children}</div>
        : <p className="fed-note fed-note--empty">{empty}</p>}
    </div>
  );
}

function BoardRow({ cand, league, tone, why }: { cand: CandidateClub; league: Division; tone: 'up' | 'down'; why: string }) {
  const { club } = cand;
  const accent = tone === 'up' ? 'var(--success)' : 'var(--danger)';
  return (
    <div className="fed-row" style={{ alignItems: 'flex-start' }}>
      <ClubShield name={club.name} logoUrl={club.logo} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="fed-row__name" style={{ flex: 'initial' }} title={club.name}>{club.name}</span>
          <span className="fed-badge fed-badge--accent">{league}</span>
          {club.tableRank != null && (
            <span className="fed-row__meta" title="Место в турнирной таблице лиги">{club.tableRank} место</span>
          )}
          {cand.stars.length > 0 && (
            <span className="fed-badge fed-badge--success" title={`Игроков клуба в топ-${COHORT_TOP} своей возрастной когорты`}>
              {cand.stars.length} в топ-{COHORT_TOP} возраста
            </span>
          )}
        </div>
        <p className="fed-note" style={{ margin: '4px 0 0' }}>{why}</p>
      </div>
      <span className="fed-table__num" style={{ color: rating10Color(club.rating), fontWeight: 600, whiteSpace: 'nowrap' }} title="Абсолютный рейтинг клуба AvanData (сумма рейтингов игроков)">
        {ratingLabel(club.rating)}
      </span>
      <span style={{ color: accent, fontWeight: 600 }} aria-hidden>{tone === 'up' ? '▲' : '▼'}</span>
    </div>
  );
}

// Однострочное «почему» для колонки повышения (граница = минимум Высшей).
function whyPromote(c: LeagueClub, minTop: number): string {
  const place = c.tableRank != null ? `${c.tableRank}-е место в ${LOWER}` : `${LOWER} лига (вне таблицы)`;
  return `рейтинг ${ratingLabel(c.rating)} выше слабейшего клуба ${TOP} (${ratingLabel(minTop)}) — обошёл бы его; ${place}`;
}

// Однострочное «почему» для колонки понижения (граница = максимум Первой).
function whyRelegate(c: LeagueClub, maxLower: number): string {
  const place = c.tableRank != null ? `${c.tableRank}-е место из ${c.tableSize} в ${TOP}` : `${TOP} лига`;
  return `${place}, рейтинг ${ratingLabel(c.rating)} ниже сильнейшего клуба ${LOWER} (${ratingLabel(maxLower)}) — тот обошёл бы его`;
}

/* ════════════════════════════════════════════════════════════════════════════
   Звёздочки команд — игроки в топ-22 своей возрастной когорты (абсолютный рейтинг).
   Read-only; поверх реестра /av/players (тот же кэш). Когорта = birthYear, гейт mp>=2.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Топ-22 каждой возрастной когорты по абсолютному рейтингу AvanData. Когорта = birthYear
 * (игроки без года не образуют когорту и в топ не попадают). Гейт: mp>=2 и rating!=null.
 * Возвращает плоский список звёзд с местом внутри когорты.
 */
function topCohortPlayers(players: RPlayer[]): CohortStar[] {
  const byCohort = new Map<number, RPlayer[]>();
  players.forEach((p) => {
    if (p.birthYear == null || p.rating == null || (p.mp ?? 0) < 2) return;
    const arr = byCohort.get(p.birthYear);
    if (arr) arr.push(p); else byCohort.set(p.birthYear, [p]);
  });
  const out: CohortStar[] = [];
  byCohort.forEach((arr, cohort) => {
    arr
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, COHORT_TOP)
      .forEach((p, i) => out.push({ player: p, cohort, cohortRank: i + 1 }));
  });
  return out;
}

// Звёзды, сгруппированные по канон-имени клуба (стыковка игрок→клуб). Внутри клуба —
// по месту в когорте (сильнейшие сверху).
function starsByCanonClub(stars: CohortStar[]): Map<string, CohortStar[]> {
  const m = new Map<string, CohortStar[]>();
  stars.forEach((s) => {
    if (!s.player.club) return;
    const key = canon(s.player.club);
    const arr = m.get(key);
    if (arr) arr.push(s); else m.set(key, [s]);
  });
  m.forEach((arr) => arr.sort((a, b) => (b.player.rating ?? 0) - (a.player.rating ?? 0)));
  return m;
}

/**
 * «Звёздочки команд» — компактный под-список: для клубов-кандидатов (↑ и ↓) их игроки,
 * попавшие в топ-22 своей когорты, с указанием года рождения и абсолютного рейтинга.
 * Честный пустой стейт, если ни у одного кандидата нет звёздочек.
 */
function StarTeams({ promote, relegate }: { promote: CandidateClub[]; relegate: CandidateClub[] }) {
  // Уникальные клубы-кандидаты со звёздочками (по id), отсортированы по числу звёзд.
  const teams = useMemo(() => {
    const byId = new Map<number, CandidateClub>();
    [...promote, ...relegate].forEach((cc) => { if (cc.stars.length > 0 && !byId.has(cc.club.id)) byId.set(cc.club.id, cc); });
    return Array.from(byId.values()).sort((a, b) => b.stars.length - a.stars.length);
  }, [promote, relegate]);

  return (
    <>
      <div className="fed-divider">
        <h2 className="fed-divider__title">Звёздочки команд</h2>
        <div className="fed-divider__line" />
      </div>
      <p className="fed-note">
        Игроки клубов-кандидатов, попавшие в топ-{COHORT_TOP} своей возрастной когорты по абсолютному рейтингу AvanData.
      </p>
      {teams.length === 0 ? (
        <div className="fed-note" style={{ marginTop: 12 }}>
          Среди клубов-кандидатов нет игроков в топ-{COHORT_TOP} своих возрастных когорт в этой выборке.
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {teams.map((cc) => <StarTeamRow key={`stars-${cc.club.id}`} cand={cc} />)}
        </div>
      )}
    </>
  );
}

function StarTeamRow({ cand }: { cand: CandidateClub }) {
  const { club, stars } = cand;
  return (
    <div className="fed-row" style={{ alignItems: 'flex-start' }}>
      <ClubShield name={club.name} logoUrl={club.logo} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="fed-row__name" style={{ flex: 'initial' }} title={club.name}>{club.name}</span>
          <span className="fed-badge fed-badge--success" title={`Игроков клуба в топ-${COHORT_TOP} своей когорты`}>
            {stars.length} в топ-{COHORT_TOP} возраста
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {stars.map((s) => (
            <Link key={`star-${s.player.id}`} to={`/federation/players/${s.player.id}`} className="fed-row" style={{ alignItems: 'center', textDecoration: 'none', padding: 0, border: 'none' }}>
              <PlayerAvatar name={s.player.name} photoUrl={s.player.photo} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="fed-row__name" style={{ flex: 'initial' }} title={s.player.name}>{s.player.name}</span>
                  <span className="fed-row__meta" title="Возрастная когорта (год рождения)">{s.cohort} г.р.</span>
                  <span className="fed-row__meta" title={`Место в топ-${COHORT_TOP} когорты`}>№{s.cohortRank} в когорте</span>
                  {s.player.position && <span className="fed-badge fed-badge--accent">{s.player.position}</span>}
                </div>
              </div>
              <span className="fed-table__num" style={{ color: rating10Color(s.player.rating), fontWeight: 600, whiteSpace: 'nowrap' }} title="Абсолютный рейтинг игрока AvanData">
                {ratingLabel(s.player.rating)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

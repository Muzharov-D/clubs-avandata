import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { useFedYear, yearQ, inDivision, type Division } from './avYear';
import { ratingLabel, rating10Color } from './ratings';
import { plMesto } from './utils';
import './federation.css';

// ── Формы ответов существующих эндпоинтов (см. StandingsBody.tsx / AvClubs.tsx) ──
interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface StandingsResp { groups: Group<StandRow>[]; source?: 'ffspb' | 'mirror'; degraded?: boolean; asOf?: string }
interface RatingsResp { groups: Group<RatingRow>[] }

// Лиги, охваченные рейтингом AvanData. Переходы — между ними.
const TOP: Division = 'Высшая';
const LOWER: Division = 'Первая';

// Канон-склейка названий клубов между источниками (таблица ФФСПб ↔ рейтинг AvanData):
// id совпадают (общий бэк), но если клуб попал только в один источник — стыкуем по
// нормализованному названию. Та же нормализация, что в ClubShield (ФК/СШОР/№, кавычки).
const canon = (s: string): string =>
  s.toLowerCase().replace(/[«»"'()]/g, '').replace(/\bфк\b|\bсшор\b|\bсш\b|№\s*\d+/gi, '').replace(/\s+/g, ' ').trim();

// Медиана / квартиль по массиву рейтингов (по возрастанию). q ∈ [0,1].
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
// рейтингом AvanData + Δ (место по рейтингу − место в таблице, внутри своей лиги).
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
// очков), пороги median/Q1/Q3 — по рейтингам всех клубов лиги.
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
  // Клубы с рейтингом, но без турнирной таблицы — учитываем в порогах и показываем
  // (место «—»), чтобы лига не «теряла» команды.
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
 * «Управление лигами» — инструмент-советник регулятора (READ-ONLY: ни записей, ни
 * сохранённого состояния, ни аудита; решение остаётся за федерацией). Делает заслугу
 * очевидной: кто достоин повышения, а кто не тянет. Данные — из существующих
 * эндпоинтов (без новой логики на бэке): /av/standings и /av/club-ratings.
 *
 * Состоит из трёх модулей; в этой фазе реализован Модуль 1 (Δ-доска кандидатов на
 * переход). Заготовки модулей 2–3 размечены ниже.
 */
export function FederationLeagues() {
  const { year } = useFedYear();
  return (
    <>
      <header className="fed-hero">
        <h1 className="fed-hero__title">Управление лигами</h1>
        <p className="fed-hero__sub">
          Кто достоин выше, кого понизить — по данным AvanData · решение за федерацией
        </p>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────
          МОДУЛЬ 1 — «Кандидаты на переход» (Δ-доска). Реализован полностью.
          ────────────────────────────────────────────────────────────────────── */}
      <PromotionBoard />

      {/* ──────────────────────────────────────────────────────────────────────
          МОДУЛЬ 2 — «Сравнение команд» (заготовка, подключается следующим этапом).
          Здесь: выбор двух клубов из любой из лиг и стыковка их составов/рейтинга/
          результата бок о бок (fed-grid fed-grid--2, две fed-card-колонки). Слот ниже.
          ────────────────────────────────────────────────────────────────────── */}
      {/* <TeamComparison /> */}

      {/* ──────────────────────────────────────────────────────────────────────
          МОДУЛЬ 3 — «Сборные» (лига × возраст + регион × возраст), заготовка.
          Здесь: символическая сборная лиги/региона по позициям для выбранной
          когорты (поле «сборной» по позициям). Слот ниже.
          ────────────────────────────────────────────────────────────────────── */}
      {/* <BestSquads /> */}
    </>
  );
}

/**
 * Модуль 1 — Δ-доска кандидатов на переход. Две лиги вместе (переход по своей
 * природе межлиговый: повышение из Первой ↔ понижение из Высшей), поэтому борд
 * НЕ режется одним дивизионом — год (когорта) применяется. Верхний DivisionFilter
 * фокусирует/подсвечивает лигу, но не прячет вторую колонку.
 */
function PromotionBoard() {
  const { year, division } = useFedYear();
  const q = yearQ(year);
  const st = useQuery({ queryKey: ['av', 'standings', year], queryFn: () => api<StandingsResp>(`/federation/av/standings${q}`) });
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<RatingsResp>(`/federation/av/club-ratings${q}`) });

  const model = useMemo(() => {
    const standOf = (d: Division) => (st.data?.groups ?? []).find((g) => inDivision(g.division, d))?.rows ?? [];
    const ratedOf = (d: Division) => (cr.data?.groups ?? []).find((g) => inDivision(g.division, d))?.rows ?? [];
    const top = buildLeague(standOf(TOP), ratedOf(TOP));
    const lower = buildLeague(standOf(LOWER), ratedOf(LOWER));

    // Порог повышения — медиана Высшей: по силе состава клуб Первой принадлежит этажом выше.
    const promoteThreshold = top.median;
    // «Топ Первой» — верхний квартиль Первой: ориентир, ниже которого слабый клуб Высшей.
    const lowerTopBand = lower.q3;

    // ↑ Достойны повышения: клубы Первой с рейтингом ≥ медианы Высшей. Ранжируем по
    // запасу над порогом (насколько уверенно тянут на этаж выше).
    const promote = promoteThreshold == null ? [] : lower.clubs
      .filter((c) => c.rating >= promoteThreshold)
      .map((c) => ({ club: c, margin: c.rating - promoteThreshold }))
      .sort((a, b) => b.margin - a.margin);

    // ↓ Кандидаты на понижение: клубы Высшей, у кого рейтинг ≤ топ-банда Первой И кто
    // в нижней части таблицы Высшей (и сила, и результат говорят за этаж вниз).
    // Глубина = насколько ниже половины таблицы; ранжируем по сумме «провала».
    const topRankedCount = top.clubs.filter((c) => c.tableRank != null).length;
    const relegate = lowerTopBand == null ? [] : top.clubs
      .filter((c) => c.tableRank != null && c.rating <= lowerTopBand && c.tableRank > topRankedCount / 2)
      .map((c) => ({ club: c, gap: lowerTopBand - c.rating, depth: (c.tableRank as number) }))
      .sort((a, b) => (b.depth - a.depth) || (a.gap - b.gap));

    return { top, lower, promoteThreshold, lowerTopBand, promote, relegate };
  }, [st.data, cr.data]);

  const isLoading = st.isLoading || cr.isLoading;
  const noRated = !isLoading && model.top.rated === 0 && model.lower.rated === 0;

  return (
    <section className="fed-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 className="fed-card__title">Кандидаты на переход</h2>
          <p className="fed-card__sub" style={{ margin: '4px 0 0' }}>
            По силе состава (рейтинг AvanData) против лиги и места в таблице · {TOP} ↔ {LOWER} · {scopeLabel(year)}
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
      ) : (
        <>
          <ThresholdLine promote={model.promoteThreshold} topBand={model.lowerTopBand} top={model.top} lower={model.lower} />

          <div className="fed-grid fed-grid--2" style={{ marginTop: 16 }}>
            {/* ↑ Достойны повышения */}
            <BoardColumn
              tone="up"
              title="Достойны повышения"
              arrow="▲"
              focused={division === LOWER}
              subtitle={model.promoteThreshold != null
                ? `Клубы ${LOWER} лиги с рейтингом не ниже медианы ${TOP} (${ratingLabel(model.promoteThreshold)})`
                : `Недостаточно рейтингов ${TOP} лиги для порога`}
              empty={`Ни один клуб ${LOWER} лиги не дотягивает до медианы ${TOP} в этой когорте.`}
            >
              {model.promote.map(({ club, margin }) => (
                <BoardRow
                  key={`up-${club.id}`}
                  club={club}
                  league={LOWER}
                  tone="up"
                  why={whyPromote(club, model.promoteThreshold!, margin)}
                />
              ))}
            </BoardColumn>

            {/* ↓ Кандидаты на понижение */}
            <BoardColumn
              tone="down"
              title="Кандидаты на понижение"
              arrow="▼"
              focused={division === TOP}
              subtitle={model.lowerTopBand != null
                ? `Клубы ${TOP} лиги слабее топ-банда ${LOWER} (${ratingLabel(model.lowerTopBand)}) и в нижней части таблицы`
                : `Недостаточно рейтингов ${LOWER} лиги для порога`}
              empty={`В ${TOP} лиге нет клубов, у кого и сила, и результат указывают на этаж вниз.`}
            >
              {model.relegate.map(({ club }) => (
                <BoardRow
                  key={`down-${club.id}`}
                  club={club}
                  league={TOP}
                  tone="down"
                  why={whyRelegate(club, model.lowerTopBand!)}
                />
              ))}
            </BoardColumn>
          </div>

          <p className="fed-note" style={{ marginTop: 18 }}>
            Рекомендация на данных AvanData (рейтинг — сумма абсолютных рейтингов игроков, методика продукта; не нормируем).
            Порог повышения — медиана рейтинга {TOP} лиги; ориентир понижения — верхний квартиль {LOWER} лиги.
            <b> Δ</b> у строки — место по рейтингу против места в таблице:&nbsp;
            <span className="fed-badge fed-badge--success">▲</span> перевыполняет,&nbsp;
            <span className="fed-badge fed-badge--danger">▼</span> недовыполняет.
            Решение о переходе остаётся за федерацией.
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

// Полоска порогов: показывает оба ориентира (медиана Высшей / топ-банд Первой) и
// силу лиг рядом — чтобы вердикт «выше/ниже» читался с одного взгляда.
function ThresholdLine({ promote, topBand, top, lower }: { promote: number | null; topBand: number | null; top: LeagueModel; lower: LeagueModel }) {
  return (
    <div className="fed-grid fed-grid--2" style={{ marginTop: 20 }}>
      <div className="fed-metric">
        <div className="fed-metric__label">Медиана {TOP} — порог повышения</div>
        <div className="fed-metric__value fed-metric__value--success">{ratingLabel(promote)}</div>
        <div className="fed-metric__extra">{top.rated} {top.rated === 1 ? 'клуб' : 'клубов'} с рейтингом</div>
      </div>
      <div className="fed-metric">
        <div className="fed-metric__label">Топ-банд {LOWER} — ориентир понижения</div>
        <div className="fed-metric__value" style={{ color: 'var(--danger)', fontWeight: 500 }}>{ratingLabel(topBand)}</div>
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
        : <div className="fed-note" style={{ marginTop: 12 }}>{empty}</div>}
    </div>
  );
}

function BoardRow({ club, league, tone, why }: { club: LeagueClub; league: Division; tone: 'up' | 'down'; why: string }) {
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
          <DeltaChip delta={club.delta} />
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

// Δ-чип внутри лиги (то же определение, что в StandingsBody): на сколько мест клуб
// выше/ниже своего рейтинга. >0 перевыполняет, <0 недовыполняет.
function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="fed-table__muted" title="Нет места в турнирной таблице">Δ —</span>;
  if (delta === 0) return <span className="fed-table__muted" title="Ровно на уровне своего рейтинга">Δ 0</span>;
  const up = delta > 0, n = Math.abs(delta);
  return (
    <span className={up ? 'fed-badge fed-badge--success' : 'fed-badge fed-badge--danger'}
      title={up ? `Выше своего рейтинга на ${n} ${plMesto(n)} — перевыполняет` : `Ниже своего рейтинга на ${n} ${plMesto(n)} — недовыполняет`}>
      Δ {up ? '▲' : '▼'}{n}
    </span>
  );
}

// Однострочное «почему» для колонки повышения.
function whyPromote(c: LeagueClub, threshold: number, margin: number): string {
  const place = c.tableRank != null ? `в ${LOWER} ${c.tableRank}-е место` : `в ${LOWER} лиге (вне таблицы)`;
  const overshoot = Math.round((margin / Math.max(threshold, 1)) * 100);
  return `рейтинг ${ratingLabel(c.rating)} — на ${overshoot}% выше медианы ${TOP} (${ratingLabel(threshold)}); ${place}`;
}

// Однострочное «почему» для колонки понижения.
function whyRelegate(c: LeagueClub, topBand: number): string {
  const place = c.tableRank != null ? `${c.tableRank}-е место из ${c.tableSize} в ${TOP}` : `${TOP} лига`;
  return `${place}, рейтинг ${ratingLabel(c.rating)} — ниже топ-банда ${LOWER} (${ratingLabel(topBand)})`;
}

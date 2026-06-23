import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { FedError, FedEmpty } from './FedState';
import { useFedYear, fedQ } from './avYear';
import { lineOf, type Line } from './utils';
import './federation.css';

// ── Формы ответов существующих эндпоинтов (см. AvPlayers.tsx / BestXiView.tsx) ──
interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo?: string | null; rating: number | null; mp?: number }
type XiLine = 'GK' | 'DEF' | 'MID' | 'FWD';
interface XiPlayer { id: number; name: string; club: string | null; clubLogo: string | null; photo: string | null; line: XiLine; position: string | null; rating: number | null; mp: number; pct: number }
interface Cohort { year: number; ratedCount: number; clubs: number; xi: XiPlayer[] }

// Канон-склейка названий клубов — та же нормализация, что в StandingsBody/LeaguesView
// (ФК/СШОР/№, кавычки), чтобы «ФК Зенит» и «Зенит» не расходились в две школы.
const canon = (s: string): string =>
  s.toLowerCase().replace(/[«»"'()]/g, '').replace(/\bфк\b|\bсшор\b|\bсш\b|№\s*\d+/gi, '').replace(/\s+/g, ' ').trim();

// Производный расширенный состав когорты: 2 ВРТ / 8 ЗАЩ / 6 ПЗ / 6 НАП = 22, отбор по
// абсолютному рейтингу внутри линии (амплуа — через lineOf по реестру игроков).
const SQUAD22: Record<Line, number> = { GK: 2, DEF: 8, MID: 6, FWD: 6 };
const SQUAD22_TOTAL = 22;

// Агрегат «клуб → сколько игроков попало», отсортированный по количеству (desc).
interface ClubTally { club: string; logo: string | null; n: number }
function tallyByClub(rows: Array<{ club: string | null; clubLogo?: string | null }>): ClubTally[] {
  const by = new Map<string, ClubTally>();
  rows.forEach((r) => {
    if (!r.club) return;
    const key = canon(r.club);
    const cur = by.get(key);
    if (cur) cur.n += 1;
    else by.set(key, { club: r.club, logo: r.clubLogo ?? null, n: 1 });
  });
  return Array.from(by.values()).sort((a, b) => b.n - a.n);
}

const plPlayer = (n: number): string => {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return 'игроков';
  if (b === 1) return 'игрок';
  if (b >= 2 && b <= 4) return 'игрока';
  return 'игроков';
};

/**
 * «Качество игроков» — заменяет «Производство × результат» на экране «Клубы».
 * Year-aware, только существующие эндпоинты (рейтинги АБСОЛЮТНЫЕ, не нормируем):
 *
 *  • Год = «Все» — сколько игроков клуба в топ-100 ВСЕХ игроков города: реестр
 *    /av/players (без года), гейт mp≥2, сорт по рейтингу desc, топ-100, склейка по
 *    канон-клубу; клубы ранжируются по количеству.
 *  • Год = конкретный — сколько игроков клуба в основную сборную (11) + в
 *    расширенный состав (22). Сборная-11 — из /av/best-xi (cohorts[year].xi, только
 *    2009–2013). Расширенный-22 — ПРОИЗВОДНЫЙ из /av/players?year=: 2 ВРТ / 8 ЗАЩ /
 *    6 ПЗ / 6 НАП по рейтингу. Для года вне 2009–2013 сборная честно не считается.
 */
export function QualityBody() {
  const { year } = useFedYear();
  return year == null ? <QualityTop100 /> : <QualitySquad year={year} />;
}

// ── Год = «Все»: клубы по числу игроков в топ-100 города ──────────────────────
function QualityTop100() {
  // Весь регион без года/дивизиона (тот же ключ-семейство, что и AvPlayers «Все»).
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'players', null, null],
    queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(null, null)}`),
  });
  const players = data?.players ?? [];

  const tally = useMemo<ClubTally[]>(() => {
    // Гейт mp≥2 (рейтинг = среднее по матчам, не пик), сорт по абсолютному рейтингу,
    // топ-100 игроков города → группируем по канон-клубу, ранжируем по количеству.
    const top = players
      .filter((p) => p.rating != null && (p.mp ?? 0) >= 2)
      .sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
      .slice(0, 100);
    return tallyByClub(top);
  }, [players]);

  const maxN = useMemo(() => Math.max(1, ...tally.map((c) => c.n)), [tally]);

  return (
    <>
      {error && <FedError />}
      <section className="fed-card">
        <h2 className="fed-card__title">Качество игроков</h2>
        <p className="fed-card__sub">Сколько игроков клуба в топ-100 города · по рейтингу AvanData · все возрасты</p>
        {isLoading ? (
          <div className="fed-skeleton" style={{ height: 280 }} />
        ) : tally.length === 0 ? (
          <FedEmpty>Недостаточно разобранных игроков (не менее 2 матчей) для построения топ-100 города.</FedEmpty>
        ) : (
          <>
            {tally.slice(0, 12).map((c, i) => (
              <div key={canon(c.club)} className="fed-row">
                <span className="fed-table__num" style={{ width: 28, textAlign: 'right', color: i < 3 ? 'var(--accent)' : 'var(--text-secondary)' }}>{i + 1}</span>
                <ClubShield name={c.club} logoUrl={c.logo} size={26} />
                <span className="fed-row__name" title={c.club}>{c.club}</span>
                <div className="fed-track" style={{ flex: 1 }}>
                  <div className="fed-fill" style={{ width: `${(c.n / maxN) * 100}%` }} />
                </div>
                <span className="fed-table__num" style={{ width: 56, textAlign: 'right' }} title="игроков клуба в топ-100 города">{c.n}</span>
              </div>
            ))}
            {tally.length > 12 && <p className="fed-note">Отображены 12 клубов из {tally.length}.</p>}
            <p className="fed-note" style={{ marginTop: 12 }}>
              Пул — топ-100 игроков города по абсолютному рейтингу AvanData (не менее 2 разобранных матчей). Команды объединены в школы по названию клуба. Число у строки — <b>игроков клуба в топ-100 города</b>.
            </p>
          </>
        )}
      </section>
    </>
  );
}

// ── Год = конкретный: основная сборная (11) + расширенный состав (22) ─────────
function QualitySquad({ year }: { year: number }) {
  // Сборная-11 — из best-xi (общий ответ по когортам 2009–2013; берём нужный год).
  const bx = useQuery({ queryKey: ['av', 'best-xi'], queryFn: () => api<{ cohorts: Cohort[] }>('/federation/av/best-xi') });
  // Реестр игроков выбранной когорты (весь регион) — для производного расширенного-22.
  const pl = useQuery({ queryKey: ['av', 'players', year, null], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, null)}`) });

  const cohort = useMemo(() => (bx.data?.cohorts ?? []).find((c) => c.year === year) ?? null, [bx.data, year]);

  // Сборная-11: из cohort.xi (=11), склейка по канон-клубу.
  const xiTally = useMemo<ClubTally[]>(() => {
    if (!cohort) return [];
    return tallyByClub(cohort.xi.map((p) => ({ club: p.club, clubLogo: p.clubLogo })));
  }, [cohort]);

  // Расширенный-22 (производный): амплуа по lineOf, топ по рейтингу внутри линии
  // (2 ВРТ / 8 ЗАЩ / 6 ПЗ / 6 НАП), затем склейка по канон-клубу.
  const squad22 = useMemo<RPlayer[]>(() => {
    const players = pl.data?.players ?? [];
    const byLine: Record<Line, RPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    players.forEach((p) => {
      if (p.rating == null || (p.mp ?? 0) < 2 || !p.club) return;
      const l = lineOf(p.position);
      if (l) byLine[l].push(p);
    });
    const out: RPlayer[] = [];
    (Object.keys(SQUAD22) as Line[]).forEach((l) => {
      out.push(...byLine[l].slice().sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity)).slice(0, SQUAD22[l]));
    });
    return out;
  }, [pl.data]);

  const sqTally = useMemo<ClubTally[]>(() => tallyByClub(squad22.map((p) => ({ club: p.club, clubLogo: p.clubLogo }))), [squad22]);

  const isLoading = bx.isLoading || pl.isLoading;
  const error = bx.error || pl.error;
  // best-xi считается только для 2009–2013 — для прочих лет сборную не фабрикуем.
  const noCohort = !bx.isLoading && !cohort;

  return (
    <>
      {error && <FedError />}
      <section className="fed-card">
        <h2 className="fed-card__title">Качество игроков</h2>
        <p className="fed-card__sub">Сколько игроков клуба попало в сборную · {year} г.р. · по рейтингу AvanData</p>

        {isLoading ? (
          <div className="fed-skeleton" style={{ height: 280 }} />
        ) : (
          <>
            {/* Основная сборная (11) — из best-xi; только 2009–2013. */}
            <div className="fed-divider" style={{ marginTop: 8 }}>
              <h3 className="fed-divider__title" style={{ fontSize: 15 }}>Основная сборная (11)</h3>
              <div className="fed-divider__line" />
            </div>
            {noCohort ? (
              <p className="fed-note">Сборная для этого года не считается — основная сборная региона строится только для когорт 2009–2013.</p>
            ) : xiTally.length === 0 ? (
              <FedEmpty>Недостаточно разобранных игроков для формирования основной сборной {year} г.р.</FedEmpty>
            ) : (
              <SquadTally rows={xiTally} unit="в сборной (11)" />
            )}

            {/* Расширенный состав (22) — производный из реестра игроков когорты. */}
            <div className="fed-divider">
              <h3 className="fed-divider__title" style={{ fontSize: 15 }}>Расширенный 22 (производный)</h3>
              <div className="fed-divider__line" />
            </div>
            {sqTally.length === 0 ? (
              <FedEmpty>Недостаточно разобранных игроков (не менее 2 матчей) для расширенного состава {year} г.р.</FedEmpty>
            ) : (
              <SquadTally rows={sqTally} unit="в расширенном 22" />
            )}

            <p className="fed-note" style={{ marginTop: 16 }}>
              <b>Основная сборная (11)</b> — лучшая XI когорты по рейтингу AvanData (источник — сборная региона, только 2009–2013). <b>Расширенный 22 (производный)</b> — 2 вратаря, 8 защитников, 6 полузащитников, 6 нападающих, отобранные по абсолютному рейтингу внутри линии из реестра игроков когорты ({squad22.length} из {SQUAD22_TOTAL}). Рейтинги абсолютные, не нормируем.
            </p>
          </>
        )}
      </section>
    </>
  );
}

// Список «клуб → сколько игроков» с дорожкой-заполнением (как в «Кто производит талант»).
function SquadTally({ rows, unit }: { rows: ClubTally[]; unit: string }) {
  const maxN = Math.max(1, ...rows.map((c) => c.n));
  return (
    <>
      {rows.map((c, i) => (
        <div key={canon(c.club)} className="fed-row">
          <span className="fed-table__num" style={{ width: 28, textAlign: 'right', color: i < 3 ? 'var(--accent)' : 'var(--text-secondary)' }}>{i + 1}</span>
          <ClubShield name={c.club} logoUrl={c.logo} size={24} />
          <span className="fed-row__name" title={c.club}>{c.club}</span>
          <div className="fed-track" style={{ flex: 1 }}>
            <div className="fed-fill" style={{ width: `${(c.n / maxN) * 100}%` }} />
          </div>
          <span className="fed-table__num" style={{ width: 90, textAlign: 'right' }} title={`${c.n} ${plPlayer(c.n)} ${unit}`}>{c.n} {plPlayer(c.n)}</span>
        </div>
      ))}
    </>
  );
}

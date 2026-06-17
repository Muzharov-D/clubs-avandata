import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { FedError } from './FedState';
import { useFedYear, yearQ } from './avYear';
import './avandata.css';

interface Overview { divisions: string[]; tournaments: number; teams: number; players: number; matches: number; analyzed: number; goals: number }
interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface ResultMatch { id: number; age: string; division: string; date: string; home: { name: string; logo: string | null; score: number | null }; away: { name: string; logo: string | null; score: number | null } }
interface AgeEffect { total: number; q1pct: number; q4pct: number; skew: number | null }

const num = (n: number) => n.toLocaleString('ru-RU');
const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
const fmtDate = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '').toUpperCase(); } catch { return ''; } };

// --- Значимые матчи: джойн результата с рейтингом клуба по нормализованному имени ---
type SigTone = 'clash' | 'upset' | 'rout';
interface KeyMatch extends ResultMatch { sig: number; tone: SigTone | null; label: string }
const SIG_ICON: Record<SigTone, string> = { clash: '⚔️', upset: '🔥', rout: '💥' };
// «ФК Зенит 2013» / «Алмаз-Антей» → единый ключ для матчинга result↔rating
const normClub = (name: string): string => name.toLowerCase()
  .replace(/[«»"']/g, '')
  .replace(/^фк\s+/, '')            // «Автово» = «ФК Автово» (СШОР/СШ не трогаем — иначе Зенит-коллизия)
  .replace(/\s*\d{4}\s*$/, '')      // срезаем год команды
  .replace(/[-–—]/g, ' ')           // дефисы → пробел (Алмаз-Антей = Алмаз Антей)
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Состояние региона — главный, операционный экран: пульс Первенства, что только
 * что сыграли, и кто наверху таблиц/рейтинга. Первое, что открывает функционер.
 */
export function FederationAvHome() {
  const { year } = useFedYear();
  const q = yearQ(year);
  const ov = useQuery({ queryKey: ['av', 'overview'], queryFn: () => api<Overview>('/federation/av/overview') });
  const rs = useQuery({ queryKey: ['av', 'results', year], queryFn: () => api<{ results: ResultMatch[] }>(`/federation/av/results${q}`) });
  const st = useQuery({ queryKey: ['av', 'standings', year], queryFn: () => api<{ groups: Group<StandRow>[] }>(`/federation/av/standings${q}`) });
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });
  const ag = useQuery({ queryKey: ['av', 'age', year], queryFn: () => api<AgeEffect>(`/federation/av/age-effect${q}`) });
  const d = ov.data;
  const results = rs.data?.results ?? [];
  const skew = ag.data?.skew ?? null;

  // Рейтинг + ранг клуба по нормализованному имени (знаменатель, который есть только у федерации).
  const clubInfo = useMemo(() => {
    const rows = (cr.data?.groups ?? []).flatMap((g) => g.rows);
    const sorted = [...rows].sort((a, b) => b.rating - a.rating);
    const map = new Map<string, { rating: number; rank: number }>();
    sorted.forEach((r, i) => { const k = normClub(r.name); if (!map.has(k)) map.set(k, { rating: r.rating, rank: i + 1 }); });
    return { map, total: sorted.length };
  }, [cr.data]);

  // Значимые матчи: курируем по сигналам, а не валим всё подряд.
  const keyMatches = useMemo(() => {
    const { map, total } = clubInfo;
    const topN = Math.max(4, Math.round(total * 0.25)); // верхняя четверть = «лидеры»
    const scored: KeyMatch[] = results.map((m) => {
      const hs = m.home.score ?? 0, as = m.away.score ?? 0;
      const margin = Math.abs(hs - as);
      const H = map.get(normClub(m.home.name));
      const A = map.get(normClub(m.away.name));
      const decided = hs !== as;
      const winner = hs > as ? H : A;
      const loser = hs > as ? A : H;
      const leaderRank = Math.max(topN, Math.round(total * 0.4)); // «лидер» = верхние ~40%
      let sig = margin, tone: SigTone | null = null, label = '';
      if (decided && winner && loser && winner.rating < loser.rating && loser.rank <= leaderRank) {
        sig = 2000 + (loser.rating - winner.rating); tone = 'upset'; label = 'Сенсация'; // ниже рейтингом обыграл лидера
      } else if (H && A && H.rank <= topN && A.rank <= topN) {
        sig = 1000 + 1000 / (H.rank + A.rank); tone = 'clash'; label = 'Битва лидеров';
      } else if (margin >= 6) {
        sig = 200 + margin; tone = 'rout'; label = 'Разгром';
      }
      return { ...m, sig, tone, label };
    });
    const key = scored.filter((x) => x.label).sort((a, b) => b.sig - a.sig).slice(0, 8);
    // фолбэк: если значимых нет (нет рейтингов) — просто свежие, без ярлыков
    return key.length ? key : scored.slice(0, 8);
  }, [results, clubInfo]);

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Состояние региона</h1>
          <p className="av-sub">Первенство СПб · сезон 2026</p>
        </div>
        <Link to="/federation/cohorts" className="av-link">Регион по когортам →</Link>
      </header>

      {ov.error && <FedError />}

      {/* Сигнал федерации — что требует внимания прямо сейчас (маршрутизатор внимания) */}
      {skew != null && skew >= 1.3 && (
        <div className="av-signal av-rise">
          <span className="av-signal__icon">⚠️</span>
          <span className="av-signal__txt">Требует внимания: <b>возрастная утечка</b> — в начале года отобрано в <b>{skew}×</b> больше игроков, чем в конце. Регион тихо теряет поздно-рождённых.</span>
          <Link to="/federation/fairness" className="av-link av-signal__cta">Разобрать →</Link>
        </div>
      )}

      {/* Пульс региона */}
      {ov.isLoading ? <div className="av-skeleton av-rise" style={{ height: 110 }} /> : d && (
        <div className="av-pulse av-rise">
          <Stat label="Игроки в реестре" value={d.players} tone="cyan" />
          <Stat label="Команды" value={d.teams} tone="blue" extra={`${d.tournaments} турниров`} />
          <Stat label="Матчи" value={d.matches} tone="violet" extra={`${num(d.analyzed)} разобрано`} />
          <Stat label="Голы" value={d.goals} tone="success" />
          <Stat label="Дивизионы" value={d.divisions.length} tone="magenta" />
        </div>
      )}

      {/* Значимые матчи — курируем по значимости, а не валим лентой все 24 */}
      <section className="av-rise">
        <div className="av-section">
          <h2 className="av-section-title">Значимые матчи</h2>
          {keyMatches.length > 0 && results.length > keyMatches.length && (
            <span className="av-section-sub" style={{ margin: 0 }}>битвы лидеров · сенсации · разгромы — из {results.length} сыгранных</span>
          )}
        </div>
        {rs.isLoading ? <div className="av-skeleton" style={{ height: 140 }} /> : keyMatches.length === 0 ? (
          <div className="av-surface av-pad av-note">Нет сыгранных матчей по выбранному фильтру.</div>
        ) : (
          <div className="av-fixtures">
            {keyMatches.map((m) => <Fixture key={m.id} m={m} />)}
          </div>
        )}
      </section>

      {/* Таблицы + рейтинг клубов */}
      <div className="av-cols-main av-rise">
        <section className="av-surface av-pad-lg">
          <div className="av-section"><h2 className="av-section-title">Турнирные таблицы · Наградион</h2></div>
          {st.isLoading ? <Sk /> : (st.data?.groups ?? []).length === 0 ? <div className="av-note">Нет данных.</div> : (st.data?.groups ?? []).map((g) => <StandingsBlock key={g.division} g={g} />)}
        </section>
        <section className="av-surface av-pad-lg">
          <div className="av-section"><h2 className="av-section-title">Рейтинг клубов · AvanData</h2></div>
          {cr.isLoading ? <Sk /> : (cr.data?.groups ?? []).length === 0 ? <div className="av-note">Нет данных.</div> : (cr.data?.groups ?? []).map((g) => <RatingsBlock key={g.division} g={g} />)}
        </section>
      </div>
    </>
  );
}

const Sk = () => <div className="av-skeleton" style={{ height: 240 }} />;

function Stat({ label, value, extra, tone }: { label: string; value: number; extra?: string; tone: 'cyan' | 'blue' | 'magenta' | 'success' | 'violet' }) {
  return (
    <div className={`av-surface av-stat av-stat--${tone}`}>
      <div className="av-stat__label">{label}</div>
      <div className="av-stat__value">{num(value)}</div>
      {extra && <div className="av-stat__extra">{extra}</div>}
    </div>
  );
}

function Fixture({ m }: { m: KeyMatch }) {
  const hs = m.home.score ?? 0, as = m.away.score ?? 0;
  return (
    <div className={`av-fixture${m.tone ? ` av-fixture--${m.tone}` : ''}`}>
      <div className="av-fixture__top">
        {m.tone
          ? <span className={`av-sigtag av-sigtag--${m.tone}`}>{SIG_ICON[m.tone]} {m.label}</span>
          : <span className="av-fixture__age">{m.age} · {m.division}</span>}
        <span className="av-fixture__date">{fmtDate(m.date)}</span>
      </div>
      <div className="av-fixture__body">
        <span className="av-fixture__team">
          <ClubShield name={m.home.name} logoUrl={m.home.logo} size={34} />
          <span className="av-fixture__team-name" title={m.home.name}>{m.home.name}</span>
        </span>
        <span className="av-fixture__score">
          <b className={hs >= as ? 'av-fixture__score-w' : 'av-fixture__score-l'}>{hs}</b>
          <span className="av-fixture__sep">:</span>
          <b className={as >= hs ? 'av-fixture__score-w' : 'av-fixture__score-l'}>{as}</b>
        </span>
        <span className="av-fixture__team">
          <ClubShield name={m.away.name} logoUrl={m.away.logo} size={34} />
          <span className="av-fixture__team-name" title={m.away.name}>{m.away.name}</span>
        </span>
      </div>
      {m.tone && <div className="av-fixture__foot">{m.age} · {m.division}</div>}
    </div>
  );
}

const rankCls = (i: number) => `av-trow__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`;

function StandingsBlock({ g }: { g: Group<StandRow> }) {
  return (
    <div className="av-group">
      <div className="av-group__head">
        <span className="av-group__name">{g.division}</span>
        <span className="av-group__cols av-six"><span>И</span><span>В</span><span>Н</span><span>П</span><span>±</span><span>ОЧ</span></span>
      </div>
      {g.rows.map((r, i) => (
        <div key={r.id} className={`av-trow t-stand${i === 0 ? ' av-trow--lead' : ''}`}>
          <span className={rankCls(i)}>{i + 1}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={22} />
          <span className="av-trow__name" title={r.name}>{r.name}</span>
          <span className="av-trow__stats av-six">
            <span className="av-dim">{r.played}</span><span>{r.won}</span><span>{r.drawn}</span><span>{r.lost}</span>
            <span className={r.goalDiff > 0 ? 'av-pos' : r.goalDiff < 0 ? 'av-neg' : 'av-dim'}>{pm(r.goalDiff)}</span>
            <span className="av-trow__pts">{r.points}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RatingsBlock({ g }: { g: Group<RatingRow> }) {
  const max = Math.max(...g.rows.map((r) => Math.abs(r.rating)), 1);
  return (
    <div className="av-group">
      <div className="av-group__head">
        <span className="av-group__name">{g.division}</span>
        <span className="av-group__cols">Рейтинг</span>
      </div>
      {g.rows.map((r, i) => (
        <div key={r.id} className={`av-trow t-rate${i === 0 ? ' av-trow--lead' : ''}`}>
          <span className={rankCls(i)}>{i + 1}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={22} />
          <span className="av-trow__name" title={r.name}>{r.name}</span>
          <span className="av-meter"><span className="av-meter__fill" style={{ width: `${(Math.abs(r.rating) / max) * 100}%`, background: r.rating < 0 ? 'var(--av-danger)' : 'var(--av-cyan)' }} /></span>
          <span className={`av-rate${r.rating < 0 ? ' av-rate--neg' : ''}`}>{num(r.rating)}</span>
        </div>
      ))}
    </div>
  );
}

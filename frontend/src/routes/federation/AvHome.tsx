import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError } from './FedState';
import { MatchDetail, type MatchBase } from './MatchDetail';
import { ratingColor } from './ratings';
import { useFedYear, yearQ, fedQ, inDivision } from './avYear';
import './avandata.css';

interface Overview { divisions: string[]; tournaments: number; teams: number; players: number; matches: number; analyzed: number; goals: number }
interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
interface ResultTeam { name: string; logo: string | null; score: number | null; rating: number | null; rank: number | null }
interface ResultMatch { id: number; age: string; division: string; date: string; divTeams: number; home: ResultTeam; away: ResultTeam }
interface AgeEffect { total: number; q1pct: number; q4pct: number; skew: number | null }
interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; rating: number | null }

const num = (n: number) => n.toLocaleString('ru-RU');
const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
const fmtDate = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '').toUpperCase(); } catch { return ''; } };
// склонение «место»: 1 место · 2–4 места · 5+ мест (с учётом 11–14)
const plMesto = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'мест'; if (b === 1) return 'место'; if (b >= 2 && b <= 4) return 'места'; return 'мест'; };

// --- Значимые матчи: значимость на УРОВНЕ КОМАНДЫ (рейтинг+ранг в дивизионе с бэка) ---
type SigTone = 'clash' | 'upset' | 'rout';
interface KeyMatch extends ResultMatch { sig: number; tone: SigTone | null; label: string; why: string }

/**
 * Состояние региона — главный, операционный экран: пульс Первенства, что только
 * что сыграли, и кто наверху таблиц/рейтинга. Первое, что открывает функционер.
 */
const toBase = (m: ResultMatch): MatchBase => ({
  id: m.id, age: m.age, division: m.division, date: m.date,
  home: { name: m.home.name, logo: m.home.logo, score: m.home.score },
  away: { name: m.away.name, logo: m.away.logo, score: m.away.score },
});

export function FederationAvHome() {
  const { year, division } = useFedYear();
  const q = yearQ(year);
  const [selected, setSelected] = useState<ResultMatch | null>(null);
  const ov = useQuery({ queryKey: ['av', 'overview', division], queryFn: () => api<Overview>(`/federation/av/overview${fedQ(null, division)}`) });
  const rs = useQuery({ queryKey: ['av', 'results', year, division], queryFn: () => api<{ results: ResultMatch[] }>(`/federation/av/results${fedQ(year, division)}`) });
  const st = useQuery({ queryKey: ['av', 'standings', year], queryFn: () => api<{ groups: Group<StandRow>[] }>(`/federation/av/standings${q}`) });
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });
  const ag = useQuery({ queryKey: ['av', 'age', year], queryFn: () => api<AgeEffect>(`/federation/av/age-effect${q}`) });
  const pl = useQuery({ queryKey: ['av', 'players', year, division], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, division)}`) });
  const d = ov.data;
  const results = rs.data?.results ?? [];
  const stGroups = (st.data?.groups ?? []).filter((g) => inDivision(g.division, division));
  const crGroups = (cr.data?.groups ?? []).filter((g) => inDivision(g.division, division));
  const skew = ag.data?.skew ?? null;
  const topPlayers = (pl.data?.players ?? []).filter((p) => p.rating != null).slice(0, 8);

  // Значимые матчи. Сенсация (правило владельца): победил слабейший, и соперник
  // был ВДВОЕ выше рейтингом ИЛИ на ≥4 места выше в таблице дивизиона.
  const keyMatches = useMemo(() => {
    const scored: KeyMatch[] = results.map((m) => {
      const hs = m.home.score ?? 0, as = m.away.score ?? 0, margin = Math.abs(hs - as), decided = hs !== as;
      const divTeams = m.divTeams || 0, homeWon = hs > as;
      const wRank = homeWon ? m.home.rank : m.away.rank, lRank = homeWon ? m.away.rank : m.home.rank;
      const wRat = homeWon ? m.home.rating : m.away.rating, lRat = homeWon ? m.away.rating : m.home.rating;
      const rankGap = wRank != null && lRank != null ? wRank - lRank : null; // >0 = победитель НИЖЕ в таблице
      const ratio = wRat != null && lRat != null && wRat > 0 ? lRat / wRat : null; // >1 = соперник сильнее
      const bigRank = rankGap != null && rankGap >= 4;
      const bigRating = ratio != null && ratio >= 2;
      const topRank = Math.max(3, Math.round(divTeams * 0.25));
      let sig = 0, tone: SigTone | null = null, label = '', why = '';
      if (decided && (bigRank || bigRating)) {
        tone = 'upset'; label = 'Сенсация';
        sig = 3000 + (bigRank ? rankGap! * 60 : 0) + (bigRating ? Math.round(ratio! * 100) : 0);
        const parts: string[] = [];
        if (bigRank) parts.push(`на ${rankGap} ${plMesto(rankGap!)} выше (#${lRank} в дивизионе)`);
        if (bigRating) parts.push(`рейтинг ×${ratio!.toFixed(1)}`);
        why = `обыграл соперника ${parts.join(' · ')}`;
      } else if (m.home.rating != null && m.away.rating != null && (m.home.rank ?? 99) <= topRank && (m.away.rank ?? 99) <= topRank) {
        tone = 'clash'; label = 'Битва лидеров';
        sig = 2000 + 1000 / ((m.home.rank ?? 1) + (m.away.rank ?? 1));
        why = `#${m.home.rank} против #${m.away.rank} дивизиона`;
      } else if (margin >= 9) {
        tone = 'rout'; label = 'Разгром'; sig = 1000 + margin; why = ''; // счёт говорит сам, без тупого «+N»
      }
      return { ...m, sig, tone, label, why };
    });
    return scored.filter((x) => x.tone).sort((a, b) => b.sig - a.sig).slice(0, 8);
  }, [results]);

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Обзор региона</h1>
          <p className="av-sub">Первенство СПб · сезон 2026</p>
        </div>
        <Link to="/federation/cohorts" className="av-link">Возрастные группы →</Link>
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
          <Stat label="Команды" value={d.teams} tone="blue" />
          <Stat label="Матчи" value={d.matches} tone="violet" />
          <Stat label="Голы" value={d.goals} tone="success" />
          <Stat label="Турниры" value={d.tournaments} tone="magenta" />
        </div>
      )}

      {/* Лучшие игроки региона — кто наши лучшие (вопрос №1 федерации) */}
      <section className="av-rise">
        <div className="av-section">
          <h2 className="av-section-title">Лучшие игроки региона</h2>
          <Link to="/federation/players" className="av-link">Все игроки →</Link>
        </div>
        {pl.isLoading ? <div className="av-skeleton" style={{ height: 140 }} /> : topPlayers.length === 0 ? (
          <div className="av-surface av-pad av-note">Нет игроков с рейтингом по фильтру.</div>
        ) : (
          <div className="av-leaders">
            {topPlayers.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="av-surface-soft av-leader">
                <span className={`av-leader__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`}>{i + 1}</span>
                <PlayerAvatar name={p.name} size={40} />
                <div className="av-leader__id">
                  <div className="av-leader__name">{p.name}</div>
                  <div className="av-leader__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                </div>
                <span className="av-leader__rate" style={{ color: ratingColor(p.rating) }}>{p.rating ?? '—'}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Значимые матчи — курируем по значимости, а не валим лентой все 24 */}
      <section className="av-rise">
        <div className="av-section">
          <h2 className="av-section-title">Ключевые матчи тура</h2>
          {keyMatches.length > 0 && results.length > keyMatches.length && (
            <span className="av-section-sub" style={{ margin: 0 }}>по разрыву в таблице, рейтинге и счёту · из {results.length} сыгранных</span>
          )}
        </div>
        {rs.isLoading ? <div className="av-skeleton" style={{ height: 140 }} />
          : results.length === 0 ? <div className="av-surface av-pad av-note">Нет сыгранных матчей по выбранному фильтру.</div>
          : keyMatches.length === 0 ? <div className="av-surface av-pad av-note">Ярких матчей по фильтру пока нет — результаты предсказуемы.</div>
          : <div className="av-fixtures">{keyMatches.map((m) => <Fixture key={m.id} m={m} onOpen={setSelected} />)}</div>}
      </section>

      {/* Таблицы + рейтинг клубов */}
      <div className="av-cols-main av-rise">
        <section className="av-surface av-pad-lg">
          <div className="av-section"><h2 className="av-section-title">Турнирные таблицы</h2></div>
          {st.isLoading ? <Sk /> : stGroups.length === 0 ? <div className="av-note">Нет данных.</div> : stGroups.map((g) => <StandingsBlock key={g.division} g={g} />)}
        </section>
        <section className="av-surface av-pad-lg">
          <div className="av-section"><h2 className="av-section-title">Рейтинг клубов</h2></div>
          {cr.isLoading ? <Sk /> : crGroups.length === 0 ? <div className="av-note">Нет данных.</div> : crGroups.map((g) => <RatingsBlock key={g.division} g={g} />)}
        </section>
      </div>

      {selected && <MatchDetail base={toBase(selected)} onClose={() => setSelected(null)} />}
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

function Fixture({ m, onOpen }: { m: KeyMatch; onOpen: (m: KeyMatch) => void }) {
  const hs = m.home.score ?? 0, as = m.away.score ?? 0;
  return (
    <button type="button" className={`av-fixture av-fixture--link${m.tone ? ` av-fixture--${m.tone}` : ''}`} onClick={() => onOpen(m)}>
      <div className="av-fixture__top">
        {m.tone
          ? <span className={`av-sigtag av-sigtag--${m.tone}`}>{m.label}</span>
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
      {m.tone && <div className="av-fixture__foot">{m.why || `${m.age} · ${m.division}`}</div>}
    </button>
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

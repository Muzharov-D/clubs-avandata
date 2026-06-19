import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError } from './FedState';
import { MatchDetail, type MatchBase } from './MatchDetail';
import { ClubCard } from './ClubCard';
import { ratingColor } from './ratings';
import { useFedYear, yearQ, fedQ, inDivision } from './avYear';
import './avandata.css';

interface Overview { divisions: string[]; tournaments: number; teams: number; players: number; matches: number; analyzed: number; goals: number }
interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
// Ответ /av/standings с провенансом: какой источник реально отдал таблицу и когда —
// чтобы честно показать «официальные ФФСПб» / «зеркало, может быть неполным».
interface StandingsResp { groups: Group<StandRow>[]; source?: 'ffspb' | 'mirror'; degraded?: boolean; asOf?: string }
// Строка единой таблицы: турнирная статистика + рейтинг AvanData + Δ (перевыполнение).
// Статы nullable: команда может быть в рейтинге, но ещё не в турнирной таблице
// (ranked=false) — её всё равно показываем, чтобы не «пропадала».
interface CombRow {
  id: number; name: string; logo: string | null;
  played: number | null; won: number | null; drawn: number | null; lost: number | null; goalDiff: number | null; points: number | null;
  rating: number | null; delta: number | null; ranked: boolean;
}
interface CombGroup { division: string; rows: CombRow[] }
interface ResultTeam { name: string; logo: string | null; score: number | null; rating: number | null; rank: number | null }
interface ResultMatch { id: number; age: string; division: string; date: string; divTeams: number; home: ResultTeam; away: ResultTeam }
interface AgeEffect { total: number; q1pct: number; q4pct: number; skew: number | null }
interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo?: string | null; rating: number | null; mp?: number }
// «За неделю» — дайджест радара: что требует внимания сейчас + что изменилось за неделю.
interface WAttention { year: number; kind: 'under' | 'degraded' | 'monopoly' | 'rae'; team: string | null; teamId: number | null; division: string | null; pos: number | null; ratingRank: number | null; delta: number | null; note: string }
interface WMover { year: number; kind: 'pos' | 'rating' | 'new' | 'gone'; team: string; from: number | null; to: number | null; note: string }
interface Weekly { baseline: boolean; cohortsWithHistory: number; snapshots: number; since: string | null; attention: WAttention[]; movers: WMover[] }

const num = (n: number) => n.toLocaleString('ru-RU');
const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
// «Александр Суслов» → «Суслов А.» — фамилия (идентификатор) не теряется при обрезке
const shortName = (s: string) => { const w = s.trim().split(/\s+/); return w.length > 1 ? `${w[w.length - 1]} ${w[0][0]}.` : s; };
const fmtDate = (iso: string) => { try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '').toUpperCase(); } catch { return ''; } };
// Дата+время выборки для бейджа свежести: «18 июн 14:32»
const fmtStamp = (iso?: string) => { if (!iso) return ''; try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch { return ''; } };
// склонение «место»: 1 место · 2–4 места · 5+ мест (с учётом 11–14)
const plMesto = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'мест'; if (b === 1) return 'место'; if (b >= 2 && b <= 4) return 'места'; return 'мест'; };
// склонение «матч»: 1 матч · 2–4 матча · 5+ матчей
const plMatch = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };
const plChange = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'изменений'; if (b === 1) return 'изменение'; if (b >= 2 && b <= 4) return 'изменения'; return 'изменений'; };

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
  const [selectedClub, setSelectedClub] = useState<number | null>(null);
  const ov = useQuery({ queryKey: ['av', 'overview', year, division], queryFn: () => api<Overview>(`/federation/av/overview${fedQ(year, division)}`) });
  const rs = useQuery({ queryKey: ['av', 'results', year, division], queryFn: () => api<{ results: ResultMatch[] }>(`/federation/av/results${fedQ(year, division)}`) });
  const st = useQuery({ queryKey: ['av', 'standings', year], queryFn: () => api<StandingsResp>(`/federation/av/standings${q}`) });
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });
  const ag = useQuery({ queryKey: ['av', 'age', year], queryFn: () => api<AgeEffect>(`/federation/av/age-effect${q}`) });
  const pl = useQuery({ queryKey: ['av', 'players', year, division], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, division)}`) });
  // «За неделю» — региональный дайджест (по всем когортам, фильтры не применяются — это передняя дверь).
  const wk = useQuery({ queryKey: ['av', 'weekly'], queryFn: () => api<Weekly>('/federation/av/weekly') });
  const d = ov.data;
  const results = rs.data?.results ?? [];
  // Единая таблица выбранной лиги: турнирная позиция + рейтинг AvanData + Δ.
  // Δ = место по рейтингу − место в таблице: >0 клуб ВЫШЕ своего рейтинга
  // (перевыполняет), <0 НИЖЕ (недовыполняет). Тоггл «Лига» фильтрует таблицу —
  // вся главная теперь согласованно подчиняется фильтрам (пульс/матчи/лучшие/таблица).
  const combined = useMemo<CombGroup | null>(() => {
    const sg = (st.data?.groups ?? []).find((g) => inDivision(g.division, division));
    const cg = (cr.data?.groups ?? []).find((g) => inDivision(g.division, division));
    if (!sg && !cg) return null;
    const standRows = sg?.rows ?? [];
    const rVal = new Map<number, number>();
    (cg?.rows ?? []).forEach((r) => rVal.set(r.id, r.rating));
    // Место по рейтингу считаем СРЕДИ команд таблицы — тот же знаменатель, что и
    // место по очкам, иначе Δ врёт, когда в рейтинге есть «лишняя» команда.
    const ratingRank = new Map<number, number>();
    [...standRows].sort((a, b) => (rVal.get(b.id) ?? -Infinity) - (rVal.get(a.id) ?? -Infinity))
      .forEach((r, i) => { if (rVal.has(r.id)) ratingRank.set(r.id, i + 1); });
    const ranked: CombRow[] = standRows.map((r, i) => {
      const rr = ratingRank.get(r.id);
      return { id: r.id, name: r.name, logo: r.logo, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalDiff: r.goalDiff, points: r.points, rating: rVal.has(r.id) ? rVal.get(r.id)! : null, delta: rr != null ? rr - (i + 1) : null, ranked: true };
    });
    // Команды с рейтингом, но ещё без турнирной таблицы — показываем отдельно (не теряем).
    const inStand = new Set(standRows.map((r) => r.id));
    const extra: CombRow[] = (cg?.rows ?? []).filter((r) => !inStand.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, logo: r.logo, played: null, won: null, drawn: null, lost: null, goalDiff: null, points: null, rating: r.rating, delta: null, ranked: false }));
    return { division: (sg ?? cg)!.division, rows: [...ranked, ...extra] };
  }, [st.data, cr.data, division]);
  const skew = ag.data?.skew ?? null;
  // Лучшие — по СРЕДНЕМУ рейтингу, минимум 2 оценённых матча (без one-match-wonder).
  const topPlayers = (pl.data?.players ?? []).filter((p) => p.rating != null && (p.mp ?? 0) >= 2).slice(0, 8);

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
        <div className="av-head__r">
          <button type="button" className="av-print-btn" onClick={() => window.print()} title="Сохранить отчёт в PDF (печать)">⎙ Печать · PDF</button>
          <Link to="/federation/cohorts" className="av-link">Возрастные группы →</Link>
        </div>
      </header>

      {/* Печатная шапка отчёта — видна ТОЛЬКО в PDF/печати */}
      <div className="av-print-only av-print-head">
        <b>Кабинет федерации · Первенство СПб · сезон 2026</b>
        <span>Обзор региона · {division} лига · {year != null ? `${year} г.р.` : 'все возрасты'}</span>
        <span>Отчёт сформирован {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      {ov.error && <FedError />}

      {/* За неделю — передняя дверь недельного радара: что требует внимания + динамика */}
      {wk.data && <WeeklyRadar data={wk.data} onClub={setSelectedClub} />}

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
                <PlayerAvatar name={p.name} photoUrl={p.photo} size={40} />
                <div className="av-leader__id">
                  <div className="av-leader__name" title={p.name}>{shortName(p.name)}</div>
                  <div className="av-leader__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                </div>
                <span className="av-leader__rate" style={{ color: ratingColor(p.rating) }} title={p.mp ? `Средний рейтинг за ${p.mp} ${plMatch(p.mp)}` : undefined}>{p.rating ?? '—'}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Значимые матчи — курируем по значимости, а не валим лентой все 24 */}
      <section className="av-rise">
        <div className="av-section">
          <h2 className="av-section-title">Ключевые матчи</h2>
          {keyMatches.length > 0 && results.length > keyMatches.length && (
            <span className="av-section-sub" style={{ margin: 0 }}>самые значимые из {results.length} сыгранных · по разрыву в таблице, рейтинге и счёту</span>
          )}
        </div>
        {rs.isLoading ? <div className="av-skeleton" style={{ height: 140 }} />
          : results.length === 0 ? <div className="av-surface av-pad av-note">Нет сыгранных матчей по выбранному фильтру.</div>
          : keyMatches.length === 0 ? <div className="av-surface av-pad av-note">Ярких матчей по фильтру пока нет — результаты предсказуемы.</div>
          : <div className="av-fixtures">{keyMatches.map((m) => <Fixture key={m.id} m={m} onOpen={setSelected} />)}</div>}
      </section>

      {/* Единая турнирная таблица выбранной лиги — позиция + рейтинг AvanData + Δ (перевыполнение) */}
      <section className="av-surface av-pad-lg av-rise">
        <div className="av-section">
          <div>
            <h2 className="av-section-title">Турнирная таблица</h2>
            <p className="av-section-sub" style={{ margin: '2px 0 0' }}>
              {year == null
                ? 'Свод по всем годам рождения — суммарно по когортам, не единое первенство'
                : 'Позиция в первенстве против рейтинга AvanData — кто перевыполняет'}
            </p>
          </div>
          <span className="av-divtag">{division} лига</span>
        </div>
        {st.data && <DataBadge source={st.data.source} degraded={st.data.degraded} asOf={st.data.asOf} />}
        {st.isLoading || cr.isLoading ? <Sk />
          : !combined || combined.rows.length === 0 ? <div className="av-note">Нет данных по выбранному фильтру.</div>
          : <CombinedTable g={combined} onClub={setSelectedClub} />}
      </section>

      {selected && <MatchDetail base={toBase(selected)} onClose={() => setSelected(null)} />}
      {selectedClub != null && <ClubCard clubId={selectedClub} onClose={() => setSelectedClub(null)} />}
    </>
  );
}

const Sk = () => <div className="av-skeleton" style={{ height: 240 }} />;

// «За неделю» — передняя дверь недельного радара. attention (недовыполнение/зеркало) работает
// с первого среза; movers (динамика за неделю) появляются, когда накопится 2 снимка.
const moverIcon = (k: WMover['kind']) => (k === 'new' ? '＋' : k === 'gone' ? '－' : k === 'rating' ? '◆' : '↕');
const attIcon = (k: WAttention['kind']) => (k === 'under' ? '▼' : k === 'monopoly' ? '⬡' : k === 'rae' ? '⏳' : '⚠');
function WeeklyRadar({ data, onClub }: { data: Weekly; onClub: (id: number) => void }) {
  const { attention, movers, baseline, since, snapshots } = data;
  const stamp = since ? fmtStamp(since) : '';
  if (attention.length === 0 && movers.length === 0) {
    return (
      <section className="av-weekly av-rise">
        <div className="av-section"><h2 className="av-section-title">За неделю</h2></div>
        <div className="av-surface av-pad av-note">Тревог нет — клубы держат уровень своего рейтинга.{stamp ? ` Срез ${stamp}.` : ''}</div>
      </section>
    );
  }
  return (
    <section className="av-weekly av-rise">
      <div className="av-section">
        <div>
          <h2 className="av-section-title">За неделю — что требует внимания</h2>
          <p className="av-section-sub" style={{ margin: '2px 0 0' }}>
            {baseline ? 'базовый срез снят' : `${movers.length} ${plChange(movers.length)} за неделю`}{stamp ? ` · ${stamp}` : ''}{baseline ? ' · динамика — со следующего среза' : ''}
          </p>
        </div>
        <span className="av-divtag">{snapshots} сним.</span>
      </div>
      <div className="av-weekly__grid">
        {attention.map((a, i) => (
          <button type="button" key={`a${i}`} className={`av-watch av-watch--${a.kind}`} onClick={() => a.teamId && onClub(a.teamId)} disabled={!a.teamId}>
            <span className="av-watch__year">{a.year}</span>
            <span className="av-watch__icon">{attIcon(a.kind)}</span>
            <span className="av-watch__body">
              <span className="av-watch__team" title={a.team ?? undefined}>{a.team ?? `Когорта ${a.year}`}</span>
              <span className="av-watch__note">{a.note}</span>
            </span>
            {a.delta != null && <span className="av-watch__delta">{a.delta}</span>}
          </button>
        ))}
        {movers.map((m, i) => (
          <div key={`m${i}`} className="av-watch av-watch--mover">
            <span className="av-watch__year">{m.year}</span>
            <span className="av-watch__icon">{moverIcon(m.kind)}</span>
            <span className="av-watch__body">
              <span className="av-watch__team" title={m.team}>{m.team}</span>
              <span className="av-watch__note">{m.note}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

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

// Бейдж провенанса данных: честно говорит, ОТКУДА таблица и КОГДА снята. Молчаливый
// фолбэк на зеркало (бывает неполным) теперь виден, а не прячется.
function DataBadge({ source, degraded, asOf }: { source?: 'ffspb' | 'mirror'; degraded?: boolean; asOf?: string }) {
  if (!source) return null;
  const stamp = fmtStamp(asOf);
  const cfg = degraded
    ? { cls: 'av-dbadge--warn', icon: '⚠', text: 'Зеркало AvanData — данные могут быть неполными', tip: 'Официальный API ФФСПб был недоступен — показано зеркало, в нём бывают пропуски команд.' }
    : source === 'ffspb'
      ? { cls: 'av-dbadge--ok', icon: '●', text: 'Официальные данные ФФСПб', tip: 'Турнирная таблица получена напрямую из официального API ФФСПб.' }
      : { cls: 'av-dbadge--muted', icon: '●', text: 'Свод AvanData по когортам', tip: 'Агрегат по всем годам рождения из базы AvanData.' };
  return (
    <div className={`av-dbadge ${cfg.cls}`} title={cfg.tip}>
      <span className="av-dbadge__dot">{cfg.icon}</span>
      <span>{cfg.text}</span>
      {stamp && <span className="av-dbadge__stamp">· обновлено {stamp}</span>}
    </div>
  );
}

const rankCls = (i: number) => `av-trow__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`;

function CombinedTable({ g, onClub }: { g: CombGroup; onClub: (id: number) => void }) {
  return (
    <div className="av-ctable">
      <div className="av-trow t-comb av-trow--cols">
        <span /><span />
        <span className="av-colh av-colh--l">Команда</span>
        <span className="av-trow__stats av-six"><span>И</span><span>В</span><span>Н</span><span>П</span><span>±</span><span>ОЧ</span></span>
        <span className="av-colh">Рейтинг</span>
        <span className="av-colh av-colh--c">Δ</span>
      </div>
      {g.rows.map((r, i) => (
        <button type="button" key={r.id} onClick={() => onClub(r.id)} className={`av-trow t-comb av-trow--btn${i === 0 && r.ranked ? ' av-trow--lead' : ''}${r.ranked ? '' : ' av-trow--ghost'}`}>
          <span className={r.ranked ? rankCls(i) : 'av-trow__rank'} title={r.ranked ? undefined : 'Есть рейтинг, но ещё нет в турнирной таблице'}>{r.ranked ? i + 1 : '—'}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={22} />
          <span className="av-trow__name" title={r.name}>{r.name}</span>
          <span className="av-trow__stats av-six">
            <span className="av-dim">{r.played ?? '—'}</span><span>{r.won ?? '—'}</span><span>{r.drawn ?? '—'}</span><span>{r.lost ?? '—'}</span>
            <span className={r.goalDiff == null ? 'av-dim' : r.goalDiff > 0 ? 'av-pos' : r.goalDiff < 0 ? 'av-neg' : 'av-dim'}>{r.goalDiff == null ? '—' : pm(r.goalDiff)}</span>
            <span className="av-trow__pts">{r.points ?? '—'}</span>
          </span>
          <span className={`av-crate${r.rating != null && r.rating < 0 ? ' av-crate--neg' : ''}`}>{r.rating != null ? num(r.rating) : '—'}</span>
          <DeltaChip delta={r.delta} />
        </button>
      ))}
      <p className="av-table-legend">
        <b>Рейтинг</b> — клубный рейтинг AvanData (сумма рейтингов игроков).&ensp;<b>Δ</b> — место в таблице против места по рейтингу:&nbsp;
        <span className="av-delta av-delta--up av-delta--inline">▲</span> перевыполняет,&nbsp;
        <span className="av-delta av-delta--down av-delta--inline">▼</span> недовыполняет относительно своего рейтинга.&ensp;Строки с «—» — есть рейтинг, но пока нет матчей в таблице.
      </p>
    </div>
  );
}

// Δ-чип: на сколько мест команда выше (перевыполняет) / ниже (недовыполняет) своего рейтинга.
function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="av-delta av-delta--zero">—</span>;
  if (delta === 0) return <span className="av-delta av-delta--zero" title="Ровно на уровне своего рейтинга">0</span>;
  const up = delta > 0, n = Math.abs(delta);
  return (
    <span className={`av-delta ${up ? 'av-delta--up' : 'av-delta--down'}`}
      title={up ? `Выше своего рейтинга на ${n} ${plMesto(n)} — перевыполняет` : `Ниже своего рейтинга на ${n} ${plMesto(n)} — недовыполняет`}>
      {up ? '▲' : '▼'}{n}
    </span>
  );
}

import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { FedError } from '../federation/FedState';
import { PlayerAvatar } from '../federation/PlayerAvatar';
import { AnimatedNumber, SplitText, StaggerList } from '../../components/motion';
import type { ComponentType } from 'react';
// Компоненты профиля Легируса (.jsx): типы пропсов из JS не выводятся — задаём явно.
import PizzaChartJs from '../../components/PizzaChart';
import PlayerTrendCardJs from '../../components/PlayerTrendCard';
import PlayerFormCardJs from '../../components/analytics/PlayerFormCard';
type Props = Record<string, unknown>;
const PizzaChart = PizzaChartJs as unknown as ComponentType<Props>;
const PlayerTrendCard = PlayerTrendCardJs as unknown as ComponentType<Props>;
const PlayerFormCard = PlayerFormCardJs as unknown as ComponentType<Props>;
import '../../components/analytics/PlayerDnaCard.css';
import '../../components/analytics/analytics.css';
import { useHoldingAnalytics, useSlugQuery, shortClub, num, LINE_TITLE, type LeaguePlayer, type PlayerMetricsVsLeague, type MetricGroup } from './api';
import { PlayerMetricsTable, MetricName } from './parts';
import { PlayerNotes } from './Notes';
import { PlayerPositions } from './Positions';
import { HdLoading } from './HoldingShell';
import { useNavQuery } from './scope';

/** Ответ /holding/players/:id/season — профиль как в Легирусе, против сверстников региона. */
interface SeasonSlice { key: string; name: string; short: string; description: string; group: MetricGroup; polarity: 1 | -1; value: number | null; ratio: boolean; pct: number | null }
interface SeasonMatch { matchId: number; minutes: number; overall: number | null; attack: number | null; defence: number | null; date: string | null; opponent: string | null; score: string | null; result: 'W' | 'D' | 'L' | null }
interface Season {
  playerId: number; name: string; photo: string | null; birthDate: string | null; position: string | null; club: string | null; teamKey: string | null; division: string | null;
  year: number; line: 'GK' | 'DEF' | 'MID' | 'FWD' | null; matchLen: number; group: string | null; groupTitle: string | null; peersWord: string; minutes: number; matches: number; goals: number;
  index: number | null; indexPct: number | null; rank: number | null; peers: number; inPool: boolean; lowSample?: boolean;
  archetype: { name: string; tagline: string }; superline: string | null;
  strengths: Array<{ key: string; name: string; description: string; pct: number }>;
  growth: Array<{ key: string; name: string; description: string; pct: number }>;
  roles: Array<{ name: string; score: number }>;
  slices: SeasonSlice[]; series: SeasonMatch[]; text: string;
  league: LeaguePlayer | null;
}
const PIZZA_GROUP: Record<MetricGroup, 'attack' | 'defence' | 'fitness'> = { finishing: 'attack', creation: 'attack', possession: 'fitness', defence: 'defence', errors: 'defence', goalkeeping: 'defence' };
const bucket = (p: number) => (p >= 80 ? 'hi' : p >= 60 ? 'good' : p >= 40 ? 'neutral' : p >= 20 ? 'mid' : 'low');
const fmtVal = (s: SeasonSlice) => (s.value == null ? '—' : s.ratio ? `${Math.round(s.value)}%` : s.value >= 10 ? s.value.toFixed(0) : s.value.toFixed(1));
const plural = (n: number, a: string, b: string, c: string) => { const x = n % 100, y = x % 10; if (x >= 11 && x <= 14) return c; if (y === 1) return a; if (y >= 2 && y <= 4) return b; return c; };

/**
 * Профиль игрока в кабинете холдинга — на компонентах профиля Легируса: ДНК, индекс
 * сезона, сильные стороны и зоны роста, пицца, динамика, форма, ролевой профиль,
 * абзац-вывод. Сравнение — со сверстниками его позиции по всему региону.
 */
export function HoldingPlayerPage() {
  const { id = '' } = useParams();
  const slugQ = useSlugQuery();
  const q = useNavQuery();
  const an = useHoldingAnalytics();
  const season = useQuery({
    queryKey: ['holding', 'season', id, slugQ],
    queryFn: () => api<Season | { status: 'warming' }>(`/holding/players/${encodeURIComponent(id)}/season${slugQ}`),
    refetchInterval: (s) => (s.state.data && 'status' in s.state.data ? 10_000 : false),
    refetchIntervalInBackground: true,
  });
  // Все показатели против амплуа — полная таблица внизу.
  const full = useQuery({
    queryKey: ['/holding', 'player', id],
    queryFn: () => api<{ vsLeague: PlayerMetricsVsLeague | null; vsLeagueStatus: 'ready' | 'warming' }>(`/holding/players/${encodeURIComponent(id)}${slugQ}`),
    refetchInterval: (s) => (s.state.data?.vsLeagueStatus === 'warming' ? 20_000 : false),
  });

  if (season.error) return <FedError subject="Профиль игрока" />;
  const s = season.data && !('status' in season.data) ? season.data : null;
  if (!s) return <HdLoading title="Готовим профиль игрока" text="Считаем минуты на поле и показатели за полный матч против всех сверстников его позиции в регионе." />;

  const a = an.data;
  const flags: string[] = [];
  if (a && s.league) {
    const pid = s.league.id;
    if (a.youth.ready.some((x) => x.id === pid)) flags.push('готов в молодёжную команду');
    else if (a.youth.watch.some((x) => x.id === pid)) flags.push('кандидат в молодёжную команду');
    if (a.promote.some((x) => x.id === pid)) flags.push('уровень Высшей лиги — кандидат в ФК Динамо');
    const older = a.olderAge.find((x) => x.id === pid);
    if (older) flags.push(`готов играть за ${older.olderTeamName}`);
    if (a.risk.some((x) => x.id === pid)) flags.push('ниже медианы Первой лиги своего возраста');
  }
  const peers = s.peersWord;
  const peersShort = s.peersWord.replace(/\s+\d{4} г\.р\. региона$/, '');
  const ringPct = s.index != null ? Math.min(100, s.index * 10) : 0;
  const slices = s.slices.filter((x) => x.pct != null).map((x) => ({ axis: x.short, value: x.pct as number, group: PIZZA_GROUP[x.group], displayValue: fmtVal(x) }));
  const pctRows = s.slices.filter((x) => x.pct != null).sort((x, y) => (y.pct as number) - (x.pct as number));
  const half = Math.min(5, Math.floor(pctRows.length / 2));
  const trend = s.series.filter((m) => m.overall != null).map((m) => ({ matchId: m.matchId, overall: m.overall ?? 0, attack: m.attack ?? 0, defence: m.defence ?? 0, result: m.result ?? '', opponent: m.opponent ?? '', score: m.score ?? '' }));
  const cols: Array<[string, 'pos' | 'neg', SeasonSlice[]]> = [['Сильнее всего', 'pos', pctRows.slice(0, half)], ['Слабее всего', 'neg', pctRows.slice(pctRows.length - half).reverse()]];

  return (
    <div className="hd-player">
      <div className="hd-player__bar">
        <Link to={`/holding/players${q}`} className="hd-link">← Игроки холдинга</Link>
        <span style={{ flex: 1 }} />
        <Link to={`/holding/players/${s.playerId}/card${q}`} className="hd-btn hd-btn--primary">Карточка для совета</Link>
        <Link to={`/holding/compare?a=${s.playerId}${q ? '&' + q.slice(1) : ''}`} className="hd-btn">Сравнить</Link>
      </div>

      {/* ДНК игрока — та же карточка, что в профиле Легируса */}
      <div className="dna-card dna-card--hero">
        <div className="dna-card__glow" aria-hidden />
        <div className="dna-card__photo"><PlayerAvatar name={s.name} photoUrl={s.photo} size={120} /></div>
        <div className="dna-card__head">
          <div className="dna-card__head-main">
            <div className="dna-card__eyebrow">ДНК игрока</div>
            <div className="dna-card__identity">{s.groupTitle ?? (s.line ? LINE_TITLE[s.line] : s.position ?? '—')} · {s.club ? shortClub(s.club) : '—'} {s.year}{s.division ? ` · ${s.division}` : ''}</div>
            <h1 className="dna-card__archetype"><SplitText text={s.name} /></h1>
            <div className="dna-card__tagline"><b>{s.archetype.name}</b> — {s.archetype.tagline}</div>
            <div className="dna-card__stats-inline">{s.matches} {plural(s.matches, 'матч', 'матча', 'матчей')} · {s.minutes} {plural(s.minutes, 'минута', 'минуты', 'минут')} на поле{s.goals ? ` · ${s.goals} ${plural(s.goals, 'гол', 'гола', 'голов')}` : ''}</div>
            {s.superline && <div className="dna-card__superline">{s.superline}</div>}
          </div>
          {s.index != null && (
            <div className="dna-card__rating">
              <div className="dna-card__rating-ring">
                <svg className="dna-card__rating-svg" viewBox="0 0 120 120" aria-hidden>
                  <defs><linearGradient id="dna-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" className="dna-ring-grad-a" /><stop offset="100%" className="dna-ring-grad-b" /></linearGradient></defs>
                  <circle className="dna-ring-track" cx="60" cy="60" r="52" />
                  <circle className="dna-ring-prog" cx="60" cy="60" r="52" style={{ strokeDasharray: `${(ringPct / 100) * 326.7} 999` }} />
                </svg>
                <div className="dna-card__rating-num"><AnimatedNumber value={s.index} format={(v: number) => v.toFixed(1)} stiffness={120} damping={24} /></div>
              </div>
              <div className="dna-card__rating-lab">индекс сезона</div>
              <div className="hd-player__ringsub">лучше {Math.round(s.indexPct ?? 0)}% {peersShort}{s.rank ? ` · ${s.rank}-й из ${s.peers}` : ''}</div>
              {s.lowSample && <div className="hd-player__ringsub hd-warn">предварительно: на поле меньше двух полных матчей</div>}
            </div>
          )}
        </div>

        {s.strengths.length > 0 && (
          <div className="dna-card__block">
            <div className="dna-card__block-title">Сильные стороны<span className="dna-card__block-sub">выше % {peers}</span></div>
            <StaggerList className="dna-card__bars" speed="normal">
              {s.strengths.map((x, i) => (
                <div className={`dna-bar${i === 0 ? ' dna-bar--lead' : ''}`} key={x.key}>
                  <div className="dna-bar__head">
                    <span className="dna-bar__label"><MetricName title={x.name.toLowerCase()} description={x.description} /></span>
                    <span className="dna-bar__pct"><AnimatedNumber value={x.pct} stiffness={200} damping={26} /></span>
                  </div>
                  <div className="dna-bar__track" aria-hidden><div className="dna-bar__fill" style={{ width: `${x.pct}%` }} /></div>
                </div>
              ))}
            </StaggerList>
          </div>
        )}
        {s.growth.length > 0 && (
          <div className="dna-card__block">
            <div className="dna-card__block-title dna-card__block-title--muted">Зоны роста</div>
            <div className="dna-card__growth">{s.growth.map((g) => <span className="dna-growth-pill" key={g.key} title={g.description}>{g.name.toLowerCase()}<span className="dna-growth-pill__pct">{g.pct}</span></span>)}</div>
          </div>
        )}
        {!s.inPool && <div className="dna-card__block hd-muted">Для сравнения со сверстниками нужно от 45 минут на поле — пока профиль строится только по фактам.</div>}
      </div>

      {flags.length > 0 && <div className="hd-player__flags">{flags.map((f) => <span key={f} className="hd-tag hd-tag--up">{f}</span>)}</div>}

      <div className="hd-player__grid">
        <div className="card an">
          <div className="page-section-title">Профиль</div>
          <p className="hd-player__text">{s.text}</p>
        </div>
        <div className="card an">
          <div className="page-section-title">Место в регионе</div>
          {s.league ? (
            <div className="hd-player__facts">
              <div><span>Индекс сезона</span><b>{s.index != null ? `${s.index.toFixed(1)}${s.rank != null ? ` · ${s.rank}-й из ${s.peers}` : ''}` : '—'}</b><small className="hd-muted">среди {s.peersWord}</small></div>
              <div><span>Среди всех сверстников</span><b>{s.league.rankRegion != null ? `${s.league.rankRegion}-й из ${s.league.sizeRegion}` : '—'}</b><small className="hd-muted">все позиции, {s.year} г.р.</small></div>
              <div><span>В своей лиге</span><b>{s.league.rankDiv != null ? `${s.league.rankDiv}-й из ${s.league.sizeDiv}` : '—'}</b><small className="hd-muted">{s.league.division}</small></div>
              <div><span>Команда</span><b>{s.league.teamKey ? <Link to={`/holding/teams/${encodeURIComponent(s.league.teamKey)}${slugQ}`} className="hd-link">{shortClub(s.league.clubLabel)} {s.league.birthYear}</Link> : '—'}</b></div>
            </div>
          ) : <div className="hd-muted">Игрок не из холдинга.</div>}
        </div>
      </div>

      {s.league && <PlayerPositions p={s.league} />}

      {slices.length >= 3 && (
        <div className="card hd-player__pizza">
          <div className="page-section-title">Профиль по сезону <span className="an-model-tag">за матч ({s.matchLen}′) · против {peers}</span></div>
          <PizzaChart subjectName={`${s.name} · сезон`} subjectMeta={`Цифры — за полный матч (${s.matchLen}′), длина слайса — место среди ${s.peers} ${peers}`} vsLabel={peersShort} centerLabel="регион" slices={slices} showLegend={false} />
          <div className="hd-pizza-legend"><span><i style={{ background: '#22d3ee' }} />атака и созидание</span><span><i style={{ background: '#fbbf24' }} />владение</span><span><i style={{ background: '#818cf8' }} />оборона</span></div>
        </div>
      )}

      <div className="hd-player__grid">
        {trend.length >= 2 && <PlayerTrendCard series={trend} />}
        {trend.length >= 3 && <PlayerFormCard series={trend} />}
      </div>

      {pctRows.length >= 4 && (
        <div className="card an">
          <div className="page-section-title">Перцентиль по сезону <span className="an-model-tag">за матч ({s.matchLen}′) · против {peers}</span></div>
          <div className="an-pct__split">
            {cols.map(([title, tone, rows]) => (
              <div className="an-pct__col" key={title}>
                <div className={`an-pct__col-title an-pct__col-title--${tone}`}>{title}</div>
                {rows.map((r) => (
                  <div className="an-pct__row" key={r.key}>
                    <span className="an-pct__label"><MetricName title={r.name} description={r.description} negative={r.polarity < 0} /></span>
                    <span className="an-pct__track"><span className={`an-pct__fill an-pct__fill--${bucket(r.pct as number)}`} style={{ width: `${Math.max(4, r.pct as number)}%` }} /></span>
                    <span className="an-pct__num">{r.pct}<span className="an-pct__raw"> · {fmtVal(r)}</span></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="an-note">Перцентиль за полный матч своего возраста ({s.matchLen}′) против {s.peers} {peers} с 45+ минутами. Зелёный — среди лучших, серый — в норме, янтарный и красный — отстаёт.</div>
        </div>
      )}

      {s.roles.length >= 2 && (
        <div className="card an">
          <div className="page-section-title">Ролевой профиль <span className="an-model-tag">по метрикам</span></div>
          <div className="an-rolefit">
            {s.roles.map((r, i) => (
              <div className="an-rolefit__row" key={r.name}>
                <span className={`an-rolefit__name${i === 0 ? ' an-rolefit__name--best' : ''}`}>{r.name}</span>
                <span className="an-rolefit__track"><span className="an-rolefit__fill" style={{ width: `${Math.max(4, r.score)}%` }} /></span>
                <span className="an-rolefit__pct">{r.score}</span>
              </div>
            ))}
          </div>
          <div className="an-note">Соответствие ролям по профилю действий за сезон — тот же расчёт, что «ДНК игрока». Лучшая роль — {s.roles[0]!.name}.</div>
        </div>
      )}

      {s.league && <PlayerNotes player={{ id: s.league.id, name: s.name }} suggested={a?.youth.ready.some((x) => x.id === s.league!.id) ? 'youth' : a?.promote.some((x) => x.id === s.league!.id) ? 'promote' : undefined} />}

      <details className="card an hd-player__all">
        <summary className="page-section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>Все показатели против своей позиции в лиге</summary>
        {full.data?.vsLeague ? <PlayerMetricsTable rows={full.data.vsLeague.rows} peers={1} /> : <div className="hd-muted" style={{ marginTop: 12 }}>Считаем показатели когорты…</div>}
      </details>
    </div>
  );
}

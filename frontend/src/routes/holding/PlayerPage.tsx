import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { FederationAvPlayerProfile } from '../federation/AvPlayerProfile';
import { ratingColor } from '../federation/ratings';
import { useHoldingAnalytics, useSlugQuery, num, pm, shortClub, LINE_TITLE, type PlayerMetricsVsLeague } from './api';
import { PctBadge, TrendCell, Kpi, PlayerMetricsTable, SectionTitle } from './parts';
import { PlayerNotes } from './Notes';

/**
 * Игрок в кабинете холдинга: сверху — его место относительно лиги и региона и что это
 * значит для решений; ниже — полный профиль (37 показателей, матчи) из базы разборов.
 */
export function HoldingPlayerPage() {
  const { id = '' } = useParams();
  const an = useHoldingAnalytics();
  const q = useSlugQuery();
  const p = an.data?.players.find((x) => String(x.id) === id) ?? null;
  // Тот же запрос, что делает профиль (общий ключ кэша) — отсюда берём показатели против лиги;
  // пока когорта считается, переспрашиваем раз в 20 секунд.
  const prof = useQuery({
    queryKey: ['/holding', 'player', id],
    queryFn: () => api<{ vsLeague: PlayerMetricsVsLeague | null; vsLeagueStatus: 'ready' | 'warming' }>(`/holding/players/${encodeURIComponent(id)}`),
    refetchInterval: (q) => (q.state.data && q.state.data.vsLeagueStatus === 'warming' ? 20_000 : false),
    refetchIntervalInBackground: true,
  });
  const metrics = prof.data?.vsLeague ?? null;
  const a = an.data;
  const flags: string[] = [];
  if (a && p) {
    if (a.youth.ready.some((x) => x.id === p.id)) flags.push('готов в молодёжную команду');
    else if (a.youth.watch.some((x) => x.id === p.id)) flags.push('кандидат в молодёжную команду — присмотреться');
    if (a.promote.some((x) => x.id === p.id)) flags.push('уровень Высшей лиги — кандидат в ФК Динамо');
    const older = a.olderAge.find((x) => x.id === p.id);
    if (older) flags.push(`готов играть за ${older.olderTeamName} (был бы ${older.olderRank}-м из ${older.olderSize})`);
    const losing = a.losing.find((x) => x.id === p.id);
    if (losing) flags.push(losing.reason === 'trend' ? 'падение формы в последних матчах' : 'выпал из ротации');
    if (a.risk.some((x) => x.id === p.id)) flags.push('ниже медианы Первой лиги своего возраста');
  }

  return (
    <div>
      {p && (
        <section className="fed-card" style={{ marginBottom: 18, borderColor: 'color-mix(in srgb, var(--hold-bright) 35%, var(--border))' }}>
          <div className="hold-hero__kicker">{shortClub(p.clubLabel)} {p.birthYear} · {p.division} · {p.line ? LINE_TITLE[p.line] : '—'}</div>
          <div className="hc-player-head">
            <h2 className="fed-card__title" style={{ fontSize: 20, marginTop: 4 }}>{p.name} относительно лиги</h2>
            <div className="hc-player-head__actions">
              <Link to={`/holding/players/${p.id}/card${q}`} className="hc-btn hc-btn--primary">Карточка для совета</Link>
              <Link to={`/holding/compare?a=${p.id}${q ? '&' + q.slice(1) : ''}`} className="hc-btn">Сравнить</Link>
            </div>
          </div>
          <div className="hc-league">
            <Kpi label="Рейтинг" value={<span style={{ color: ratingColor(p.rating) }}>{p.rating != null ? num(p.rating) : '—'}</span>} sub={`${p.mp} разобранных матчей`} />
            <Kpi label="В регионе" value={p.rankRegion != null ? `${p.rankRegion}-й` : '—'} sub={<>из {p.sizeRegion} игроков {p.birthYear} г.р. · <PctBadge p={p} /></>} accent />
            <Kpi label="В дивизионе" value={p.rankDiv != null ? `${p.rankDiv}-й` : '—'} sub={`из ${p.sizeDiv} · ${p.division}`} />
            <Kpi label="К амплуа лиги" value={p.deltaLine != null ? pm(p.deltaLine) : '—'} sub={p.lineAvgDiv != null ? `среднее по амплуа в лиге ${num(p.lineAvgDiv)}${p.lineAvgRegion != null ? ` · в регионе ${num(p.lineAvgRegion)}` : ''}` : 'мало данных'} tone={p.deltaLine != null && p.lineAvgDiv != null ? (p.deltaLine / p.lineAvgDiv >= 0.12 ? 'good' : p.deltaLine / p.lineAvgDiv <= -0.12 ? 'bad' : undefined) : undefined} />
            <Kpi label="Тренд" value={<TrendCell p={p} />} sub={p.last.length ? `последние матчи: ${p.last.join(' · ')}` : 'нет оценок'} />
          </div>
          {flags.length > 0 && (
            <div className="hold-hero__badges" style={{ marginTop: 0 }}>
              {flags.map((f) => <span key={f} className="fed-badge fed-badge--accent">{f}</span>)}
            </div>
          )}
        </section>
      )}
      <SectionTitle sub={metrics ? `${metrics.matches} разобранных матчей · амплуа ${metrics.line ? LINE_TITLE[metrics.line] : '—'} · ${metrics.division}. Каждое действие за матч против игроков того же амплуа в дивизионе и регионе.` : 'Собираем события всех команд когорты — это занимает несколько минут после запуска.'}>
        36 показателей относительно лиги
      </SectionTitle>
      <section className="fed-card" style={{ marginBottom: 20 }}>
        {metrics ? <PlayerMetricsTable rows={metrics.rows} peers={1} /> : <div className="fed-skeleton" style={{ height: 160 }} />}
      </section>
      {p && <PlayerNotes player={p} suggested={a?.youth.ready.some((x) => x.id === p.id) ? 'youth' : a?.promote.some((x) => x.id === p.id) ? 'promote' : a?.olderAge.some((x) => x.id === p.id) ? 'older' : undefined} />}
      <FederationAvPlayerProfile apiBase="/holding" backTo={`/holding/players${q}`} backLabel="← К игрокам холдинга" />
    </div>
  );
}

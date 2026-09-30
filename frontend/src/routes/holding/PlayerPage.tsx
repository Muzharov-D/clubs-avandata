import { useParams } from 'react-router-dom';
import { FederationAvPlayerProfile } from '../federation/AvPlayerProfile';
import { ratingColor } from '../federation/ratings';
import { useHoldingAnalytics, useSlugQuery, num, pm, shortClub, LINE_TITLE } from './api';
import { PctBadge, TrendCell, Kpi } from './parts';

/**
 * Игрок в кабинете холдинга: сверху — его место относительно лиги и региона и что это
 * значит для решений; ниже — полный профиль (37 показателей, матчи) из базы разборов.
 */
export function HoldingPlayerPage() {
  const { id = '' } = useParams();
  const an = useHoldingAnalytics();
  const q = useSlugQuery();
  const p = an.data?.players.find((x) => String(x.id) === id) ?? null;
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
          <h2 className="fed-card__title" style={{ fontSize: 20, marginTop: 4 }}>{p.name} относительно лиги</h2>
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
      <FederationAvPlayerProfile apiBase="/holding" backTo={`/holding/players${q}`} backLabel="← К игрокам холдинга" />
    </div>
  );
}

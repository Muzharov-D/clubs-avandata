import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClubShield } from '../federation/ClubShield';
import { MatchDetail, type MatchBase } from '../federation/MatchDetail';
import { FedError } from '../federation/FedState';
import { ratingColor } from '../federation/ratings';
import { fmtDate } from '../federation/utils';
import { Form, sides, toBase, OUT, type HMatch } from '../federation/HoldingView';
import { useHoldingProfile, useHoldingAnalytics, useSlugQuery, num, pm, plMatch, plPlayer, shortClub, placeWord, type TeamLeague } from './api';
import { PlayerTable, Kpi, SectionTitle } from './parts';

/**
 * Команда относительно лиги: место и рейтинг, средний класс против дивизиона, линии,
 * состав с местом каждого игрока в регионе и лиге, таблица дивизиона, матчи по протоколам.
 */
export function HoldingTeamPage() {
  const { key = '' } = useParams();
  const teamKey = decodeURIComponent(key);
  const profile = useHoldingProfile();
  const an = useHoldingAnalytics();
  const q = useSlugQuery();
  const [match, setMatch] = useState<MatchBase | null>(null);
  const [showAll, setShowAll] = useState(false);

  const team = profile.data?.teams.find((t) => t.key === teamKey);
  const league = an.data?.teams.find((t) => t.key === teamKey);
  const others = useMemo(() => (profile.data?.teams ?? []).filter((t) => t.key !== teamKey), [profile.data, teamKey]);

  if (profile.error) return <FedError subject="Страница команды" />;
  if (profile.isLoading || !profile.data) return <div className="fed-skeleton" style={{ height: 500 }} />;
  if (!team) return <div className="fed-empty">Команда не найдена. <Link to={`/holding${q}`} className="fed-link">К обзору</Link></div>;

  const s = team.standing, r = team.rating;
  const played = team.matches.filter((m) => m.played);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const upcoming = team.matches.filter((m) => !m.played && m.date >= yesterday).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const over = league?.overperformance ?? null;

  return (
    <div>
      <header className="hold-detail__head" style={{ marginBottom: 18 }}>
        <ClubShield name={team.name} logoUrl={team.logo} size={60} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hold-hero__kicker">{shortClub(team.clubLabel)} · {team.ageTitle}</div>
          <h1 className="hold-detail__title" style={{ fontSize: 28 }}>{team.name}</h1>
          <div className="hold-detail__sub">{team.division} · {team.squad.players} {plPlayer(team.squad.players)} в разобранных матчах · {played.length} {plMatch(played.length)} по протоколам</div>
        </div>
        <div className="hold-hero__badges">
          {others.filter((t) => t.clubKey === team.clubKey && Math.abs(t.year - team.year) === 1).map((t) => (
            <Link key={t.key} to={`/holding/teams/${encodeURIComponent(t.key)}${q}`} className="fed-badge fed-badge--accent" style={{ textDecoration: 'none' }}>{t.year < team.year ? '↑' : '↓'} {t.year} г.р.</Link>
          ))}
        </div>
      </header>

      <div className="fed-grid fed-grid--4 hold-kpi">
        <Kpi label="Место в дивизионе" value={s ? `#${s.place}` : '—'} sub={s ? `из ${s.size} · ${s.points} оч · ${s.won}-${s.drawn}-${s.lost} · мячи ${pm(s.goalDiff)}` : 'таблица недоступна'} accent />
        <Kpi label="По рейтингу AvanData" value={r ? `${r.rank}-е` : '—'} sub={r ? `из ${r.size} · рейтинг ${num(r.value)}${over != null ? (over > 0 ? ` · в таблице выше на ${over}` : over < 0 ? ` · в таблице ниже на ${-over}` : ' · место совпадает') : ''}` : 'нет данных'} tone={over != null && over < 0 ? 'warn' : over != null && over > 0 ? 'good' : undefined} />
        <Kpi label="Средний класс" value={league?.avgRating != null ? num(league.avgRating) : team.squad.avgRating != null ? num(team.squad.avgRating) : '—'} sub={league?.divAvgRating != null ? `в лиге ${num(league.divAvgRating)} · ${league.divRankByAvg ?? '—'}-е из ${league.divTeams} по составу` : `${team.squad.rated} с рейтингом`} tone={league?.avgRating != null && league.divAvgRating != null ? (league.avgRating >= league.divAvgRating ? 'good' : 'bad') : undefined} />
        <Kpi label="В топ-30 лиги" value={team.squad.inTop30} sub={`среди 30 сильнейших ${team.ageTitle} · ${team.division}`} accent />
      </div>

      {/* Линии */}
      <SectionTitle sub="Средний рейтинг линии против среднего по дивизиону. Слабая линия — где усиление даст больше всего.">Линии относительно лиги</SectionTitle>
      {league ? (
        <div className="hc-lines-grid">
          {league.lines.map((l) => (
            <div key={l.line} className={`hc-linecard${l.verdict === 'weak' ? ' hc-linecard--weak' : l.verdict === 'strong' ? ' hc-linecard--strong' : ''}`}>
              <div className="hc-linecard__title">{l.title} · {l.n} с рейтингом</div>
              <div className="hc-linecard__nums">
                <span className="hc-linecard__team" style={{ color: ratingColor(l.teamAvg) }}>{l.teamAvg != null ? num(l.teamAvg) : '—'}</span>
                <span className="hc-linecard__div">лига {l.divAvg != null ? num(l.divAvg) : '—'}</span>
              </div>
              <div className="hc-linecard__verdict" style={{ color: l.verdict === 'weak' ? 'var(--danger)' : l.verdict === 'strong' ? 'var(--success)' : 'var(--text-secondary)' }}>
                {l.gapRel == null ? 'мало данных' : `${pm(Math.round(l.gapRel * 100))}% к лиге · ${l.verdict === 'weak' ? 'усилить' : l.verdict === 'strong' ? 'сильная сторона' : 'на уровне'}`}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="fed-skeleton" style={{ height: 100 }} />}

      {/* Состав */}
      <SectionTitle sub="Место — среди игроков своего года рождения с рейтингом (не меньше 2 разобранных матчей): в регионе и в своём дивизионе. «К амплуа лиги» — отклонение от среднего по амплуа в дивизионе. Тренд — последние матчи против сезона.">Состав относительно лиги</SectionTitle>
      <section className="fed-card">
        {league ? <PlayerTable players={league.squad} showTeam={false} emptyText="Нет игроков в разобранных матчах." /> : <div className="fed-skeleton" style={{ height: 300 }} />}
      </section>

      <div className="hold-detail__grid" style={{ marginTop: 20, gridTemplateColumns: '1.2fr 1fr' }}>
        {/* Таблица */}
        <div className="hold-block">
          <h3 className="hold-block__title">Таблица · {team.division}</h3>
          {team.table.length === 0 ? <div className="fed-note">Таблица недоступна.</div> : (
            <table className="fed-table hold-table">
              <thead><tr><th style={{ width: 28 }} /><th /><th>Команда</th><th className="fed-table__num">И</th><th className="fed-table__num">В</th><th className="fed-table__num">Н</th><th className="fed-table__num">П</th><th className="fed-table__num">±</th><th className="fed-table__num">О</th></tr></thead>
              <tbody>
                {team.table.map((row, i) => (
                  <tr key={row.id} className={row.isMember ? 'hold-table__me' : undefined}>
                    <td className="fed-table__num">{i + 1}</td>
                    <td><ClubShield name={row.name} logoUrl={row.logo} size={20} /></td>
                    <td className="hold-table__name"><div className="fed-row__name hold-ellipsis" title={row.name}>{row.name}</div></td>
                    <td className="fed-table__muted">{row.played}</td>
                    <td className="fed-table__num">{row.won}</td><td className="fed-table__num">{row.drawn}</td><td className="fed-table__num">{row.lost}</td>
                    <td className="fed-table__num" style={{ color: row.goalDiff > 0 ? 'var(--success)' : row.goalDiff < 0 ? 'var(--danger)' : undefined }}>{pm(row.goalDiff)}</td>
                    <td className="fed-table__num" style={{ fontWeight: 700 }}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="fed-note" style={{ marginTop: 8 }}>{team.standingsSource === 'ffspb-live' ? 'По протоколам ФФСПб: очки, личные встречи, разница мячей.' : team.standingsDegraded ? '⚠ Зеркало AvanData — протоколы ФФСПб ещё догружаются.' : 'Официальная таблица ФФСПб.'}</p>
        </div>

        {/* Матчи */}
        <div className="hold-block">
          <h3 className="hold-block__title">Матчи · {played.length} {plMatch(played.length)} · форма <Form form={team.form} /></h3>
          {upcoming[0] && (
            <div className="hold-next"><span className="fed-badge fed-badge--accent">следующий</span><span className="hold-ellipsis">{upcoming[0].home.name} — {upcoming[0].away.name}</span><span className="fed-row__meta">{fmtDate(upcoming[0].date)} · {upcoming[0].tour}-й тур</span></div>
          )}
          <div className="hold-matches">
            {(showAll ? played : played.slice(0, 10)).map((m: HMatch) => {
              const { us, them, home } = sides(m);
              const hasCard = m.avId != null;
              return (
                <button type="button" key={m.id} className={`hold-match${hasCard ? '' : ' hold-match--plain'}`} onClick={hasCard ? () => setMatch(toBase(m)) : undefined} disabled={!hasCard} title={hasCard ? 'Открыть разбор матча' : 'Протокол ФФСПб — разбора матча пока нет'}>
                  <span className={`hold-form__dot hold-form__dot--${m.outcome ?? 'd'}`}>{m.outcome ? OUT[m.outcome] : '·'}</span>
                  <ClubShield name={them.name} logoUrl={them.logo} size={22} />
                  <span className="hold-match__opp hold-ellipsis" title={them.name}>{them.name.replace(/\s*20\d{2}\s*$/, '')}{m.technical ? ' · техн.' : ''}</span>
                  <span className="hold-match__ha">{home ? 'дома' : 'в гостях'}{hasCard ? ' · разбор' : ''}</span>
                  <span className="hold-match__score">{us.score ?? '–'}:{them.score ?? '–'}</span>
                  <span className="hold-match__date">{fmtDate(m.date)}</span>
                </button>
              );
            })}
            {played.length === 0 && <div className="fed-note">Сыгранных матчей пока нет.</div>}
          </div>
          {played.length > 10 && <button type="button" className="fed-link hold-more" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Свернуть' : `Показать все ${played.length} ${plMatch(played.length)}`}</button>}
        </div>
      </div>

      {match && <MatchDetail base={match} onClose={() => setMatch(null)} />}
    </div>
  );
}

export type { TeamLeague };

import { useMemo, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClubShield } from '../federation/ClubShield';
import { MatchDetail, type MatchBase } from '../federation/MatchDetail';
import { FedError } from '../federation/FedState';
import { fmtDate } from '../federation/utils';
import { sides, toBase, type HMatch } from '../federation/HoldingView';
import PizzaChartJs from '../../components/PizzaChart';
import '../../components/analytics/analytics.css';
import { useHoldingProfile, useHoldingAnalytics, useTeamMetrics, num, pm, plMatch, shortClub, LINE_TITLE, GROUPS, GROUP_PLURAL, groupOf, groupTitle, type TeamLeague, type LeaguePlayer, type Line, type TeamMetricRow } from './api';
import { TeamMetricsTable, PlayerTable } from './parts';
import { HdLoading } from './HoldingShell';
import { useNavQuery } from './scope';
import { TeamPitch } from './Board';
import { perfWord } from './cards';
import { IndexRing, TeamScatter, indexColor } from './viz';

const PizzaChart = PizzaChartJs as unknown as ComponentType<Record<string, unknown>>;
const OUT_RU: Record<string, string> = { w: 'В', d: 'Н', l: 'П' };
// Показатели команды для пиццы (групп — как у профиля игрока).
const TEAM_PIZZA: Array<{ id: string; group: 'attack' | 'defence' | 'fitness' }> = [
  { id: 'goal', group: 'attack' }, { id: 'hitTarget', group: 'attack' }, { id: 'goalMomentPlus', group: 'attack' }, { id: 'passPlus', group: 'attack' }, { id: 'driblePlus', group: 'attack' },
  { id: 'ballSave', group: 'fitness' }, { id: 'underPressure', group: 'fitness' }, { id: 'passMinus', group: 'fitness' },
  { id: 'interception', group: 'defence' }, { id: 'tackle', group: 'defence' }, { id: 'press', group: 'defence' }, { id: 'takeaway', group: 'defence' },
];
const surname = (name: string) => { const p = name.trim().split(/\s+/); return p.length > 1 ? `${p[p.length - 1]} ${p[0]![0]}.` : name; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Команда — как «Моя команда» в клубном кабинете, но против лиги: состав на поле с
 * индексами, место в таблице против силы состава среди всех команд дивизиона, пицца
 * команды против дивизиона, карточки игроков по линиям, лента результатов.
 */
export function HoldingTeamPage() {
  const { key = '' } = useParams();
  const teamKey = decodeURIComponent(key);
  const profile = useHoldingProfile();
  const an = useHoldingAnalytics();
  const q = useNavQuery();
  const tm = useTeamMetrics(teamKey);
  const [match, setMatch] = useState<MatchBase | null>(null);
  const [showAll, setShowAll] = useState(false);

  const team = profile.data?.teams.find((t) => t.key === teamKey);
  const league = an.data?.teams.find((t) => t.key === teamKey) as (TeamLeague & { divMap?: Array<{ name: string; place: number; strength: number | null; mine: boolean }> }) | undefined;

  const pizza = useMemo(() => (tm.data ? teamPizza(tm.data.rows) : []), [tm.data]);
  if (profile.error) return <FedError subject="Страница команды" />;
  if (!profile.data || !team) return profile.data ? <div className="hd-empty">Команда не найдена. <Link to={`/holding${q}`} className="hd-link">К брифингу</Link></div> : <HdLoading title="Готовим команду" />;

  const s = team.standing;
  const played = team.matches.filter((m) => m.played).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const upcoming = team.matches.filter((m) => !m.played && m.date >= new Date(Date.now() - 86_400_000).toISOString()).sort((a, b) => (a.date < b.date ? -1 : 1));
  const squad = league?.squad ?? [];
  const teamIndex = mean(squad.filter((p) => p.index != null && (p.minutes ?? 0) >= 45).map((p) => p.index as number));
  const over = league?.overperformance ?? null;
  const scatter = (league?.divMap ?? []).filter((d) => d.strength != null).map((d) => ({ id: d.name, x: d.strength as number, y: d.place, label: d.mine ? `${shortClub(team.clubLabel)} ${team.year}` : d.name, mine: d.mine }));
  const siblings = profile.data.teams.filter((t) => t.clubKey === team.clubKey && Math.abs(t.year - team.year) === 1);

  return (
    <div className="hd-team-page">
      {/* Шапка — как у клуба: герб, команда, место, сила состава, форма */}
      <header className="hd-teamhero">
        <ClubShield name={team.name} logoUrl={team.logo} size={84} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hd-kicker">{team.ageTitle} · {team.division}</div>
          <h1 className="hd-teamhero__title">{shortClub(team.clubLabel)} {team.year}</h1>
          <div className="hd-teamhero__form">
            {played.slice(0, 6).reverse().map((m) => <span key={m.id} className={`hd-formdot hd-formdot--${m.outcome ?? 'd'}`} title={`${m.home.name} ${m.home.score ?? '–'}:${m.away.score ?? '–'} ${m.away.name}`}>{m.outcome ? OUT_RU[m.outcome] : '·'}</span>)}
            {upcoming[0] && <span className="hd-muted hd-small" style={{ marginLeft: 10 }}>следующий: {fmtDate(upcoming[0].date)} — {sides(upcoming[0]).them.name.replace(/\s*20\d{2}\s*$/, '')}</span>}
          </div>
          <div className="hd-teamhero__sib">{siblings.map((t) => <Link key={t.key} to={`/holding/teams/${encodeURIComponent(t.key)}`} className="hd-tag hd-tag--brand">{t.year < team.year ? '↑' : '↓'} {t.year} г.р.</Link>)}</div>
        </div>
        <div className="hd-teamhero__stats">
          <div className="hd-bigstat"><span className="hd-bigstat__v">{s ? s.place : '—'}<small>{s ? `/${s.size}` : ''}</small></span><span className="hd-bigstat__l">место в таблице</span><span className="hd-bigstat__s">{s ? `${s.points} оч · ${s.won}-${s.drawn}-${s.lost} · ${pm(s.goalDiff)}` : ''}</span></div>
          <div className="hd-bigstat"><span className="hd-bigstat__v">{league?.divRankByAvg ?? '—'}<small>{league?.divTeams ? `/${league.divTeams}` : ''}</small></span><span className="hd-bigstat__l">по уровню игры</span><span className={`hd-bigstat__s ${over != null && over < 0 ? 'hd-warn' : over != null && over > 0 ? 'hd-up' : ''}`}>{over == null ? '' : perfWord(over).text}</span></div>
          <div className="hd-bigstat hd-bigstat--ring"><IndexRing value={teamIndex == null ? null : Math.round(teamIndex * 10) / 10} size={86} stroke={7} /><span className="hd-bigstat__l">индекс состава</span></div>
        </div>
      </header>

      <section className="card an">
        <div className="page-section-title">Состав на поле <span className="an-model-tag">индекс против своей позиции в регионе · по глубине</span></div>
        {squad.length ? <TeamPitch players={squad} q={q} /> : <div className="hd-muted">Нет игроков в разобранных матчах.</div>}
      </section>

      <div className="hd-team-grid">
        <section className="card an">
          <div className="page-section-title">Место против уровня игры <span className="an-model-tag">{team.division}</span></div>
          {scatter.length >= 3 ? <TeamScatter points={scatter} xLabel="уровень игры" yLabel="место" height={360} /> : <div className="hd-muted">Считаем уровень игры команд дивизиона…</div>}
          <div className="an-note">Каждая точка — команда дивизиона. Пунктир — место, которое соответствует уровню игры: выше линии — команда набирает больше, чем позволяет игра; ниже — играет сильнее своего места в таблице.</div>
        </section>
        <section className="card an">
          <div className="page-section-title">Линии против лиги</div>
          {(league?.lines ?? []).map((l) => (
            <div key={l.line} className="hd-lineline">
              <span className="hd-lineline__t">{l.title}</span>
              <span className="hd-lineline__bar"><span style={{ width: `${Math.min(100, Math.max(4, 50 + (l.gapRel ?? 0) * 100))}%`, background: l.verdict === 'weak' ? 'var(--rating-poor)' : l.verdict === 'strong' ? 'var(--rating-excellent)' : 'var(--rating-ok)' }} /></span>
              <span className={`hd-lineline__v ${l.verdict === 'weak' ? 'hd-down' : l.verdict === 'strong' ? 'hd-up' : ''}`}>{l.gapRel == null ? '—' : `${pm(Math.round(l.gapRel * 100))}%`}</span>
            </div>
          ))}
          <div className="an-note">Средний рейтинг линии против средней по своему дивизиону. Середина полосы — уровень лиги.</div>
        </section>
      </div>

      {pizza.length >= 5 && (
        <section className="card hd-player__pizza">
          <div className="page-section-title">Профиль команды <span className="an-model-tag">за матч · место среди {tm.data?.rows[0]?.sizeDiv ?? ''} команд дивизиона</span></div>
          <PizzaChart subjectName={`${shortClub(team.clubLabel)} ${team.year}`} subjectMeta="Цифры — действия команды за матч, длина слайса — место среди команд своего дивизиона" vsLabel="команд" centerLabel="дивизион" slices={pizza} showLegend={false} />
          <div className="hd-pizza-legend"><span><i style={{ background: '#22d3ee' }} />атака и созидание</span><span><i style={{ background: '#fbbf24' }} />владение</span><span><i style={{ background: '#818cf8' }} />оборона</span></div>
        </section>
      )}

      {/* Карточки игроков по специализациям */}
      <section className="card an">
        <div className="page-section-title">Игроки <span className="an-model-tag">индекс · минуты · форма</span></div>
        {GROUPS.map((g) => {
          const ps = squad.filter((p) => groupOf(p) === g).sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || (b.minutes ?? 0) - (a.minutes ?? 0));
          if (!ps.length) return null;
          return (
            <div key={g} className="hd-pcards__line">
              <div className="hd-pcards__title">{GROUP_PLURAL[g]}</div>
              <div className="hd-pcards">{ps.map((p) => <PlayerCard key={p.id} p={p} q={q} />)}</div>
            </div>
          );
        })}
      </section>

      {/* Лента результатов */}
      <section className="card an">
        <div className="page-section-title">Матчи <span className="an-model-tag">{played.length} {plMatch(played.length)} · клик — разбор</span></div>
        <div className="hd-results">
          {(showAll ? played : played.slice(0, 12)).map((m: HMatch) => {
            const { us, them, home } = sides(m);
            const hasCard = m.avId != null;
            return (
              <button type="button" key={m.id} className={`hd-result hd-result--${m.outcome ?? 'd'}`} onClick={hasCard ? () => setMatch(toBase(m)) : undefined} disabled={!hasCard} title={hasCard ? 'Открыть разбор матча' : 'Только протокол — разбора нет'}>
                <span className="hd-result__score">{us.score ?? '–'}:{them.score ?? '–'}</span>
                <span className="hd-result__opp">{them.name.replace(/\s*20\d{2}(-20\d{2})?\s*$/, '')}</span>
                <span className="hd-result__meta">{fmtDate(m.date)} · {home ? 'дома' : 'в гостях'}{hasCard ? ' · разбор' : ''}</span>
              </button>
            );
          })}
        </div>
        {played.length > 12 && <button type="button" className="hd-more" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Свернуть' : `Все ${played.length} ${plMatch(played.length)}`}</button>}
      </section>

      <div>
        <section className="card an">
          <div className="page-section-title">Таблица · {team.division}</div>
          <table className="hd-table hd-table--tight">
            <thead><tr><th className="num">#</th><th>Команда</th><th className="num">И</th><th className="num">±</th><th className="num">О</th></tr></thead>
            <tbody>
              {team.table.map((row, i) => (
                <tr key={row.id} className={row.isMember ? 'hd-row-me' : undefined}>
                  <td className="num hd-muted">{i + 1}</td>
                  <td><span className="hd-team"><ClubShield name={row.name} logoUrl={row.logo} size={20} /><span>{row.name.replace(/\s*20\d{2}(-20\d{2})?\s*$/, '')}</span></span></td>
                  <td className="num hd-muted">{row.played}</td>
                  <td className={`num ${row.goalDiff > 0 ? 'hd-up' : row.goalDiff < 0 ? 'hd-down' : ''}`}>{pm(row.goalDiff)}</td>
                  <td className="num" style={{ fontWeight: 800 }}>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="an-note">{team.standingsSource === 'ffspb-live' ? 'По протоколам ФФСПб: очки, личные встречи, разница мячей.' : 'Таблица — зеркало, протоколы ФФСПб догружаются.'}</div>
        </section>

      </div>

      <details className="card an hd-player__all">
        <summary className="page-section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>Все показатели команды против дивизиона</summary>
        {tm.data ? <TeamMetricsTable rows={tm.data.rows} /> : <div className="hd-muted" style={{ marginTop: 12 }}>Считаем показатели дивизиона…</div>}
      </details>
      <details className="card an hd-player__all">
        <summary className="page-section-title" style={{ cursor: 'pointer', marginBottom: 0 }}>Состав таблицей</summary>
        <PlayerTable players={squad} showTeam={false} emptyText="Нет игроков в разобранных матчах." />
      </details>

      {match && <MatchDetail base={match} onClose={() => setMatch(null)} />}
    </div>
  );
}

function PlayerCard({ p, q }: { p: LeaguePlayer; q: string }) {
  const f = p.formDelta;
  return (
    <Link to={`/holding/players/${p.id}${q}`} className="hd-pcard" style={{ ['--pc' as string]: indexColor(p.index) }}>
      <IndexRing value={p.index} size={52} stroke={5} low={p.lowSample} />
      <span className="hd-pcard__body">
        <span className="hd-pcard__name">{surname(p.name)}</span>
        <span className="hd-pcard__pos">{groupTitle(p)}</span>
        <span className="hd-pcard__meta">{p.minutes ?? 0} мин{f != null ? <> · <span className={f >= 0.5 ? 'hd-up' : f <= -0.5 ? 'hd-down' : ''}>{f >= 0.5 ? '↑' : f <= -0.5 ? '↓' : '→'} форма</span></> : null}</span>
      </span>
    </Link>
  );
}

function teamPizza(rows: TeamMetricRow[]) {
  return TEAM_PIZZA.flatMap(({ id, group }) => {
    const r = rows.find((x) => x.id === id);
    if (!r || r.rankDiv == null || r.sizeDiv < 3) return [];
    const pct = Math.round(((r.sizeDiv - r.rankDiv) / (r.sizeDiv - 1)) * 100);
    return [{ axis: r.short, value: Math.max(3, pct), group, displayValue: r.perMatch >= 10 ? r.perMatch.toFixed(0) : r.perMatch.toFixed(1) }];
  });
}

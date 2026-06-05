import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchTeams, fetchMatches, fetchMatchAggregate, fetchPlayersSeason } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import MatchList from '../components/MatchList';
import RatingCard from '../components/RatingCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import TeamSeasonAnalytics from '../components/analytics/TeamSeasonAnalytics';
import TeamIdentityCard from '../components/analytics/TeamIdentityCard';
import TeamAggregatesGrid from '../components/analytics/TeamAggregatesGrid';
import SeasonTrendCard from '../components/analytics/SeasonTrendCard';
import { isOurClub, shieldFor } from '../utils/legirus';
import { cleanTeamName } from '../utils/teamName';
import { formLetterRu } from '../utils/num';
import { matchesWord } from '../utils/num';
import { useNavigate } from 'react-router-dom';
import './ClubOverview.css';

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

// Наша сторона матча: по ID (надёжно), fallback — по имени.
function weAreHome(m) {
  if (m.homeTeamId || m.awayTeamId) return m.homeTeamId === m.teamId;
  return isOurClub(m.home);
}

// Сезонная сводка из списка матчей: сыграно, В-Н-П, голы за/против, очки, форма.
function seasonRecord(matches) {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  const results = [];
  for (const m of matches) {
    const sh = m.scoreHome, sa = m.scoreAway;
    if (sh == null || sa == null) continue;
    const home = weAreHome(m);
    const us = home ? Number(sh) : Number(sa);
    const them = home ? Number(sa) : Number(sh);
    if (isNaN(us) || isNaN(them)) continue;
    gf += us; ga += them;
    const r = us > them ? 'W' : us === them ? 'D' : 'L';
    if (r === 'W') w++; else if (r === 'D') d++; else l++;
    results.push({ id: m.id, r });
  }
  // matches приходят отсортированными по дате DESC → форма = первые 5, развернуть.
  const form = results.slice(0, 5).reverse();
  return { played: w + d + l, w, d, l, gf, ga, points: w * 3 + d, form };
}

const PERIODS = [
  { value: 'season', label: 'Сезон' },
  { value: 'round1', label: '1 круг' },
  { value: 'round2', label: '2 круг' },
];

export default function ClubOverview() {
  useDocumentTitle('Аналитика сезона');
  const navigate = useNavigate();
  const { selectedTeamId, selectedTeam } = useTeam();

  const [period, setPeriod] = useState('season');

  const teamsRes = useApi(fetchTeams, []);
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const aggRes = useApi(
    () => (selectedTeamId ? fetchMatchAggregate(selectedTeamId, period).catch(() => null) : Promise.resolve(null)),
    [selectedTeamId, period],
  );
  const seasonRes = useApi(
    () => (selectedTeamId ? fetchPlayersSeason(selectedTeamId).catch(() => null) : Promise.resolve(null)),
    [selectedTeamId],
  );
  const teams = teamsRes.data?.teams || [];
  const ourTeam = selectedTeam || teams.find((t) => t.id === selectedTeamId) || teams.find((t) => t.isOurTeam);
  const matches = matchesRes.data?.matches || [];
  const seasonPlayers = seasonRes.data?.players || [];
  // Подсветка последнего матча в списке (без отдельного fetch — берём из списка).
  const lastMatchId = matches[0]?.id;

  const record = useMemo(() => seasonRecord(matches), [matches]);

  const agg = aggRes.data;
  const our = agg?.our || {};
  const ratings = agg?.teamAvgRatings || {};
  const matchCount = agg?.matchCount ?? 0;

  // Сезонные лидеры из агрегатов игроков (per-season суммы).
  const leaders = useMemo(() => buildLeaders(seasonPlayers), [seasonPlayers]);

  const periodLabel = PERIODS.find((p) => p.value === period)?.label.toLowerCase() || 'сезон';

  return (
    <div className="page club-overview">
      <div className="club-overview__grid">
        <aside className="club-overview__col-left">
          <MatchList matches={matches} teams={teams} activeMatchId={lastMatchId} />
        </aside>

        <section className="club-overview__col-right">
          {/* HERO: команда + сезонная запись */}
          <div className="club-overview__hero">
            <div className="card team-info">
              <div className="team-info__head">
                <div className="team-info__title">Команда</div>
              </div>
              <div className="team-info__body">
                {(() => {
                  const logo = shieldFor(ourTeam?.name);
                  const initials = (ourTeam?.name || 'К').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
                  return logo ? (
                    <img
                      className="team-info__logo team-info__logo--img"
                      src={logo}
                      alt=""
                      aria-hidden
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = 'none';
                        const sib = el.nextElementSibling;
                        if (sib) sib.style.display = '';
                      }}
                    />
                  ) : null;
                })()}
                <div
                  className="team-info__logo team-info__logo--initials"
                  aria-hidden
                  style={shieldFor(ourTeam?.name) ? { display: 'none' } : undefined}
                >
                  {(ourTeam?.name || 'К').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </div>
                <div className="team-info__data">
                  <div className="team-info__name">{cleanTeamName(ourTeam?.name || 'Команда').toUpperCase()}</div>
                  <div className="team-info__rating">
                    Средний рейтинг за {periodLabel}:&nbsp;
                    <span className="team-info__rating-val">
                      {Number(ratings.overall) > 0 ? Number(ratings.overall).toFixed(1) : '—'}
                    </span>
                  </div>
                  <div className="team-info__coach">
                    Главный тренер: <span>{ourTeam?.headCoach || '—'}</span>
                  </div>
                  <div className="team-info__coach">
                    Разобрано матчей: <span>{record.played}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Сезонная запись: В-Н-П, голы, форма */}
            <div className="card season-record">
              <div className="team-info__title">Итоги по разобранным матчам</div>
              <div className="season-record__wdl">
                <div className="season-record__cell season-record__cell--w"><b>{record.w}</b><span>побед</span></div>
                <div className="season-record__cell season-record__cell--d"><b>{record.d}</b><span>ничьих</span></div>
                <div className="season-record__cell season-record__cell--l"><b>{record.l}</b><span>пораж.</span></div>
              </div>
              <div className="season-record__meta">
                <span>Очки: <b>{record.points}</b></span>
                <span>Мячи: <b>{record.gf}–{record.ga}</b></span>
                <span className={`season-record__gd ${record.gf - record.ga >= 0 ? 'pos' : 'neg'}`}>
                  {record.gf - record.ga >= 0 ? '+' : ''}{record.gf - record.ga}
                </span>
              </div>
              {record.form.length > 0 && (
                <div className="season-record__form">
                  <span className="season-record__form-lab">Форма</span>
                  {record.form.map((r, i) => (
                    <span key={r.id + i} className={`season-record__res season-record__res--${r.r}`}>{formLetterRu(r.r)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Переключатель периода */}
          <div className="club-overview__period" role="tablist">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={period === p.value}
                className={`club-overview__period-btn${period === p.value ? ' is-active' : ''}`}
                onClick={() => setPeriod(p.value)}
              >{p.label}</button>
            ))}
          </div>

          {matchCount === 0 ? (
            <div className="empty-state">
              {period === 'season'
                ? 'Нет разобранных матчей с командной статистикой.'
                : 'В этом круге пока нет разобранных матчей. Переключите период.'}
            </div>
          ) : (
            <>
              {/* Сводные рейтинги за период */}
              <div>
                <div className="page-section-title">Сводные рейтинги · {periodLabel} <span className="club-overview__sub">{matchCount} {matchesWord(matchCount)}</span></div>
                <div className="club-overview__ratings">
                  <RatingCard label="Общий" value={ratings.overall} />
                  <RatingCard label="Фитнес" value={ratings.fitness} />
                  <RatingCard label="Атака" value={ratings.attack} />
                  <RatingCard label="Защита" value={ratings.defence} />
                </div>
              </div>

              {/* Ключевые показатели — в среднем за матч */}
              <div>
                <div className="page-section-title">Показатели · в среднем за матч</div>
                <div className="club-overview__kpi">
                  <KpiCell label="Голы за матч"   value={record.played ? (record.gf / record.played).toFixed(1) : '—'} accent="gold" />
                  <KpiCell label="Пропуск/матч"   value={record.played ? (record.ga / record.played).toFixed(1) : '—'} />
                  <KpiCell label="Владение, %"    value={fmtAvg(our.possessionPct)} />
                  <KpiCell label="Удары"          value={fmtAvg(num(our.shots?.total))} />
                  <KpiCell label="Удары в створ"  value={fmtAvg(num(our.shots?.onTarget))} />
                  <KpiCell label="xG"             value={fmtAvg(num(our.expectedGoals), 2)} />
                  <KpiCell label="Передачи"       value={fmtAvg(num(our.passes?.total))} />
                  <KpiCell label="% точных"       value={fmtAvg(num(our.passes?.accuracy))} suffix="%" />
                  <KpiCell label="Угловые"        value={fmtAvg(num(our.corners?.total))} />
                  <KpiCell label="Нарушения"      value={fmtAvg(num(our.fouls))} />
                </div>
              </div>
            </>
          )}

          {/* Сезонная форма — путь очков по турам (тренд во времени, океан) */}
          <SeasonTrendCard matches={matches} />

          {/* Детальная аналитика по секциям — глубина за период (перенос с /club) */}
          <TeamAggregatesGrid aggregates={agg?.teamAggregates} matchCount={matchCount} periodLabel={periodLabel} />

          {/* xG-аналитика сезона (модель, по всем матчам) */}
          <TeamSeasonAnalytics matches={matches} />

          {/* Как команда играет — стиль за выбранный период (тренерским языком) */}
          {agg && <TeamIdentityCard aggregate={agg} periodLabel={`за ${periodLabel}`} />}

          {/* Сезонные лидеры — бомбардиры / ассистенты / рейтинг */}
          {leaders && (
            <div>
              <div className="page-section-title">Лидеры сезона</div>
              <div className="club-overview__leaders">
                <LeaderColumn title="Бомбардиры" rows={leaders.scorers} unit="гол." navigate={navigate} />
                <LeaderColumn title="Ассистенты" rows={leaders.assistants} unit="пас." navigate={navigate} />
                <LeaderColumn title="По рейтингу" rows={leaders.rated} unit="" rating navigate={navigate} />
              </div>
            </div>
          )}
        </section>
      </div>

      {(teamsRes.loading || matchesRes.loading || aggRes.loading) && (
        <div className="empty-state">Загрузка данных…</div>
      )}
    </div>
  );
}

function fmtAvg(v, digits = 1) {
  const n = Number(v);
  if (v == null || isNaN(n)) return '—';
  if (Number.isInteger(n) && digits <= 1) return n.toFixed(1);
  return n.toFixed(digits);
}

// Сезонные лидеры из /players/season. Каждый — топ-3 с минимумом активности.
function buildLeaders(seasonPlayers) {
  if (!Array.isArray(seasonPlayers) || seasonPlayers.length === 0) return null;
  const topBy = (getVal, { min = 1, ratingMin = 0 } = {}) =>
    [...seasonPlayers]
      .map((p) => ({ p, v: getVal(p) }))
      .filter((r) => (r.v ?? 0) >= min && (ratingMin ? (r.p.matches ?? 0) >= ratingMin : true))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3);
  const scorers = topBy((p) => p.goals || 0);
  const assistants = topBy((p) => p.assists || 0);
  // Рейтинг: минимум 2 матча, чтобы случайный одиночный всплеск не лидировал.
  const rated = topBy((p) => p.avgOverall || 0, { min: 0.1, ratingMin: 2 });
  if (!scorers.length && !assistants.length && !rated.length) return null;
  return { scorers, assistants, rated };
}

function LeaderColumn({ title, rows, unit, rating, navigate }) {
  return (
    <div className="card leader-col">
      <div className="leader-col__title">{title}</div>
      {rows.length === 0 ? (
        <div className="leader-col__empty">—</div>
      ) : (
        rows.map((r, i) => (
          <div className="leader-col__row" key={r.p.id} onClick={() => navigate(`/players/${r.p.id}`)}>
            <span className="leader-col__rank">{i + 1}</span>
            <PlayerPhoto player={r.p} size={40} />
            <div className="leader-col__info">
              <div className="leader-col__name">{r.p.fullName}</div>
              <div className="leader-col__pos">№{r.p.number ?? '—'} · {r.p.matches} {matchesWord(r.p.matches)}</div>
            </div>
            {rating ? (
              <RatingPill value={r.v} size="md" />
            ) : (
              <span className="leader-col__val">{r.v}<span className="leader-col__unit"> {unit}</span></span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function KpiCell({ label, value, accent, suffix }) {
  const display = value === null || value === undefined || value === '—' ? '—' : `${value}${suffix || ''}`;
  return (
    <div className={`kpi-cell ${accent ? `kpi-cell--${accent}` : ''}`}>
      <div className="kpi-cell__value">{display}</div>
      <div className="kpi-cell__label">{label}</div>
    </div>
  );
}

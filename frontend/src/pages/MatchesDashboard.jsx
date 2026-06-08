import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatches, fetchTeams, fetchMatch, fetchStandings } from '../services/api';
import MatchList from '../components/MatchList';
import PdfUploadDialog from '../components/PdfUploadDialog';
import SquadHeatmap from '../components/SquadHeatmap';
import TeamMatchVsSeason from '../components/analytics/TeamMatchVsSeason';
import { matchesWord } from '../utils/num';
import { shieldFor, normalizeTeamName } from '../utils/legirus';
import { trimAgeSuffix, cleanTeamName } from '../utils/teamName';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { useTournament } from '../contexts/TournamentContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AnimatedNumber, SplitText, Reveal, KineticCard } from '../components/motion';
import Block from '../constructor/Block';
import './MatchesDashboard.css';
import './matchesKinetic.css';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MatchesDashboard() {
  useDocumentTitle('Матчи');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedTeamId, selectedTeam } = useTeam();
  const canUpload = user?.role === 'head_coach' || user?.role === 'team_coach';
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  // Эмблемы соперников из турнирной таблицы (в объекте матча щита нет) — чтобы
  // в сводке был логотип, а не буква названия. Матчинг по имени со срезом возраста.
  const ageGroup = (selectedTeamId || '').match(/(?:19|20)\d{2}/)?.[0] || null;
  const standingsRes = useApi(() => (ageGroup ? fetchStandings(ageGroup) : Promise.resolve(null)), [ageGroup]);
  const teamKey = (n) => normalizeTeamName(trimAgeSuffix(n));
  const shieldByName = useMemo(() => {
    const map = {};
    for (const r of standingsRes.data?.table || []) {
      const key = teamKey(r.team);
      if (key && r.shield) map[key] = r.shield;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsRes.data]);
  const resolveShield = (name) => shieldByName[teamKey(name)] || null;
  const teamsRes = useApi(fetchTeams, []);
  const [uploadOpen, setUploadOpen] = useState(false);

  const matches = matchesRes.data?.matches || [];
  const teams = teamsRes.data?.teams || [];
  const ourTeam = selectedTeam || teams.find((t) => t.id === selectedTeamId) || teams.find((t) => t.isOurTeam);
  const lastMatchEntry = matches[0] || null;
  const lastMatchRes = useApi(
    () => (lastMatchEntry?.id ? fetchMatch(lastMatchEntry.id) : Promise.resolve(null)),
    [lastMatchEntry?.id]
  );
  const lastMatch = lastMatchRes.data;

  const totalGames = matches.length;

  // Сезон — показываем как «год окончания» (2025-2026 → 2026)
  const seasonRaw = matches[0]?.season || '2026';
  const season = (() => {
    const m = String(seasonRaw).match(/(\d{4})\s*[-–—]\s*(\d{4})/);
    return m ? m[2] : seasonRaw;
  })();

  // Турнир / Кубок — глобальный контекст. Переключатель живёт на /club.
  // Здесь только читаем и фильтруем список матчей.
  const { tournament } = useTournament();
  const filteredMatches = useMemo(
    () => matches.filter((m) => (m.tournament || 'league') === tournament),
    [matches, tournament]
  );

  // Все матчи сезона (детально) — нужны для блока «командные показатели против
  // сезона» (среднее по сезону). Догружаем параллельно деталь по каждому матчу.
  const [allMatches, setAllMatches] = useState([]);
  const matchIdsKey = useMemo(() => matches.map((m) => m.id).join('|'), [matches]);

  useEffect(() => {
    if (!matches.length) { setAllMatches([]); return undefined; }
    let cancelled = false;
    Promise.all(matches.map((m) => fetchMatch(m.id).catch(() => null)))
      .then((results) => { if (!cancelled) setAllMatches(results.filter(Boolean)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIdsKey]);

  const homeScore = lastMatch?.score?.home;
  const awayScore = lastMatch?.score?.away;

  // Игроки последнего матча для тепловой карты (с минутами — как фильтрует сам
  // компонент; ≥3 — иначе SquadHeatmap вернёт null, и карточка была бы пустой).
  const heatPlayers = useMemo(
    () => (lastMatch?.players || []).filter((p) => (p.minutes ?? 0) > 0),
    [lastMatch]
  );

  return (
    <div className="page matches-dashboard kinetic">
      {/* [1] ГЕРОЙ — счёт последнего матча, full-width, над заголовком сезона */}
      <Block page="matches" id="last-match">
      {lastMatch && (
        <Reveal variant="slide-up" duration={0.7} delay={0} className="matches-dashboard__hero-kinetic">
          <KineticCard glow className="card matches-dashboard__last matches-dashboard__last--hero">
            <div className="page-section-title">Сводка последнего матча</div>
            <div className="matches-dashboard__last-body">
              <div className="matches-dashboard__last-date">{fmtDate(lastMatch.date)}</div>
              <div className="matches-dashboard__last-teams matches-dashboard__last-teams--hero">
                <div className="matches-dashboard__last-team">
                  <LastTeamCrest name={lastMatch.homeTeam?.name} shield={lastMatch.homeTeam?.shield || resolveShield(lastMatch.homeTeam?.name)} hero />
                  <span>{cleanTeamName(lastMatch.homeTeam?.name) || 'Команда'}</span>
                </div>
                <div className="matches-dashboard__last-score matches-dashboard__last-score--hero">
                  <span className={homeScore != null && homeScore > awayScore ? 'win' : (homeScore != null && homeScore < awayScore ? 'loss' : '')}>
                    {homeScore != null
                      ? <AnimatedNumber value={Number(homeScore)} format={(v) => String(Math.round(v))} stiffness={120} damping={25} />
                      : '—'}
                  </span>
                  <span className="sep">:</span>
                  <span className={awayScore != null && awayScore > homeScore ? 'win' : (awayScore != null && awayScore < homeScore ? 'loss' : '')}>
                    {awayScore != null
                      ? <AnimatedNumber value={Number(awayScore)} format={(v) => String(Math.round(v))} stiffness={120} damping={25} />
                      : '—'}
                  </span>
                </div>
                <div className="matches-dashboard__last-team away">
                  <span>{cleanTeamName(lastMatch.awayTeam?.name) || 'Соперник'}</span>
                  <LastTeamCrest name={lastMatch.awayTeam?.name} shield={lastMatch.awayTeam?.shield || resolveShield(lastMatch.awayTeam?.name)} hero />
                </div>
              </div>
              <button
                className="matches-dashboard__last-btn"
                onClick={() => navigate(`/matches/${lastMatch.id}`)}
              >
                Открыть детали матча →
              </button>
            </div>
          </KineticCard>
        </Reveal>
      )}
      </Block>

      {/* Заголовок сезона */}
      <div className="matches-dashboard__hero">
        <div className="matches-dashboard__hero-text">
          <div className="matches-dashboard__hero-eyebrow">Сезон</div>
          <h1 className="matches-dashboard__hero-title"><SplitText text={String(season)} /></h1>
          <div className="matches-dashboard__hero-sub">
            {(ourTeam?.name || 'Команда').toUpperCase()} · {totalGames} {matchesWord(totalGames)} разобран{totalGames === 1 ? '' : 'о'}
            {tournament === 'cup' && <> · Кубок</>}
          </div>
        </div>
        {canUpload && (
          <button className="matches-dashboard__upload" onClick={() => setUploadOpen(true)}>
            + Загрузить отчёт Sportvisor
          </button>
        )}
      </div>

      <div className="matches-dashboard__grid">
        <aside className="matches-dashboard__col-left">
          <MatchList matches={filteredMatches} teams={teams} />
        </aside>

        <section className="matches-dashboard__col-right">
          {/* [2] Командные показатели последнего матча против сезонного среднего */}
          <Block page="matches" id="team-vs-season">
          {lastMatch && (
            <Reveal variant="slide-up" duration={0.55} delay={0.2}>
              <TeamMatchVsSeason
                match={lastMatch}
                allMatches={allMatches}
                title="Командные показатели против сезона"
              />
            </Reveal>
          )}
          </Block>

          {/* [3] Тепловая карта состава последнего матча */}
          <Block page="matches" id="squad-heatmap">
          {heatPlayers.length >= 3 && (
            <Reveal variant="slide-up" duration={0.55} delay={0.3}>
              <div className="card">
                <div className="page-section-title">Тепловая карта состава · последний матч</div>
                <SquadHeatmap players={lastMatch.players} />
              </div>
            </Reveal>
          )}
          </Block>

          {canUpload && (
            <div className="card">
              <div className="page-section-title">Подсказка</div>
              <div className="matches-dashboard__hint">
                Нажмите кнопку <b>«Загрузить отчёт Sportvisor»</b>, чтобы добавить новый матч. Парсер автоматически извлечёт командные показатели, индивидуальные метрики (105 на игрока) и тематические карты.
              </div>
            </div>
          )}
        </section>
      </div>

      {uploadOpen && (
        <PdfUploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={() => window.location.reload()}
        />
      )}
    </div>
  );
}

// Эмблема команды в сводке матча: через shieldFor (наш клуб → лого, соперник →
// инициал, т.к. внешнего щита в объекте матча нет). Единая точка эмблем проекта.
function LastTeamCrest({ name, shield = null, hero = false }) {
  const [errored, setErrored] = useState(false);
  const src = shieldFor(name || '', shield || '');
  if (!src || errored) {
    return (
      <span className={`matches-dashboard__last-placeholder${hero ? ' matches-dashboard__last-placeholder--hero' : ''}`} aria-hidden>
        {(name || '?').trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }
  return <img className={`matches-dashboard__last-crest${hero ? ' matches-dashboard__last-crest--hero' : ''}`} src={src} alt="" onError={() => setErrored(true)} />;
}

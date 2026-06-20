import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
// @ts-ignore — legacy .js client/util
import { fetchClubSummary, fetchClubTalent } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
// @ts-ignore — legacy .js util
import { ratingColor } from '../../utils/colors';
import './director.css';

/**
 * Кабинет спортивного директора клуба (sporting_director).
 * Клуб-scoped «выжимка как у федерации»: птичий обзор ВСЕХ команд клуба —
 * развитие по возрастам, кадровый резерв (таланты), символическая сборная,
 * лидеры. Только чтение. Данные — существующие /data/club/* (tenant-scoped).
 */
interface TeamRow {
  id: string; name?: string; ageLabel?: string | null; ageGroup?: string | null; year?: number | null;
  matchCount: number; avgOverall: number | null; avgAttack: number | null; avgDefence: number | null; avgFitness: number | null;
  trend: number | null; lastMatch: { date?: string; us: number; them: number; opp?: string; outcome: 'W' | 'L' | 'D' } | null; flags: string[];
}
interface TalentRow {
  id: string; fullName: string; photoUrl: string | null; matches: number; minutes: number;
  avgOverall: number | null; trend: number | null; goals: number; assists: number;
  teamLabel: string | null; position: string | null; positionCode: string | null; aboveTeam?: boolean;
}

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
const lineOf = (pos: string | null): Line | null => {
  const p = (pos ?? '').toLowerCase();
  if (/врат/.test(p)) return 'GK';
  if ((/защит/.test(p) || /фулбек/.test(p)) && !/полуз/.test(p)) return 'DEF';
  if (/полуз|опорн/.test(p)) return 'MID';
  if (/напад|форвард/.test(p)) return 'FWD';
  return null;
};
const LINES: Array<{ k: Line; label: string; n: number }> = [
  { k: 'GK', label: 'Вратарь', n: 1 }, { k: 'DEF', label: 'Защита', n: 4 },
  { k: 'MID', label: 'Полузащита', n: 3 }, { k: 'FWD', label: 'Атака', n: 3 },
];
const teamLabel = (t: TeamRow) => t.ageLabel || t.name || t.ageGroup || t.id;
const shortName = (s: string) => { const w = (s || '').trim().split(/\s+/); return w.length > 1 ? `${w[w.length - 1]} ${w[0][0]}.` : s; };
const initials = (s: string) => { const w = (s || '').trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || '?'; };
const trendMark = (t: number | null) => (t == null ? '' : t > 0.05 ? `▲ +${t}` : t < -0.05 ? `▼ ${t}` : '= 0');
const trendCls = (t: number | null) => (t == null ? '' : t > 0.05 ? 'up' : t < -0.05 ? 'down' : 'eq');

function Avatar({ name, photo, size = 40 }: { name: string; photo: string | null; size?: number }) {
  if (photo && /^https?:\/\//.test(photo)) return <img className="dir-av" src={photo} alt={name} width={size} height={size} style={{ width: size, height: size }} loading="lazy" />;
  return <span className="dir-av dir-av--ini" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>;
}

export function DirectorDashboard() {
  const { tenant, user, logout } = useAuth() as { tenant: { displayName?: string; name?: string } | null; user: { fullName?: string } | null; logout: () => void };
  const navigate = useNavigate();
  const sumQ = useQuery({ queryKey: ['dir', 'club-summary'], queryFn: () => fetchClubSummary() as Promise<{ teams: TeamRow[] }> });
  const talQ = useQuery({ queryKey: ['dir', 'club-talent'], queryFn: () => fetchClubTalent() as Promise<{ players: TalentRow[] }> });

  const teams = useMemo(() => {
    const t = (sumQ.data?.teams ?? []).slice();
    t.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)); // младшие сверху
    return t;
  }, [sumQ.data]);
  const talent = talQ.data?.players ?? [];

  const kpi = useMemo(() => {
    const rated = teams.filter((t) => t.avgOverall != null);
    const clubAvg = rated.length ? Math.round((rated.reduce((a, t) => a + (t.avgOverall as number), 0) / rated.length) * 100) / 100 : null;
    return { teams: teams.length, players: talent.length, matches: teams.reduce((a, t) => a + (t.matchCount || 0), 0), clubAvg };
  }, [teams, talent]);

  const bestXI = useMemo(() => {
    const byLine: Record<Line, TalentRow[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of talent) { const l = lineOf(p.position); if (l) byLine[l].push(p); } // talent уже по рейтингу DESC
    return LINES.map((L) => ({ ...L, players: byLine[L.k].slice(0, L.n) }));
  }, [talent]);

  const topScorer = useMemo(() => [...talent].sort((a, b) => b.goals - a.goals)[0] ?? null, [talent]);
  const topAssist = useMemo(() => [...talent].sort((a, b) => b.assists - a.assists)[0] ?? null, [talent]);

  const loading = sumQ.isLoading || talQ.isLoading;
  const clubName = tenant?.displayName || tenant?.name || 'Клуб';

  return (
    <div className="dir-root">
      <header className="dir-topbar">
        <div className="dir-brand">
          <span className="dir-brand__logo">Avan<b>Data</b></span>
          <span className="dir-brand__role">Спортивный директор · {clubName}</span>
        </div>
        <div className="dir-topbar__r">
          <span className="dir-who">{user?.fullName || 'Спортивный директор'}</span>
          <button className="dir-logout" onClick={() => { logout(); navigate('/login', { replace: true }); }}>Выйти</button>
        </div>
      </header>

      <main className="dir-main">
        <div className="dir-head">
          <h1 className="dir-title">Обзор клуба</h1>
          <p className="dir-sub">Все команды клуба сразу — развитие, кадровый резерв, сборная</p>
        </div>

        {loading && <div className="dir-skeleton" />}
        {!loading && (sumQ.isError || talQ.isError) && <div className="dir-note dir-note--err">База клуба временно недоступна — обновите страницу.</div>}

        {!loading && !sumQ.isError && (
          <>
            {/* KPI */}
            <section className="dir-kpis">
              <Kpi label="Команд в клубе" value={kpi.teams} />
              <Kpi label="Разобрано матчей" value={kpi.matches} />
              <Kpi label="Игроков в резерве" value={kpi.players} />
              <Kpi label="Средний рейтинг клуба" value={kpi.clubAvg ?? '—'} color={kpi.clubAvg != null ? ratingColor(kpi.clubAvg) : undefined} />
            </section>

            {/* Развитие по возрастам */}
            <section className="dir-card">
              <div className="dir-card__head"><h2>Развитие по возрастам</h2><span>рейтинг команды · тренд · последний матч</span></div>
              {teams.length === 0 ? <div className="dir-note">Нет команд.</div> : (
                <div className="dir-vert">
                  {teams.map((t) => (
                    <div key={t.id} className="dir-vrow">
                      <span className="dir-vrow__age">{teamLabel(t)}</span>
                      <span className="dir-vrow__track">
                        <span className="dir-vrow__fill" style={{ width: `${((t.avgOverall ?? 0) / 10) * 100}%`, background: ratingColor(t.avgOverall ?? 0) }} />
                      </span>
                      <span className="dir-vrow__rate" style={{ color: ratingColor(t.avgOverall ?? 0) }}>{t.avgOverall ?? '—'}</span>
                      <span className={`dir-trend dir-trend--${trendCls(t.trend)}`}>{trendMark(t.trend)}</span>
                      <span className="dir-vrow__last">
                        {t.lastMatch ? <><b className={`dir-out dir-out--${t.lastMatch.outcome}`}>{t.lastMatch.us}:{t.lastMatch.them}</b> {t.lastMatch.opp ?? ''}</> : <i className="dir-dim">нет матчей</i>}
                      </span>
                      {t.flags?.length > 0 && <span className="dir-flags">{t.flags.map((f, i) => <i key={i} className="dir-flag">{f}</i>)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="dir-cols">
              {/* Сборная клуба */}
              <section className="dir-card">
                <div className="dir-card__head"><h2>Сборная клуба</h2><span>лучшие по позициям, все команды</span></div>
                {talent.length < 4 ? <div className="dir-note">Мало данных для сборной.</div> : (
                  <div className="dir-xi">
                    {bestXI.map((L) => (
                      <div key={L.k} className="dir-xi__line">
                        <div className="dir-xi__label">{L.label}</div>
                        <div className="dir-xi__slots">
                          {L.players.length === 0 ? <span className="dir-dim dir-xi__empty">—</span> : L.players.map((p) => (
                            <div key={p.id} className="dir-xi__slot" title={`${p.fullName} · ${p.teamLabel ?? ''}`}>
                              <Avatar name={p.fullName} photo={p.photoUrl} size={38} />
                              <span className="dir-xi__name">{shortName(p.fullName)}</span>
                              <span className="dir-xi__rate" style={{ color: ratingColor(p.avgOverall ?? 0) }}>{p.avgOverall ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Лидеры */}
              <section className="dir-card">
                <div className="dir-card__head"><h2>Лидеры клуба</h2><span>по сезону</span></div>
                <div className="dir-leaders">
                  {topScorer && <LeaderCard label="Бомбардир" p={topScorer} stat={`${topScorer.goals} голов`} />}
                  {topAssist && <LeaderCard label="Ассистент" p={topAssist} stat={`${topAssist.assists} передач`} />}
                  {talent[0] && <LeaderCard label="Лучший рейтинг" p={talent[0]} stat={`${talent[0].avgOverall ?? '—'} рейтинг`} accent={ratingColor(talent[0].avgOverall ?? 0)} />}
                </div>
              </section>
            </div>

            {/* Таланты клуба */}
            <section className="dir-card">
              <div className="dir-card__head"><h2>Кадровый резерв</h2><span>топ игроков по всем командам · ↑ заметно выше своей команды</span></div>
              {talent.length === 0 ? <div className="dir-note">Нет разобранных игроков.</div> : (
                <div className="dir-talent">
                  {talent.slice(0, 12).map((p, i) => (
                    <div key={p.id} className="dir-tcard">
                      <span className="dir-tcard__rank">{i + 1}</span>
                      <Avatar name={p.fullName} photo={p.photoUrl} size={40} />
                      <div className="dir-tcard__id">
                        <div className="dir-tcard__name" title={p.fullName}>{shortName(p.fullName)}{p.aboveTeam && <i className="dir-up" title="заметно выше своей команды"> ↑</i>}</div>
                        <div className="dir-tcard__meta">{p.teamLabel ?? '—'}{p.position ? ` · ${p.position}` : ''}</div>
                      </div>
                      <span className="dir-tcard__rate" style={{ color: ratingColor(p.avgOverall ?? 0) }}>{p.avgOverall ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="dir-kpi">
      <div className="dir-kpi__label">{label}</div>
      <div className="dir-kpi__value" style={color ? { color } : undefined}>{typeof value === 'number' ? value.toLocaleString('ru-RU') : value}</div>
    </div>
  );
}
function LeaderCard({ label, p, stat, accent }: { label: string; p: TalentRow; stat: string; accent?: string }) {
  return (
    <div className="dir-leader">
      <div className="dir-leader__label">{label}</div>
      <div className="dir-leader__body">
        <Avatar name={p.fullName} photo={p.photoUrl} size={34} />
        <div className="dir-leader__id"><div className="dir-leader__name">{shortName(p.fullName)}</div><div className="dir-leader__team">{p.teamLabel ?? '—'}</div></div>
        <div className="dir-leader__stat" style={accent ? { color: accent } : undefined}>{stat}</div>
      </div>
    </div>
  );
}

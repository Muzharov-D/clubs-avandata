/**
 * ClubHub — ЕДИНЫЙ кабинет старшего тренера клуба (head_coach).
 *
 * Слияние прежних домов «старшего тренера» и «спортивного директора» в один
 * экран (роли объединены — см. миграцию 0019). «Крыша» над командными экранами:
 * птичий вид на ВЕСЬ клуб + инструменты решений.
 *
 *  - Требует внимания: где падает форма команд + кого недоигрывают (сильные с малыми минутами).
 *  - Пульс клуба: карточки всех команд (рейтинг, тренд, последний матч). Клик → нырок в команду.
 *  - Вертикаль развития: уровень по возрастам (общий/атака/оборона).
 *  - Кого теряет клуб: воронка игрового времени по кварталу рождения.
 *  - Сборная клуба + Лидеры: символическая XI по позициям и бомбардир/ассистент/рейтинг.
 *  - Кадровый резерв: восходящие игроки клуба.
 *  - Тренерский состав.
 *
 * Данные — /data/club/{summary,talent,loss-map} (агрегаты, tenant-scoped).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { fetchClubSummary, fetchClubTalent, fetchClubLossMap } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ratingColor } from '../utils/colors';
import PlayerPhoto from '../components/PlayerPhoto';
import { num } from '../utils/num';
import './ClubHub.css';
import '../routes/director/director.css';

// Метрики «Вертикали развития» — общий/атака/оборона по командам (с бэка).
const V_METRICS = [
  { key: 'overall', label: 'Общий' },
  { key: 'attack', label: 'Атака' },
  { key: 'defence', label: 'Оборона' },
];
const V_KEY = { overall: 'avgOverall', attack: 'avgAttack', defence: 'avgDefence' };

// Линии для символической сборной клуба.
const LINES = [
  { k: 'GK', label: 'Вратарь', n: 1 }, { k: 'DEF', label: 'Защита', n: 4 },
  { k: 'MID', label: 'Полузащита', n: 3 }, { k: 'FWD', label: 'Атака', n: 3 },
];
function lineOf(pos) {
  const p = (pos ?? '').toLowerCase();
  if (/врат/.test(p)) return 'GK';
  if ((/защит/.test(p) || /фулбек/.test(p)) && !/полуз/.test(p)) return 'DEF';
  if (/полуз|опорн/.test(p)) return 'MID';
  if (/напад|форвард/.test(p)) return 'FWD';
  return null;
}

// Тон рейтинга для цвета (как в остальном UI: зелёный — топ, красный — низ).
function tone(v) {
  if (v == null) return 'na';
  if (v >= 8) return 'hi';
  if (v >= 7) return 'good';
  if (v >= 6) return 'mid';
  return 'low';
}
// Цвет доли игрового времени, % (0–100): своя шкала, НЕ rating-шкала. <15 красный … ≥50 зелёный.
function lossColor(pct) {
  return pct >= 50 ? 'var(--rating-excellent)' : pct >= 30 ? 'var(--rating-ok)' : pct >= 15 ? 'var(--rating-weak)' : 'var(--rating-poor)';
}
const shortName = (s) => { const w = (s || '').trim().split(/\s+/); return w.length > 1 ? `${w[w.length - 1]} ${w[0][0]}.` : s; };
const trendMark = (t) => (t == null ? '' : t > 0.05 ? `▲ +${t}` : t < -0.05 ? `▼ ${t}` : '= 0');

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function teamLabel(t) {
  return t.ageLabel || t.name || t.ageGroup || t.id;
}

export default function ClubHub() {
  const navigate = useNavigate();
  const { tenant } = useAuth();
  const { select } = useTeam();
  useDocumentTitle('Кабинет клуба');

  const res = useApi(() => fetchClubSummary().catch(() => ({ teams: [] })), []);
  const teams = res.data?.teams || [];
  const talentRes = useApi(() => fetchClubTalent().catch(() => ({ players: [] })), []);
  const talent = talentRes.data?.players || [];
  const lossRes = useApi(() => fetchClubLossMap().catch(() => ({ hasData: false, byQuarter: [], examplesBuried: [] })), []);
  const loss = lossRes.data;
  const [vMetric, setVMetric] = useState('overall');

  const openTeam = (id) => { select(id); navigate('/club'); };

  // Сводка клуба: сколько команд, разобрано матчей, средний рейтинг по клубу.
  const rated = teams.filter((t) => t.avgOverall != null);
  const clubAvg = rated.length
    ? Math.round((rated.reduce((a, t) => a + t.avgOverall, 0) / rated.length) * 100) / 100
    : null;
  const totalMatches = teams.reduce((a, t) => a + (t.matchCount || 0), 0);
  const alerts = teams.filter((t) => (t.flags || []).length > 0).length;

  // Радар внимания: где горит (флаги/падающая форма) + сильные игроки, которым мало дают играть.
  const fadingTeams = teams.filter((t) => (t.flags?.length ?? 0) > 0 || (t.trend != null && t.trend <= -0.3));
  const mins = talent.map((p) => p.minutes).filter((m) => m > 0).sort((a, b) => a - b);
  const medMin = mins.length ? mins[Math.floor(mins.length / 2)] : 0;
  const underused = talent
    .filter((p) => p.avgOverall != null && p.avgOverall >= 7 && medMin > 0 && p.minutes < medMin * 0.6)
    .sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0))
    .slice(0, 6);

  // Сборная клуба (talent уже по рейтингу DESC) + лидеры.
  const byLine = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of talent) { const l = lineOf(p.position); if (l) byLine[l].push(p); }
  const bestXI = LINES.map((L) => ({ ...L, players: byLine[L.k].slice(0, L.n) }));
  const topScorer = [...talent].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0] || null;
  const topAssist = [...talent].sort((a, b) => (b.assists || 0) - (a.assists || 0))[0] || null;

  const maxRating = 10;

  if (res.loading && teams.length === 0) {
    return <div className="page club-hub"><div className="empty-state">Загрузка кабинета клуба…</div></div>;
  }
  if (teams.length === 0) {
    return <div className="page club-hub"><div className="empty-state">Команды клуба ещё не заведены.</div></div>;
  }

  return (
    <div className="page club-hub">
      {/* HERO */}
      <div className="club-hub__hero card">
        <div>
          <div className="club-hub__eyebrow">Кабинет старшего тренера</div>
          <h1 className="club-hub__title">{tenant?.name || 'Клуб'}</h1>
          <div className="club-hub__lede">Весь клуб на одном экране — развитие, кадровый резерв, сборная; нырните в любую команду.</div>
        </div>
        <div className="club-hub__kpis">
          <div className="club-hub__kpi"><div className="club-hub__kpi-n">{teams.length}</div><div className="club-hub__kpi-l">команд</div></div>
          <div className="club-hub__kpi"><div className="club-hub__kpi-n">{totalMatches}</div><div className="club-hub__kpi-l">разобрано матчей</div></div>
          <div className="club-hub__kpi"><div className={`club-hub__kpi-n club-hub__kpi-n--${tone(clubAvg)}`}>{clubAvg != null ? clubAvg.toFixed(2) : '—'}</div><div className="club-hub__kpi-l">средний рейтинг клуба</div></div>
          <div className="club-hub__kpi"><div className={`club-hub__kpi-n ${alerts > 0 ? 'club-hub__kpi-n--low' : 'club-hub__kpi-n--hi'}`}>{alerts}</div><div className="club-hub__kpi-l">требуют внимания</div></div>
        </div>
      </div>

      {/* ТРЕБУЕТ ВНИМАНИЯ — падающая форма + кого недоигрывают */}
      {(fadingTeams.length > 0 || underused.length > 0) && (
        <>
          <div className="page-section-title">Требует внимания <span className="club-hub__sub">где падает форма · кого недоигрывают</span></div>
          <div className="card" style={{ padding: 16 }}>
            <div className="dir-attn">
              {fadingTeams.map((t) => (
                <button type="button" key={`t-${t.id}`} className="dir-attn__item" onClick={() => openTeam(t.id)} style={{ textAlign: 'left', cursor: 'pointer' }}>
                  <span className="dir-attn__ic dir-attn__ic--down">▼</span>
                  <div className="dir-attn__body">
                    <div className="dir-attn__t">{teamLabel(t)}</div>
                    <div className="dir-attn__d">{t.flags && t.flags.length ? t.flags.join(' · ') : `форма падает (${trendMark(t.trend)})`}</div>
                  </div>
                </button>
              ))}
              {underused.map((p) => (
                <button type="button" key={`p-${p.id}`} className="dir-attn__item" onClick={() => navigate(`/players/${p.id}`)} style={{ textAlign: 'left', cursor: 'pointer' }}>
                  <span className="dir-attn__ic dir-attn__ic--wait">⏳</span>
                  <div className="dir-attn__body">
                    <div className="dir-attn__t">{shortName(p.fullName)} <b style={{ color: ratingColor(p.avgOverall ?? 0) }}>{p.avgOverall}</b></div>
                    <div className="dir-attn__d">сильный, но мало играет — {Math.round(p.minutes)} мин · {p.matches} матч.{p.teamLabel ? ` · ${p.teamLabel}` : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ПУЛЬС КЛУБА */}
      <div className="page-section-title">Пульс клуба</div>
      <div className="club-hub__pulse">
        {teams.map((t) => {
          const lm = t.lastMatch;
          return (
            <button type="button" key={t.id} className="club-hub__card" onClick={() => openTeam(t.id)}>
              <div className="club-hub__card-top">
                <div className="club-hub__card-name">{teamLabel(t)}</div>
                <div className={`club-hub__rating club-hub__rating--${tone(t.avgOverall)}`}>
                  {t.avgOverall != null ? t.avgOverall.toFixed(1) : '—'}
                </div>
              </div>
              <div className="club-hub__card-meta">
                {t.trend != null && t.trend !== 0 && (
                  <span className={`club-hub__trend ${t.trend > 0 ? 'is-up' : 'is-down'}`}>
                    {t.trend > 0 ? '▲' : '▼'} {Math.abs(t.trend).toFixed(1)}
                  </span>
                )}
                <span className="club-hub__mc">{t.matchCount ?? 0} {matchesWord(t.matchCount ?? 0)}</span>
              </div>
              {lm ? (
                <div className={`club-hub__last club-hub__last--${lm.outcome}`}>
                  <span className="club-hub__last-res">{lm.outcome === 'W' ? 'В' : lm.outcome === 'L' ? 'П' : 'Н'}</span>
                  <span className="club-hub__last-score">{num(lm.us)}:{num(lm.them)}</span>
                  <span className="club-hub__last-opp">{lm.opp || ''}</span>
                  <span className="club-hub__last-date">{fmtDate(lm.date)}</span>
                </div>
              ) : (
                <div className="club-hub__last club-hub__last--none">матчей пока нет</div>
              )}
              {(t.flags || []).length > 0 && (
                <div className="club-hub__flags">
                  {t.flags.map((f) => <span key={f} className="club-hub__flag">⚠ {f}</span>)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ВЕРТИКАЛЬ РАЗВИТИЯ */}
      <div className="page-section-title">Вертикаль развития
        <span className="club-hub__vtabs">
          {V_METRICS.map((m) => (
            <button key={m.key} type="button"
              className={`club-hub__vtab${vMetric === m.key ? ' is-active' : ''}`}
              onClick={() => setVMetric(m.key)}>{m.label}</button>
          ))}
        </span>
      </div>
      <div className="club-hub__vertical card">
        {teams.map((t) => {
          const v = t[V_KEY[vMetric]];
          return (
            <button type="button" key={t.id} className="club-hub__vrow" onClick={() => openTeam(t.id)}>
              <span className="club-hub__vname">{teamLabel(t)}</span>
              <span className="club-hub__vtrack">
                <span
                  className={`club-hub__vfill club-hub__vfill--${tone(v)}`}
                  style={{ width: `${v != null ? Math.round((v / maxRating) * 100) : 0}%` }}
                />
              </span>
              <span className={`club-hub__vval club-hub__vval--${tone(v)}`}>{v != null ? v.toFixed(1) : '—'}</span>
            </button>
          );
        })}
      </div>

      {/* КОГО ТЕРЯЕТ КЛУБ — воронка игрового времени по кварталу рождения */}
      {loss?.hasData && (
        <>
          <div className="page-section-title">Кого теряет клуб <span className="club-hub__sub">игровое время по кварталу рождения · кто меньше играет</span></div>
          <div className="card" style={{ padding: 18 }}>
            <div className="dir-loss">
              {loss.byQuarter.map((q) => (
                <div key={q.q} className={`dir-lossq${q.q === 4 ? ' dir-lossq--late' : ''}`}>
                  <div className="dir-lossq__h"><b>Q{q.q}</b><span>{q.roster} игр.</span></div>
                  <div className="dir-lossq__track">
                    <span className="dir-lossq__fill" style={{ width: `${Math.min(100, q.medianPct)}%`, background: lossColor(q.medianPct) }} />
                  </div>
                  {q.roster === 0 ? (
                    <div className="dir-lossq__med dir-dim">нет данных</div>
                  ) : (
                    <>
                      <div className="dir-lossq__med">медиана {q.medianPct}%</div>
                      <div className="dir-lossq__buried">на скамейке &lt;15%: <b>{q.buried15}%</b></div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="dir-loss__note">Поздно рождённые (Q3–Q4) системно получают меньше игрового времени — это тормозит их развитие.</p>
            {loss.examplesBuried?.length > 0 && (
              <div className="dir-loss__ex">
                <span className="dir-loss__ex-lbl">Q4 почти не играют:</span>
                {loss.examplesBuried.map((e, i) => (
                  <span key={i} className="dir-loss__ex-item">{shortName(e.name)} <b>{e.pct}%</b>{e.team ? ` · ${e.team}` : ''}</span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* СБОРНАЯ КЛУБА + ЛИДЕРЫ */}
      <div className="dir-cols" style={{ marginTop: 8 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="dir-card__head"><h2>Сборная клуба</h2><span>лучшие по позициям, все команды</span></div>
          {talent.length < 4 ? <div className="dir-note">Мало данных для сборной.</div> : (
            <div className="dir-xi">
              {bestXI.map((L) => (
                <div key={L.k} className="dir-xi__line">
                  <div className="dir-xi__label">{L.label}</div>
                  <div className="dir-xi__slots">
                    {L.players.length === 0 ? <span className="dir-dim dir-xi__empty">—</span> : L.players.map((p) => (
                      <button type="button" key={p.id} className="dir-xi__slot" onClick={() => navigate(`/players/${p.id}`)} title={`${p.fullName} · ${p.teamLabel ?? ''}`}>
                        <PlayerPhoto player={p} size={38} />
                        <span className="dir-xi__name">{shortName(p.fullName)}</span>
                        <span className="dir-xi__rate" style={{ color: ratingColor(p.avgOverall ?? 0) }}>{p.avgOverall ?? '—'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="dir-card__head"><h2>Лидеры клуба</h2><span>по сезону</span></div>
          <div className="dir-leaders">
            {topScorer && <LeaderCard label="Бомбардир" p={topScorer} stat={`${topScorer.goals} голов`} onOpen={() => navigate(`/players/${topScorer.id}`)} />}
            {topAssist && <LeaderCard label="Ассистент" p={topAssist} stat={`${topAssist.assists} передач`} onOpen={() => navigate(`/players/${topAssist.id}`)} />}
            {talent[0] && <LeaderCard label="Лучший рейтинг" p={talent[0]} stat={`${talent[0].avgOverall ?? '—'} рейтинг`} accent={ratingColor(talent[0].avgOverall ?? 0)} onOpen={() => navigate(`/players/${talent[0].id}`)} />}
          </div>
        </div>
      </div>

      {/* КАДРОВЫЙ РЕЗЕРВ — восходящие игроки клуба */}
      {talent.length > 0 && (
        <>
          <div className="page-section-title">Кадровый резерв <span className="club-hub__sub">лучшие по рейтингу сезона</span></div>
          <div className="club-hub__talent">
            {talent.slice(0, 12).map((p) => (
              <button type="button" key={p.id} className="club-hub__player" onClick={() => navigate(`/players/${p.id}`)}>
                <PlayerPhoto player={p} size={44} />
                <div className="club-hub__player-info">
                  <div className="club-hub__player-name">
                    {p.fullName}
                    {p.aboveTeam && teams.length > 1 && <span className="club-hub__up" title="Заметно выше среднего своей команды — кандидат двигать выше">▲ выше команды</span>}
                  </div>
                  <div className="club-hub__player-meta">{[p.teamLabel, p.position].filter(Boolean).join(' · ')}</div>
                  <div className="club-hub__player-stats">
                    {(p.goals > 0 || p.assists > 0) && <span>{p.goals} г · {p.assists} п</span>}
                    {p.trend != null && p.trend !== 0 && (
                      <span className={p.trend > 0 ? 'is-up' : 'is-down'}>{p.trend > 0 ? '▲' : '▼'} {Math.abs(p.trend).toFixed(1)}</span>
                    )}
                    <span>{p.matches} {matchesWord(p.matches)}</span>
                  </div>
                </div>
                <div className={`club-hub__player-rating club-hub__rating--${tone(p.avgOverall)}`}>{p.avgOverall != null ? p.avgOverall.toFixed(1) : '—'}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ТРЕНЕРСКИЙ СОСТАВ */}
      {teams.some((t) => t.headCoach) && (
        <>
          <div className="page-section-title">Тренерский состав</div>
          <div className="club-hub__staff card">
            {teams.filter((t) => t.headCoach).map((t) => (
              <button type="button" key={t.id} className="club-hub__staffrow" onClick={() => openTeam(t.id)}>
                <span className="club-hub__staff-coach">{t.headCoach}</span>
                <span className="club-hub__staff-team">{teamLabel(t)}</span>
                <span className="club-hub__staff-meta">
                  {t.avgOverall != null && <span className={`club-hub__vval--${tone(t.avgOverall)}`}>{t.avgOverall.toFixed(1)}</span>}
                  {t.trend != null && t.trend !== 0 && (
                    <span className={`club-hub__trend ${t.trend > 0 ? 'is-up' : 'is-down'}`} style={{ marginLeft: 8 }}>
                      {t.trend > 0 ? '▲' : '▼'} {Math.abs(t.trend).toFixed(1)}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LeaderCard({ label, p, stat, accent, onOpen }) {
  return (
    <button type="button" className="dir-leader" onClick={onOpen} style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      <div className="dir-leader__label">{label}</div>
      <div className="dir-leader__body">
        <PlayerPhoto player={p} size={34} />
        <div className="dir-leader__id"><div className="dir-leader__name">{shortName(p.fullName)}</div><div className="dir-leader__team">{p.teamLabel ?? '—'}</div></div>
        <div className="dir-leader__stat" style={accent ? { color: accent } : undefined}>{stat}</div>
      </div>
    </button>
  );
}

function matchesWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'матч';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'матча';
  return 'матчей';
}

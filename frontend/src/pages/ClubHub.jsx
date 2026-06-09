/**
 * ClubHub — кабинет старшего тренера клуба (head_coach).
 *
 * «Крыша» над командными экранами: птичий вид на ВСЕ команды клуба сразу
 * (U8…U18), чтобы видеть «где горит» и нырять в нужную команду. Командные
 * экраны (/club, /analytics, …) остаются детальными «комнатами».
 *
 *  - Пульс клуба: карточки всех команд (рейтинг сезона, тренд, последний матч,
 *    флаги тревоги). Клик по карточке → выбрать команду и открыть её /club.
 *  - Вертикаль развития: уровень команд по возрастам — видно сильное/слабое
 *    поколение и обрыв между возрастами.
 *
 * Данные — из /data/club/summary (агрегат поверх matches.team_avg_ratings).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import { fetchClubSummary, fetchClubTalent } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PlayerPhoto from '../components/PlayerPhoto';
import { num } from '../utils/num';
import './ClubHub.css';

// Метрики «Вертикали развития» — общий/атака/оборона по командам (с бэка).
const V_METRICS = [
  { key: 'overall', label: 'Общий' },
  { key: 'attack', label: 'Атака' },
  { key: 'defence', label: 'Оборона' },
];
const V_KEY = { overall: 'avgOverall', attack: 'avgAttack', defence: 'avgDefence' };

// Тон рейтинга для цвета (как в остальном UI: зелёный — топ, красный — низ).
function tone(v) {
  if (v == null) return 'na';
  if (v >= 8) return 'hi';
  if (v >= 7) return 'good';
  if (v >= 6) return 'mid';
  return 'low';
}

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
  useDocumentTitle('Обзор клуба');

  const res = useApi(() => fetchClubSummary().catch(() => ({ teams: [] })), []);
  const teams = res.data?.teams || [];
  const talentRes = useApi(() => fetchClubTalent().catch(() => ({ players: [] })), []);
  const talent = talentRes.data?.players || [];
  const [vMetric, setVMetric] = useState('overall');

  const openTeam = (id) => { select(id); navigate('/club'); };

  // Сводка клуба: сколько команд, разобрано матчей, средний рейтинг по клубу.
  const rated = teams.filter((t) => t.avgOverall != null);
  const clubAvg = rated.length
    ? Math.round((rated.reduce((a, t) => a + t.avgOverall, 0) / rated.length) * 100) / 100
    : null;
  const totalMatches = teams.reduce((a, t) => a + (t.matchCount || 0), 0);
  const alerts = teams.filter((t) => (t.flags || []).length > 0).length;

  // Для вертикали — порядок как с бэкенда (год DESC: младшие сверху).
  const maxRating = 10;

  if (res.loading && teams.length === 0) {
    return <div className="page club-hub"><div className="empty-state">Загрузка обзора клуба…</div></div>;
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
          <div className="club-hub__lede">Все команды клуба на одном экране — нырните в любую возрастную группу.</div>
        </div>
        <div className="club-hub__kpis">
          <div className="club-hub__kpi"><div className="club-hub__kpi-n">{teams.length}</div><div className="club-hub__kpi-l">команд</div></div>
          <div className="club-hub__kpi"><div className="club-hub__kpi-n">{totalMatches}</div><div className="club-hub__kpi-l">разобрано матчей</div></div>
          <div className="club-hub__kpi"><div className={`club-hub__kpi-n club-hub__kpi-n--${tone(clubAvg)}`}>{clubAvg != null ? clubAvg.toFixed(2) : '—'}</div><div className="club-hub__kpi-l">средний рейтинг клуба</div></div>
          <div className="club-hub__kpi"><div className={`club-hub__kpi-n ${alerts > 0 ? 'club-hub__kpi-n--low' : 'club-hub__kpi-n--hi'}`}>{alerts}</div><div className="club-hub__kpi-l">требуют внимания</div></div>
        </div>
      </div>

      {/* ТРЕБУЕТ ВНИМАНИЯ — флаги как список действий */}
      {teams.some((t) => (t.flags || []).length > 0) && (
        <>
          <div className="page-section-title">Требует внимания</div>
          <div className="club-hub__alerts">
            {teams.filter((t) => (t.flags || []).length > 0).map((t) => (
              <button type="button" key={t.id} className="club-hub__alert" onClick={() => openTeam(t.id)}>
                <span className="club-hub__alert-team">{teamLabel(t)}</span>
                <span className="club-hub__alert-flags">
                  {t.flags.map((f) => <span key={f} className="club-hub__flag">⚠ {f}</span>)}
                </span>
                <span className="club-hub__alert-go">Открыть →</span>
              </button>
            ))}
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

      {/* ВОСХОДЯЩИЕ ИГРОКИ КЛУБА (кадровый резерв) */}
      {talent.length > 0 && (
        <>
          <div className="page-section-title">Восходящие игроки клуба <span className="club-hub__sub">лучшие по рейтингу сезона</span></div>
          <div className="club-hub__talent">
            {talent.slice(0, 12).map((p) => (
              <button type="button" key={p.id} className="club-hub__player" onClick={() => navigate(`/players/${p.id}`)}>
                <PlayerPhoto player={p} size={44} />
                <div className="club-hub__player-info">
                  <div className="club-hub__player-name">
                    {p.fullName}
                    {/* Бейдж осмыслен только при нескольких командах: при одной
                        весь топ закономерно выше среднего → шум. */}
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

function matchesWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'матч';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'матча';
  return 'матчей';
}

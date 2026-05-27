// /calendar — единая страница расписания: матчи + тренировки.
// Два режима: «Список» (хронологический список) и «Неделя» (7-дневная сетка).
//
// Источники:
//   GET /api/data/calendar/:age — матчи с ffspb
//   GET /api/trainings/team/:teamId — тренировки команды (только для тренеров/игроков)

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchCalendar, fetchCalendarList, fetchTrainingsByTeam } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import CallupRoster from '../components/CallupRoster';
import MatchDetailSheet from '../components/MatchDetailSheet';
import TrainingDetailSheet from '../components/TrainingDetailSheet';
import CoachCommentForm from '../components/CoachCommentForm';
import { shieldFor, isLegirus } from '../utils/legirus';
import './CalendarPage.css';

const FILTERS = [
  { id: 'upcoming', label: 'Будущие' },
  { id: 'past',     label: 'Сыгранные' },
  { id: 'all',      label: 'Все' },
];

const TRAINING_TYPES = {
  training: { label: 'Тренировка', icon: '🏃' },
  extra:    { label: 'Доп. занятие', icon: '⚡' },
  warmup:   { label: 'Разминка', icon: '🔥' },
  recovery: { label: 'Восстановление', icon: '💧' },
  meet:     { label: 'Сбор', icon: '👥' },
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtDayHeader(d) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = startOfDay(d);
  const ms = day.getTime();
  if (ms === today.getTime()) return 'Сегодня';
  if (ms === tomorrow.getTime()) return 'Завтра';
  return day.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' });
}
function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

export default function CalendarPage() {
  const { selectedTeam } = useTeam();
  const { isCoach, user } = useAuth();
  const [openCallup, setOpenCallup] = useState(null);
  const [openMatch, setOpenMatch] = useState(null);
  const [openTraining, setOpenTraining] = useState(null);

  // Список доступных возрастных групп
  const listRes = useApi(fetchCalendarList, []);
  const ages = listRes.data?.ageGroups || [];

  const yearStr = selectedTeam?.year ? String(selectedTeam.year) : null;
  const defaultAge = (yearStr && ages.includes(yearStr)) ? yearStr
    : (ages.includes('2010') ? '2010' : ages[0]);

  const [age, setAge] = useState(defaultAge);
  const [filter, setFilter] = useState('upcoming');
  const [scope, setScope] = useState('ours'); // 'ours' | 'all'
  const [view, setView] = useState('list');     // 'list' | 'week' (месячный календарь)
  // Какой месяц показываем в календаре. Stack-state — Date в первый день месяца.
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  });

  useEffect(() => {
    if (ages.length > 0 && !ages.includes(age)) setAge(defaultAge || ages[0]);
  }, [listRes.data]);

  // === ОДНА команда ===
  const calRes = useApi(
    () => (age && age !== 'all') ? fetchCalendar(age) : Promise.resolve(null),
    [age]);
  const cal = calRes.data;
  const singleMatches = cal?.matches || [];

  // Тренировки команды
  const teamId = selectedTeam?.id || (age && age !== 'all' ? `legirus-${age}` : null);
  const showTrainings = !!user && !!teamId;
  const trRes = useApi(
    () => showTrainings ? fetchTrainingsByTeam(teamId, { scope: 'all', limit: 100 })
                        : Promise.resolve({ trainings: [] }),
    [teamId, showTrainings]);
  const singleTrainings = trRes.data?.trainings || [];

  // === ВСЕ команды (только head_coach с age='all') ===
  // Параллельно тянем calendar + trainings для каждого ages, подмешиваем ageGroup в каждое событие.
  const [allMatches, setAllMatches] = useState([]);
  const [allTrainings, setAllTrainings] = useState([]);
  const [allLoading, setAllLoading] = useState(false);

  useEffect(() => {
    if (age !== 'all' || !ages.length) {
      setAllMatches([]); setAllTrainings([]); setAllLoading(false);
      return;
    }
    let cancelled = false;
    setAllLoading(true);
    Promise.all(ages.map((a) =>
      Promise.all([
        fetchCalendar(a).catch(() => null),
        fetchTrainingsByTeam(`legirus-${a}`, { scope: 'all', limit: 100 }).catch(() => ({ trainings: [] })),
      ]).then(([cal, tr]) => ({ age: a, cal, tr: tr?.trainings || [] }))
    )).then((arr) => {
      if (cancelled) return;
      const ms = []; const ts = [];
      for (const { age: a, cal, tr } of arr) {
        for (const m of (cal?.matches || [])) ms.push({ ...m, ageGroup: a });
        for (const t of tr) ts.push({ ...t, ageGroup: a });
      }
      setAllMatches(ms);
      setAllTrainings(ts);
    }).finally(() => { if (!cancelled) setAllLoading(false); });
    return () => { cancelled = true; };
  }, [age, ages.join(',')]);

  // Объединённые источники: либо одна команда, либо все
  const matches = age === 'all' ? allMatches : singleMatches;
  const trainings = age === 'all' ? allTrainings : singleTrainings;

  // === LIST view ===
  const listFiltered = useMemo(() => {
    let arr = matches;
    if (scope === 'ours') arr = arr.filter((m) => m.isOurMatch);
    if (filter === 'upcoming') arr = arr.filter((m) => m.isUpcoming);
    if (filter === 'past')     arr = arr.filter((m) => m.isPast);
    return arr;
  }, [matches, filter, scope]);

  const ourTotal = useMemo(() => matches.filter((m) => m.isOurMatch).length, [matches]);

  // === MONTH view: матчи + тренировки в месячной сетке ===
  // Helper — вернуть номер ISO-недели (используется чтобы группировать дни в строки и
  // подсветить текущую неделю обводкой).
  function isoWeekNumber(d) {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    // Чтоб неделя начиналась с пн (ISO): четверг текущей недели определяет номер
    t.setDate(t.getDate() + 4 - (t.getDay() || 7));
    const yearStart = new Date(t.getFullYear(), 0, 1);
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  }
  function isoWeekKey(d) {
    return d.getFullYear() + '-W' + String(isoWeekNumber(d)).padStart(2, '0');
  }

  const monthGrid = useMemo(() => {
    // Старт сетки = понедельник первой недели месяца. Конец = воскресенье последней недели.
    const first = new Date(monthCursor);
    const dayOfWeek = (first.getDay() + 6) % 7; // 0=пн ... 6=вс
    const gridStart = new Date(first); gridStart.setDate(first.getDate() - dayOfWeek);

    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const lastDow = (last.getDay() + 6) % 7;
    const gridEnd = new Date(last); gridEnd.setDate(last.getDate() + (6 - lastDow));

    const days = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      days.push({
        date: day,
        iso: day.toISOString().slice(0, 10),
        weekKey: isoWeekKey(day),
        inMonth: day.getMonth() === monthCursor.getMonth(),
        isToday: day.getTime() === startOfDay(new Date()).getTime(),
        events: [],
      });
    }
    function bucketFor(iso) {
      if (!iso) return null;
      const k = startOfDay(new Date(iso)).toISOString().slice(0, 10);
      return days.find((b) => b.iso === k);
    }
    for (const m of matches) {
      if (!m.isOurMatch) continue;
      const b = bucketFor(m.date);
      if (b) b.events.push({ type: 'match', time: m.date, data: m });
    }
    for (const t of trainings) {
      const b = bucketFor(t.startsAt);
      if (b) b.events.push({ type: 'training', time: t.startsAt, data: t });
    }
    for (const b of days) b.events.sort((a, b) => new Date(a.time) - new Date(b.time));

    // Группируем в строки по 7 (по неделям)
    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    const todayWeekKey = isoWeekKey(new Date());
    return { rows, todayWeekKey };
  }, [matches, trainings, monthCursor]);

  function shiftMonth(delta) {
    const d = new Date(monthCursor);
    d.setMonth(d.getMonth() + delta);
    setMonthCursor(d);
  }
  function gotoToday() {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
    setMonthCursor(d);
  }
  const monthLabel = monthCursor.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  return (
    <div className="page calendar-page">
      <header className="calendar-page__head">
        <div>
          <h1 className="calendar-page__title">Календарь</h1>
          <div className="calendar-page__subtitle">
            {cal?.title || 'Расписание'} · {selectedTeam?.name || String(age || '')}
            {scope === 'ours' && ourTotal > 0 ? ` · ${ourTotal} наших матчей` : ''}
          </div>
          {cal?.lastUpdated && (
            <div className="calendar-page__updated">
              Обновлено: {new Date(cal.lastUpdated).toLocaleString('ru-RU')}
            </div>
          )}
        </div>
        <div className="calendar-page__controls">
          {/* View switch — Расписание матчей / Календарь (месячный) */}
          <div className="calendar-page__filters calendar-page__view-toggle">
            <button
              className={`calendar-page__filter ${view === 'list' ? 'is-active' : ''}`}
              onClick={() => setView('list')}
            >📋 Расписание матчей</button>
            <button
              className={`calendar-page__filter ${view === 'week' ? 'is-active' : ''}`}
              onClick={() => setView('week')}
            >📆 Календарь</button>
          </div>

          {ages.length > 0 && (
            <select
              className="calendar-page__select"
              value={age || ''}
              onChange={(e) => setAge(e.target.value)}
            >
              {user?.role === 'head_coach' && (
                <option value="all">🌐 Все команды</option>
              )}
              {ages.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}

          {/* Filter и scope только в списочном режиме */}
          {view === 'list' && (
            <>
              <div className="calendar-page__filters">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    className={`calendar-page__filter ${filter === f.id ? 'is-active' : ''}`}
                    onClick={() => setFilter(f.id)}
                  >{f.label}</button>
                ))}
              </div>
              <div className="calendar-page__filters">
                <button
                  className={`calendar-page__filter ${scope === 'ours' ? 'is-active' : ''}`}
                  onClick={() => setScope('ours')}
                >Только наши</button>
                <button
                  className={`calendar-page__filter ${scope === 'all' ? 'is-active' : ''}`}
                  onClick={() => setScope('all')}
                >Вся лига</button>
              </div>
            </>
          )}
        </div>
      </header>

      {(listRes.loading || calRes.loading) && (
        <div className="empty-state">Загрузка календаря…</div>
      )}

      {calRes.error && (
        <div className="empty-state empty-state--error">
          Не удалось загрузить календарь: {calRes.error.message || String(calRes.error)}
        </div>
      )}

      {/* === LIST VIEW === */}
      {view === 'list' && !calRes.loading && (
        <>
          {listFiltered.length === 0 ? (
            <div className="empty-state">
              {filter === 'upcoming' ? 'Будущих матчей не найдено' :
               filter === 'past'     ? 'Сыгранных матчей нет' :
                                       'Матчи отсутствуют'}
            </div>
          ) : (
            <div className="calendar-page__list">
              {listFiltered.map((m, i) => {
                const past = m.isPast;
                return (
                  <div
                    key={`${m.date || ''}-${i}`}
                    className={`cal-card cal-card--clickable ${m.isOurMatch ? 'cal-card--ours' : ''} ${past ? 'cal-card--past' : ''}`}
                    onClick={() => setOpenMatch(m)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenMatch(m); }}
                  >
                    <div className="cal-card__date">
                      {formatDate(m.date)}
                      {m.round && <span className="cal-card__round">· {m.round}</span>}
                      {age === 'all' && m.ageGroup && (
                        <span className="cal-card__age-badge">{m.ageGroup}</span>
                      )}
                      {m.tournament === 'cup' && <span className="cal-card__badge cal-card__badge--cup">Кубок</span>}
                    </div>
                    <div className="cal-card__teams">
                      <div className="cal-card__team cal-card__team--home">
                        <img className="cal-card__shield" src={shieldFor(m.home, m.homeShield)} alt="" loading="lazy" onError={(e)=>{e.currentTarget.style.visibility='hidden';}} />
                        <span className="cal-card__team-name">{shortName(m.home)}</span>
                      </div>
                      <div className="cal-card__score">
                        {past && m.score
                          ? <span><b>{m.score.home}</b> : <b>{m.score.away}</b></span>
                          : <span className="cal-card__vs">vs</span>}
                      </div>
                      <div className="cal-card__team cal-card__team--away">
                        <span className="cal-card__team-name">{shortName(m.away)}</span>
                        <img className="cal-card__shield" src={shieldFor(m.away, m.awayShield)} alt="" loading="lazy" onError={(e)=>{e.currentTarget.style.visibility='hidden';}} />
                      </div>
                    </div>
                    {m.venue && <div className="cal-card__venue">📍 {m.venue}</div>}
                    {isCoach && m.isOurMatch && !past && (
                      <button
                        className="cal-card__roster-btn"
                        onClick={(e) => { e.stopPropagation(); setOpenCallup(m); }}
                      >
                        👥 Состав на матч
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* === MONTH VIEW (календарь) === */}
      {view === 'week' && !calRes.loading && (
        <div className="cal-month">
          <div className="cal-month__nav">
            <button className="cal-month__nav-btn" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">◀</button>
            <div className="cal-month__title">{monthLabel}</div>
            <button className="cal-month__nav-btn" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">▶</button>
            <button className="cal-month__today" onClick={gotoToday}>Сегодня</button>
          </div>
          <div className="cal-month__weekday-row">
            {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d) => (
              <div key={d} className="cal-month__weekday">{d}</div>
            ))}
          </div>
          <div className="cal-month__grid">
            {monthGrid.rows.map((row, ri) => {
              const isCurrentWeek = row.length > 0 && row[0].weekKey === monthGrid.todayWeekKey;
              return (
                <div key={ri} className={`cal-month__row ${isCurrentWeek ? 'cal-month__row--current' : ''}`}>
                  {row.map((d) => (
                    <div
                      key={d.iso}
                      className={
                        'cal-month__day' +
                        (d.inMonth ? '' : ' cal-month__day--out') +
                        (d.isToday ? ' cal-month__day--today' : '')
                      }
                    >
                      <div className="cal-month__day-num">{d.date.getDate()}</div>
                      {d.events.length > 0 && (
                        <div className="cal-month__events">
                          {d.events.map((e, i) => {
                            if (e.type === 'match') {
                              const m = e.data;
                              const ourHome = isLegirus(m.home);
                              const opp = ourHome ? m.away : m.home;
                              return (
                                <button
                                  key={'m' + i}
                                  className={`cal-month__event cal-month__event--match ${m.tournament === 'cup' ? 'cal-month__event--cup' : ''} ${m.isPast ? 'cal-month__event--past' : ''}`}
                                  type="button"
                                  onClick={() => setOpenMatch(m)}
                                  title={`${fmtTime(m.date)}${m.ageGroup ? ' · ' + m.ageGroup : ''} · ${shortName(m.home)} vs ${shortName(m.away)}${m.venue ? ' · ' + m.venue : ''}`}
                                >
                                  <span className="cal-month__event-time">{fmtTime(m.date)}</span>
                                  {age === 'all' && m.ageGroup && (
                                    <span className="cal-month__event-age">{m.ageGroup}</span>
                                  )}
                                  <span className="cal-month__event-icon">{m.tournament === 'cup' ? '🏆' : '⚽'}</span>
                                  <span className="cal-month__event-text">{shortName(opp)}</span>
                                </button>
                              );
                            }
                            const t = e.data;
                            const tt = TRAINING_TYPES[t.type] || TRAINING_TYPES.training;
                            return (
                              <button
                                key={'t' + i}
                                className="cal-month__event cal-month__event--training"
                                type="button"
                                onClick={() => setOpenTraining(t)}
                                title={`${fmtTime(t.startsAt)}${t.ageGroup ? ' · ' + t.ageGroup : ''} · ${tt.label}${t.venueText ? ' · ' + t.venueText : ''}`}
                              >
                                <span className="cal-month__event-time">{fmtTime(t.startsAt)}</span>
                                {age === 'all' && t.ageGroup && (
                                  <span className="cal-month__event-age">{t.ageGroup}</span>
                                )}
                                <span className="cal-month__event-icon">{tt.icon}</span>
                                <span className="cal-month__event-text">{tt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {openMatch && (
        <MatchDetailSheet
          match={openMatch}
          age={age}
          onClose={() => setOpenMatch(null)}
          extra={
            isCoach && openMatch.isOurMatch && !openMatch.isPast ? (
              <button
                className="mds-cta-secondary"
                onClick={() => { setOpenCallup(openMatch); setOpenMatch(null); }}
              >
                <span>👥</span>
                <span>Состав на матч</span>
              </button>
            ) : isCoach && openMatch.isOurMatch && openMatch.isPast ? (
              <CoachCommentForm
                age={age}
                extMatchId={openMatch.matchId}
                initialValue={openMatch.coachComment || ''}
                onSaved={(newComment) => setOpenMatch((prev) => prev ? { ...prev, coachComment: newComment } : prev)}
              />
            ) : null
          }
        />
      )}

      {openTraining && (
        <TrainingDetailSheet
          training={openTraining}
          onClose={() => setOpenTraining(null)}
        />
      )}

      {openCallup && (
        <CallupRoster
          match={openCallup}
          onClose={() => setOpenCallup(null)}
        />
      )}
    </div>
  );
}

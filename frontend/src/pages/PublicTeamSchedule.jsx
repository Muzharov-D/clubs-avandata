// Публичная страница расписания команды — без авторизации.
// Используется для расшаривания родителям, болельщикам.
// URL: /public/team/:age (например /public/team/2010)
//
// Источник: GET /api/public/calendar/:age — sanitized данные без личной статистики.

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useAutoRefresh, bustCache } from '../hooks/useAutoRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import MatchDetailSheet from '../components/MatchDetailSheet';
import TrainingDetailSheet from '../components/TrainingDetailSheet';
import CalendarSubscribeModal from '../components/CalendarSubscribeModal';
import StandingsModal from '../components/StandingsModal';
import PublicTeamHeader from '../components/PublicTeamHeader';
import OfflineBanner from '../components/OfflineBanner';
import UiIcon from '../components/UiIcon';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import HeroNextMatch from '../components/HeroNextMatch';
import OpponentPreview from '../components/OpponentPreview';
import PullToRefresh from '../components/PullToRefresh';
import { toast } from '../components/Toast';
import { tierForAge } from '../utils/ageRating';
import { shieldFor, isLegirus } from '../utils/legirus';
import { fmtRelative } from '../utils/dates';
import './PublicTeamSchedule.css';
import './CalendarPage.css';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
const PREFIX = `${API_BASE}/api/public`;

const FILTERS = [
  { id: 'upcoming', label: 'Будущие' },
  { id: 'past',     label: 'Прошедшие' },
  { id: 'all',      label: 'Все' },
];

// shieldFor импортируется из utils/legirus — единая точка для всего проекта

// ISO-неделя: ПН 00:00:00.001 — ВС 23:59:59.999. offset 0 — текущая, +1 — следующая.
function getWeekRange(offset = 0) {
  const now = new Date();
  // Дата понедельника текущей недели (Sun=0, ПН=1, ВТ=2... — приводим к 0=ПН)
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + (offset * 7));
  monday.setHours(0, 0, 0, 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}
function formatWeekRange(offset) {
  const { start, end } = getWeekRange(offset);
  const fmt = (d) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  return `${fmt(start)} — ${fmt(end)}`;
}

// Карточки расписания: для матчей в окне ±7 дней показываем человеческое
// «Сегодня в 14:00 / Завтра в … / В среду в …», иначе — «18 мая в 14:00».
function formatDate(iso) {
  if (!iso) return '—';
  return fmtRelative(iso);
}

function shortName(name) {
  if (!name) return '—';
  const cleaned = String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .replace(/\bрайон\b/gi, 'р-н')
    .replace(/\s+/g, ' ')
    .trim();
  // Не больше 3 слов
  return cleaned.split(' ').slice(0, 3).join(' ');
}

function nrmName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export default function PublicTeamSchedule() {
  const { age } = useParams();
  const navigate = useNavigate();
  const [cal, setCal] = useState(null);
  const [standings, setStandings] = useState(null);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('upcoming');
  const [openMatch, setOpenMatch] = useState(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [clubRank, setClubRank] = useState(null);
  const [showStandings, setShowStandings] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [openTraining, setOpenTraining] = useState(null);
  const [view, setView] = useState('list');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = текущая, 1 = следующая
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [selectedDayIso, setSelectedDayIso] = useState(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  useEffect(() => { setSelectedDayIso(null); }, [monthCursor, view]);

  const PREF_KEY_HIDE_TRAININGS = `legirus.public.hideTrainings.${age}`;
  // Default: скрыто (дефолт — true), чтобы при первом заходе родитель сам нажал
  // на тогл и испытал «вау» от появления тренировок. Если в localStorage есть
  // явное значение — используем его (юзер уже выбрал).
  const [hideTrainings, setHideTrainings] = useState(() => {
    try {
      const v = localStorage.getItem(PREF_KEY_HIDE_TRAININGS);
      if (v === null) return true;
      return v === '1';
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(PREF_KEY_HIDE_TRAININGS, hideTrainings ? '1' : '0'); } catch {}
  }, [hideTrainings, PREF_KEY_HIDE_TRAININGS]);

  // CRITICAL: подмена manifest должна произойти ДО того как браузер встретит
  // beforeinstallprompt и сохранит install-snapshot. useLayoutEffect выполняется
  // синхронно после DOM-mutations, до paint — это самое раннее что можно сделать.
  // Дополнительно: создаём НОВЫЙ <link> и удаляем старый, чтобы Chrome точно перечитал manifest.
  useLayoutEffect(() => {
    if (!age) return;
    // cache-bust чтобы Chrome не отдал старый закешированный manifest при A2HS
    const ageManifestUrl = `${PREFIX}/manifest/${encodeURIComponent(age)}.json?v=${Date.now()}`;
    const old = document.querySelector('link[rel="manifest"]');
    const fresh = document.createElement('link');
    fresh.rel = 'manifest';
    fresh.href = ageManifestUrl;
    if (old) old.parentNode.replaceChild(fresh, old);
    else document.head.appendChild(fresh);

    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const originalAppleTitle = appleTitle ? appleTitle.getAttribute('content') : null;
    if (appleTitle) appleTitle.setAttribute('content', `Легирус ${tierForAge(age)}`);

    const originalTitle = document.title;
    document.title = `ФК Легирус ${tierForAge(age)} · Расписание`;

    let themeColor = document.querySelector('meta[name="theme-color"]');
    const originalTheme = themeColor ? themeColor.getAttribute('content') : null;
    if (themeColor) themeColor.setAttribute('content', '#1a0606');

    return () => {
      // НЕ возвращаем старый manifest — пусть остаётся public-specific.
      // Это безопасно: тренер может перейти на /club через ссылку, и тогда там
      // index.html заново отрендерится с дефолтным /icons/site.webmanifest.
      if (appleTitle && originalAppleTitle) appleTitle.setAttribute('content', originalAppleTitle);
      document.title = originalTitle;
      if (themeColor && originalTheme) themeColor.setAttribute('content', originalTheme);
    };
  }, [age]);

  // Запоминаем последний выбранный возраст — чтобы при заходе на / landing сразу редиректил
  useEffect(() => {
    if (!age) return;
    try { localStorage.setItem('legirus.public.lastAge', String(age)); } catch {}
  }, [age]);

  // Загрузка данных. Вынесена в callback чтобы её можно было дёргать
  // и при первом рендере, и при auto-refresh (каждые 30 мин или при
  // возвращении на вкладку). bustCache добавляет параметр _t,
  // который меняется каждые 30 минут — это обходит Service Worker stale-кеш.
  const loadData = useCallback((isInitial) => {
    if (!age) return;
    if (isInitial) {
      setLoading(true);
      setError(null);
    }
    Promise.all([
      fetch(bustCache(`${PREFIX}/calendar/${encodeURIComponent(age)}`)).then((r) => r.ok ? r.json() : Promise.reject(new Error(`Календарь не найден (${r.status})`))),
      fetch(bustCache(`${PREFIX}/standings/${encodeURIComponent(age)}`)).then((r) => r.ok ? r.json() : null),
      fetch(bustCache(`${PREFIX}/venues`)).then((r) => r.ok ? r.json() : { venues: [] }),
      fetch(bustCache(`${PREFIX}/club-rank`)).then((r) => r.ok ? r.json() : null),
      fetch(bustCache(`${PREFIX}/trainings/${encodeURIComponent(age)}`, 60_000)).then((r) => r.ok ? r.json() : { trainings: [] }), // тренировки — 1 мин (тренер может менять оперативно)
    ]).then(([calData, standData, venueData, clubRankData, trData]) => {
      setCal(calData);
      setStandings(standData);
      setVenues(venueData?.venues || []);
      setClubRank(clubRankData);
      setTrainings(trData?.trainings || []);
    }).catch((e) => {
      // На auto-refresh — не показываем ошибку, оставляем последние данные.
      if (isInitial) setError(e.message);
    }).finally(() => {
      if (isInitial) setLoading(false);
    });
  }, [age]);

  // Первоначальная загрузка при смене age
  useEffect(() => { loadData(true); }, [loadData]);

  // Авто-рефетч каждые 30 минут + при возвращении на вкладку + при возврате online.
  // Молчит на ошибках (показывает старые данные), не дёргает спиннер.
  useAutoRefresh(() => loadData(false));

  const venueByName = useMemo(() => {
    const map = new Map();
    for (const v of venues) {
      map.set(nrmName(v.name), v);
    }
    return map;
  }, [venues]);

  function findVenue(matchVenue) {
    if (!matchVenue) return null;
    const key = nrmName(matchVenue);
    if (venueByName.has(key)) return venueByName.get(key);
    for (const [vn, v] of venueByName) {
      if (key.startsWith(vn) || key.includes(vn)) return v;
    }
    return null;
  }

  function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function isoWeekKey(d) {
    const t = new Date(d); t.setHours(0,0,0,0);
    t.setDate(t.getDate() + 4 - (t.getDay() || 7));
    const yearStart = new Date(t.getFullYear(), 0, 1);
    return t.getFullYear() + '-W' + String(Math.ceil(((t - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  const ourMatches = (cal?.matches || []).filter((m) => m.isOurMatch);
  // Ближайший наш матч в будущем (для Hero-блока)
  const nextMatch = useMemo(() => {
    const now = Date.now();
    return ourMatches
      .filter((m) => m.date && new Date(m.date).getTime() > now && !m.isPast)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
  }, [ourMatches]);

  // Тренировки разрешены только в фильтре 'upcoming' (тренер в прошлом — приватная инфа)
  const trainingsAvailable = filter === 'upcoming' && trainings.length > 0;
  const showTrainings = trainingsAvailable && !hideTrainings;

  const events = useMemo(() => {
    const items = [];
    // Для 'upcoming' — фильтруем по выбранной неделе (текущая или следующая)
    let weekStart = null, weekEnd = null;
    if (filter === 'upcoming') {
      const r = getWeekRange(weekOffset);
      weekStart = r.start; weekEnd = r.end;
    }
    function inWeek(iso) {
      if (!weekStart) return true;
      // Без даты или невалидная дата — НЕ попадает в "Будущие" (только в "Все")
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (isNaN(t)) return false;
      return t >= weekStart.getTime() && t <= weekEnd.getTime();
    }
    for (const m of ourMatches) {
      const inFilter =
        filter === 'all' ||
        (filter === 'upcoming' && m.isUpcoming && inWeek(m.date)) ||
        (filter === 'past' && m.isPast);
      if (inFilter) items.push({ kind: 'match', date: m.date, data: m });
    }
    if (showTrainings) {
      for (const t of trainings) {
        if (inWeek(t.startsAt)) {
          items.push({ kind: 'training', date: t.startsAt, data: t });
        }
      }
    }
    // Сортировка матчей в режиме «Все»: по номеру тура если он есть (1, 2, 3, 6, 17),
    // иначе по дате; матчи без даты и без тура — в конец списка.
    // В «Будущие» / «Прошедшие» — обычная хронологическая сортировка по дате.
    function tourNum(item) {
      if (item.kind !== 'match') return null;
      const r = item.data?.round;
      if (!r) return null;
      const m = String(r).match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }
    items.sort((a, b) => {
      if (filter === 'all') {
        const ta = tourNum(a);
        const tb = tourNum(b);
        // Оба с туром — сортируем по номеру тура
        if (ta !== null && tb !== null) return ta - tb;
        if (ta !== null && tb === null) return -1;
        if (ta === null && tb !== null) return 1;
      }
      // По дате
      const da = a.date ? new Date(a.date).getTime() : NaN;
      const db = b.date ? new Date(b.date).getTime() : NaN;
      const aHas = !isNaN(da);
      const bHas = !isNaN(db);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return 0;
      return da - db;
    });
    return items;
  }, [ourMatches, trainings, filter, showTrainings, weekOffset]);
  // Если ближайший матч уже отрисован в Hero-блоке — не дублируем его в списке.
  // (Hero видим только при filter='upcoming' и в weekOffset=0, т.е. текущая неделя.)
  const filtered = useMemo(() => {
    if (!nextMatch || filter !== 'upcoming') return events;
    return events.filter((e) => !(e.kind === 'match' && e.data?.matchId === nextMatch.matchId));
  }, [events, nextMatch, filter]);

  // В месячном виде показываем все тренировки (фильтр недели не применяется)
  const visibleTrainings = (filter !== 'past' && !hideTrainings) ? trainings : [];

  const monthGrid = useMemo(() => {
    const first = new Date(monthCursor);
    const dow = (first.getDay() + 6) % 7;
    const gridStart = new Date(first); gridStart.setDate(first.getDate() - dow);
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const lastDow = (last.getDay() + 6) % 7;
    const gridEnd = new Date(last); gridEnd.setDate(last.getDate() + (6 - lastDow));
    const days = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const day = new Date(d); day.setHours(0,0,0,0);
      days.push({
        date: day, iso: day.toISOString().slice(0,10),
        weekKey: isoWeekKey(day),
        inMonth: day.getMonth() === monthCursor.getMonth(),
        isToday: day.getTime() === startOfDay(new Date()).getTime(),
        events: [],
      });
    }
    function bucketFor(iso) {
      if (!iso) return null;
      const k = startOfDay(new Date(iso)).toISOString().slice(0,10);
      return days.find((b) => b.iso === k);
    }
    for (const m of ourMatches) {
      const b = bucketFor(m.date); if (b) b.events.push({ kind: 'match', time: m.date, data: m });
    }
    for (const t of visibleTrainings) {
      const b = bucketFor(t.startsAt); if (b) b.events.push({ kind: 'training', time: t.startsAt, data: t });
    }
    for (const b of days) b.events.sort((a, b) => new Date(a.time) - new Date(b.time));
    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return { rows, todayWeekKey: isoWeekKey(new Date()) };
  }, [ourMatches, visibleTrainings, monthCursor]);

  function shiftMonth(delta) {
    const d = new Date(monthCursor); d.setMonth(d.getMonth() + delta); setMonthCursor(d);
  }
  function gotoToday() {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setMonthCursor(d);
  }
  const monthLabel = monthCursor.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  const ourRow = standings?.table?.find((t) => t.isOurClub);

  async function handleShare() {
    // Делимся ссылкой на ЛЕНДИНГ (корень mobile.*), а не на конкретную команду.
    // Получатель сам выберет свою команду из 8 — иначе он попадёт на чужой возраст
    // (например, я родитель 2010, а отправил ссылку родителю ребёнка 2012 — он бы
    // увидел расписание 2010 и не понял, как переключиться).
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = origin + '/';
    const shareData = {
      title: 'ФК Легирус · Расписание',
      text: 'Расписание команд ФК Легирус — выберите год рождения ребёнка',
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert('Ссылка скопирована в буфер обмена');
      } else {
        prompt('Скопируй ссылку:', shareUrl);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.warn('share failed', err);
      }
    }
  }

  const TYPE_LABELS = {
    training: 'Тренировка', extra: 'Доп. занятие',
    warmup: 'Разминка', recovery: 'Восстановление', meet: 'Сбор',
  };
  const TYPE_ICONS = { training:'🏃', extra:'⚡', warmup:'🔥', recovery:'💧', meet:'👥' };
  const TYPE_LABELS_SHORT = { training:'Трен.', extra:'Доп.', warmup:'Разм.', recovery:'Восст.', meet:'Сбор' };

  // Pull-to-refresh handler. Дёргает все fetch-и заново, показывает toast.
  async function handlePullRefresh() {
    await loadData(false);
    toast.success('Расписание обновлено');
  }

  return (
    <div className="public-page">
      <PullToRefresh onRefresh={handlePullRefresh} />
      <OfflineBanner lastUpdated={cal?.lastUpdated} />
      <div className="public-page__container">
        <PublicTeamHeader
          age={age}
          divisionName={standings?.title}
          ourLeagueRow={ourRow}
          clubRank={clubRank}
          matches={cal?.matches}
          onOpenLeague={() => setShowStandings('league')}
          onOpenClub={() => setShowStandings('club')}
        />

        {loading && (
          <div className="public-page__skeleton">
            <Skeleton h={44} br={10} />
            <Skeleton h={36} br={10} style={{ marginTop: 8 }} />
            <Skeleton.List count={4} h={78} gap={10} br={12} />
          </div>
        )}
        {error && (
          <div className="public-page__empty public-page__empty--error">
            Не удалось загрузить расписание: {error}
          </div>
        )}

        {!loading && !error && nextMatch && (
          <HeroNextMatch
            match={nextMatch}
            venue={findVenue(nextMatch.venue)}
            onOpen={setOpenMatch}
          />
        )}
        {!loading && !error && nextMatch && (
          <OpponentPreview
            nextMatch={nextMatch}
            allMatches={cal?.matches || []}
            standings={standings}
          />
        )}

        {!loading && !error && (cal?.matches || []).length > 0 && (
          <button
            type="button"
            className="public-page__league-btn"
            onClick={() => navigate(`/public/team/${age}/league`)}
            title="Открыть полный календарь лиги"
          >
            <UiIcon name="trophy" size={14} />
            <span>Все матчи лиги</span>
            <span className="public-page__league-btn-arrow">→</span>
          </button>
        )}

        {!loading && !error && (
          <>
            <div className="public-page__settings">
              <label className={`public-page__settings-toggle ${!trainingsAvailable ? 'is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={!hideTrainings && trainingsAvailable}
                  disabled={!trainingsAvailable}
                  onChange={(e) => setHideTrainings(!e.target.checked)}
                />
                <span className="public-page__settings-track" aria-hidden="true"></span>
                <span className="public-page__settings-label">
                  <UiIcon name="running" size={13} /> Показывать тренировки
                  {!trainingsAvailable && filter !== 'upcoming' && (
                    <small> · только в Будущих</small>
                  )}
                  {filter === 'upcoming' && trainings.length === 0 && (
                    <small> · не запланировано</small>
                  )}
                </span>
              </label>
            </div>

            <div className="public-page__filters public-page__view-toggle">
              <button
                className={`public-page__filter ${view === 'list' ? 'is-active' : ''}`}
                onClick={() => setView('list')}
              ><UiIcon name="list" size={14} /> Список</button>
              <button
                className={`public-page__filter ${view === 'month' ? 'is-active' : ''}`}
                onClick={() => setView('month')}
              ><UiIcon name="calendar" size={14} /> Календарь</button>
            </div>

            {view === 'list' && (
              <>
                <div className="public-page__filters">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      className={`public-page__filter ${filter === f.id ? 'is-active' : ''}`}
                      onClick={() => { setFilter(f.id); setWeekOffset(0); }}
                    >{f.label}</button>
                  ))}
                </div>
                {filter === 'upcoming' ? (
                  <div className="public-page__week-nav">
                    <button
                      type="button"
                      className={`public-page__week-btn ${weekOffset === 0 ? 'is-active' : ''}`}
                      onClick={() => setWeekOffset(0)}
                    >
                      <span>Текущая неделя</span>
                      <small>{formatWeekRange(0)}</small>
                    </button>
                    <button
                      type="button"
                      className={`public-page__week-btn ${weekOffset === 1 ? 'is-active' : ''}`}
                      onClick={() => setWeekOffset(1)}
                    >
                      <span>Следующая</span>
                      <small>{formatWeekRange(1)}</small>
                    </button>
                  </div>
                ) : (
                  <div className="public-page__count public-page__count--standalone">
                    {filtered.length} {filtered.length === 1 ? 'событие' : 'событий'}
                  </div>
                )}
              </>
            )}

            {view === 'list' && filtered.length === 0 && (
              <EmptyState
                icon={filter === 'past' ? '🗓' : '📭'}
                title={
                  filter === 'upcoming' && nextMatch ? 'Других матчей на этой неделе нет' :
                  filter === 'upcoming' ? 'Пока ничего не запланировано' :
                  filter === 'past'     ? 'Сыгранных матчей нет' :
                                          'Событий не найдено'
                }
                subtitle={
                  // Когда у команды сетка «1 матч/неделю» — список под Hero пустой,
                  // и родители видят «ничего не запланировано» хотя выше уже есть Hero.
                  // Подсказываем что ближайший уже показан выше.
                  filter === 'upcoming' && nextMatch
                    ? `Ближайший — ${fmtRelative(nextMatch.date)}, показан выше.`
                    : filter === 'upcoming'
                      ? 'Расписание появится — мы оповестим за сутки до матча, если включишь уведомления.'
                      : filter === 'past'
                        ? 'Когда команда сыграет первый матч — он появится здесь.'
                        : undefined
                }
              />
            )}

            {view === 'list' && filtered.length > 0 && (
              <div className="public-page__list">
                {filtered.map((e, i) => {
                  if (e.kind === 'training') {
                    const t = e.data;
                    return (
                      <article
                        key={`tr-${t.id || i}`}
                        className="pub-card pub-card--clickable pub-card--training"
                        onClick={() => setOpenTraining(t)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setOpenTraining(t); }}
                      >
                        <div className="pub-card__date">
                          {formatDate(t.startsAt)}
                          <span className="pub-card__badge pub-card__badge--training">
                            <UiIcon name="running" size={14} /> {TYPE_LABELS[t.type] || 'Тренировка'}
                          </span>
                        </div>
                        <div className="pub-card__training-row">
                          <div className="pub-card__training-info">
                            <div className="pub-card__training-title">
                              {TYPE_LABELS[t.type] || 'Тренировка'}
                            </div>
                            <div className="pub-card__training-sub">{t.durationMin || 90} минут</div>
                          </div>
                        </div>
                        {t.venueText && <div className="pub-card__venue"><UiIcon name="pin" size={14} /> {t.venueText}</div>}
                      </article>
                    );
                  }
                  const m = e.data;
                  const past = m.isPast;
                  const tournamentLabel = m.tournament === 'cup' ? 'Кубок' : 'Лига';
                  return (
                    <article
                      key={`m-${m.matchId || i}`}
                      className={`pub-card pub-card--clickable ${past ? 'pub-card--past' : ''}`}
                      onClick={() => setOpenMatch(m)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setOpenMatch(m); }}
                    >
                      <div className="pub-card__date">
                        {m.date ? formatDate(m.date) : <span className="pub-card__no-date">Дата уточняется</span>}
                        {m.tournament && (
                          <span className={`pub-card__badge pub-card__badge--${m.tournament}`}>
                            {tournamentLabel}
                          </span>
                        )}
                        {m.round && (
                          <span className="pub-card__round">{m.round}</span>
                        )}
                      </div>
                      <div className="pub-card__teams">
                        <div className="pub-card__team pub-card__team--home">
                          <img className="pub-card__shield" src={shieldFor(m.home, m.homeShield)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                          <span className="pub-card__team-name">{shortName(m.home)}</span>
                        </div>
                        <div className="pub-card__score">
                          {past && m.score
                            ? <span><b>{m.score.home}</b> : <b>{m.score.away}</b></span>
                            : <span className="pub-card__vs">vs</span>}
                        </div>
                        <div className="pub-card__team pub-card__team--away">
                          <span className="pub-card__team-name">{shortName(m.away)}</span>
                          <img className="pub-card__shield" src={shieldFor(m.away, m.awayShield)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                        </div>
                      </div>
                      {m.venue && <div className="pub-card__venue"><UiIcon name="pin" size={14} /> {m.venue}</div>}
                    </article>
                  );
                })}
              </div>
            )}

            {view === 'month' && (
              <div className="cal-month cal-month--legirus">
                <div className="cal-month__nav">
                  <button className="cal-month__nav-btn" onClick={() => shiftMonth(-1)} aria-label="Предыдущий">◀</button>
                  <div className="cal-month__title">{monthLabel}</div>
                  <button className="cal-month__nav-btn" onClick={() => shiftMonth(1)} aria-label="Следующий">▶</button>
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
                        {row.map((d) => {
                          const hasEvents = d.events.length > 0;
                          const isSelected = isMobile && selectedDayIso === d.iso;
                          const onDayClick = () => {
                            if (!isMobile || !hasEvents) return;
                            setSelectedDayIso((prev) => prev === d.iso ? null : d.iso);
                          };
                          return (
                            <div
                              key={d.iso}
                              className={
                                'cal-month__day' +
                                (d.inMonth ? '' : ' cal-month__day--out') +
                                (d.isToday ? ' cal-month__day--today' : '') +
                                (isSelected ? ' cal-month__day--selected' : '')
                              }
                              onClick={onDayClick}
                              role={isMobile && hasEvents ? 'button' : undefined}
                              tabIndex={isMobile && hasEvents ? 0 : undefined}
                            >
                              <div className="cal-month__day-num">{d.date.getDate()}</div>
                              {hasEvents && (
                                <div className="cal-month__events">
                                  {d.events.map((e, i) => {
                                    if (e.kind === 'match') {
                                      const m = e.data;
                                      const ourHome = isLegirus(m.home);
                                      const opp = ourHome ? m.away : m.home;
                                      return (
                                        <button
                                          key={'m' + i}
                                          className={`cal-month__event cal-month__event--match ${m.tournament === 'cup' ? 'cal-month__event--cup' : ''} ${m.isPast ? 'cal-month__event--past' : ''}`}
                                          type="button"
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            if (isMobile) onDayClick();
                                            else setOpenMatch(m);
                                          }}
                                          title={`${fmtTime(m.date)} · ${shortName(m.home)} vs ${shortName(m.away)}`}
                                        >
                                          <span className="cal-month__event-time">{fmtTime(m.date)}</span>
                                          <UiIcon name={m.tournament === 'cup' ? 'trophy' : 'ball'} size={11} className="cal-month__event-icon" />
                                          <span className="cal-month__event-text">{shortName(opp)}</span>
                                        </button>
                                      );
                                    }
                                    const t = e.data;
                                    const TYPE_TO_ICON = { training:'running', extra:'training-extra', warmup:'training-warmup', recovery:'training-recovery', meet:'training-meet' };
                                    return (
                                      <button
                                        key={'t' + i}
                                        className="cal-month__event cal-month__event--training"
                                        type="button"
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          if (isMobile) onDayClick();
                                          else setOpenTraining(t);
                                        }}
                                        title={`${fmtTime(t.startsAt)} · ${TYPE_LABELS[t.type] || 'Тренировка'}${t.venueText ? ' · ' + t.venueText : ''}`}
                                      >
                                        <span className="cal-month__event-time">{fmtTime(t.startsAt)}</span>
                                        <UiIcon name={TYPE_TO_ICON[t.type] || 'running'} size={11} className="cal-month__event-icon" />
                                        <span className="cal-month__event-text">{TYPE_LABELS_SHORT[t.type] || 'Трен.'}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {isMobile && selectedDayIso && (() => {
                  const day = monthGrid.rows.flat().find((x) => x.iso === selectedDayIso);
                  if (!day || !day.events.length) return null;
                  const dayLabel = day.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
                  return (
                    <div className="public-page__day-details">
                      <div className="public-page__day-details-head">
                        <div className="public-page__day-details-title">{dayLabel}</div>
                        <button
                          className="public-page__day-details-close"
                          onClick={() => setSelectedDayIso(null)}
                          aria-label="Скрыть"
                        >✕</button>
                      </div>
                      <div className="public-page__list">
                        {day.events.map((e, i) => {
                          if (e.kind === 'training') {
                            const t = e.data;
                            return (
                              <article
                                key={'dt-' + i}
                                className="pub-card pub-card--clickable pub-card--training"
                                onClick={() => setOpenTraining(t)}
                                role="button"
                                tabIndex={0}
                              >
                                <div className="pub-card__date">
                                  {fmtTime(t.startsAt)}
                                  <span className="pub-card__badge pub-card__badge--training">
                                    <UiIcon name="running" size={14} /> {TYPE_LABELS[t.type] || 'Тренировка'}
                                  </span>
                                </div>
                                <div className="pub-card__training-row">
                                  <div className="pub-card__training-info">
                                    <div className="pub-card__training-title">{TYPE_LABELS[t.type] || 'Тренировка'}</div>
                                    <div className="pub-card__training-sub">{t.durationMin || 90} минут</div>
                                  </div>
                                </div>
                                {t.venueText && <div className="pub-card__venue"><UiIcon name="pin" size={14} /> {t.venueText}</div>}
                              </article>
                            );
                          }
                          const m = e.data;
                          const tournamentLabel = m.tournament === 'cup' ? 'Кубок' : 'Лига';
                          return (
                            <article
                              key={'dm-' + i}
                              className={`pub-card pub-card--clickable ${m.isPast ? 'pub-card--past' : ''}`}
                              onClick={() => setOpenMatch(m)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="pub-card__date">
                                {m.date ? fmtTime(m.date) : <span className="pub-card__no-date">Дата уточняется</span>}
                                {m.tournament && (
                                  <span className={`pub-card__badge pub-card__badge--${m.tournament}`}>
                                    {tournamentLabel}
                                  </span>
                                )}
                                {m.round && (
                                  <span className="pub-card__round">{m.round}</span>
                                )}
                              </div>
                              <div className="pub-card__teams">
                                <div className="pub-card__team pub-card__team--home">
                                  <img className="pub-card__shield" src={shieldFor(m.home, m.homeShield)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                                  <span className="pub-card__team-name">{shortName(m.home)}</span>
                                </div>
                                <div className="pub-card__score">
                                  {m.isPast && m.score
                                    ? <span><b>{m.score.home}</b> : <b>{m.score.away}</b></span>
                                    : <span className="pub-card__vs">vs</span>}
                                </div>
                                <div className="pub-card__team pub-card__team--away">
                                  <span className="pub-card__team-name">{shortName(m.away)}</span>
                                  <img className="pub-card__shield" src={shieldFor(m.away, m.awayShield)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                                </div>
                              </div>
                              {m.venue && <div className="pub-card__venue"><UiIcon name="pin" size={14} /> {m.venue}</div>}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="public-page__actions">
              <button
                type="button"
                className="public-page__action public-page__action--secondary"
                onClick={() => setShowSubscribe(true)}
              >
                <UiIcon name="calendar" size={18} />
                <span>{isMobile ? 'В календарь' : 'Подписаться на календарь'}</span>
              </button>
              <button
                type="button"
                className="public-page__action public-page__action--primary"
                onClick={handleShare}
              >
                <UiIcon name="share" size={18} />
                <span>Поделиться</span>
              </button>
            </div>

            <footer className="public-page__footer">
              <p>
                Обновлено: {cal?.lastUpdated ? new Date(cal.lastUpdated).toLocaleString('ru-RU') : '—'}
              </p>
            </footer>
          </>
        )}
      </div>

      {openMatch && (
        <MatchDetailSheet
          match={openMatch}
          venue={findVenue(openMatch.venue)}
          age={age}
          theme="legirus"
          onClose={() => setOpenMatch(null)}
        />
      )}

      {openTraining && (
        <TrainingDetailSheet
          training={openTraining}
          theme="legirus"
          onClose={() => setOpenTraining(null)}
        />
      )}

      {showStandings && (
        <StandingsModal
          tab={showStandings}
          age={age}
          standings={standings}
          clubRank={clubRank}
          onClose={() => setShowStandings(null)}
        />
      )}

      {showSubscribe && (
        <CalendarSubscribeModal
          feedUrl={(() => {
            const apiBase = (typeof window !== 'undefined' ? window.location.origin : '');
            const explicitApi = import.meta.env.VITE_API_BASE_URL;
            const base = explicitApi || apiBase;
            return base.replace(/\/+$/, '') + '/api/public/calendar/' + age + '.ics';
          })()}
          onClose={() => setShowSubscribe(false)}
        />
      )}
    </div>
  );
}

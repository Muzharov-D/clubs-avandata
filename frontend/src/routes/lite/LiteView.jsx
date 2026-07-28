// Lite — упрощённый разбор игрока для тренера.
//
// Шесть осей по амплуа, три главных подсвечены, остальные приглушены как
// контекст. Кто хочет глубже — уходит в полный профиль (28 осей по `stats`).
//
// Данные: /data/players/season — сезонный радар (среднее по матчам). Пер-матчевую
// пиццу сознательно НЕ берём: на одном матче выборка = шум.
//
// Команда берётся из общего TeamContext (переключатель уже есть в шапке) —
// свой селектор здесь не заводим, чтобы не было двух источников правды.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchPlayersSeason, fetchPlayerFeedback, savePlayerFeedback, fetchPlayerShare,
} from '../../services/api';
import { useTeam } from '../../contexts/TeamContext';
import PizzaChart from '../../components/PizzaChart';
import ShareSheet from './ShareSheet';
import { useAuth } from '../../contexts/AuthContext';
import {
  LINE_ORDER, LINE_SETS, LINE_PLURAL,
  lineOfPlayer, liteSlices, verdictOf,
} from './liteMetrics';
import './lite.css';

const num = (v, d = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—');
const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Строка игрока в списке состава. */
function SquadRow({ player, active, onPick }) {
  return (
    <button
      type="button"
      className={`lite-row${active ? ' lite-row--active' : ''}`}
      onClick={() => onPick(player)}
      aria-pressed={active}
    >
      <span className="lite-row__num">{player.number ?? '—'}</span>
      <span className="lite-row__main">
        <span className="lite-row__name">{player.fullName}</span>
        <span className="lite-row__pos">{player.positionDetail || player.position || '—'}</span>
      </span>
      <span className="lite-row__ov">{num(player.avgOverall)}</span>
    </button>
  );
}

const fmtDate = (s) => {
  const d = new Date(s);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

/**
 * Разбор для игрока: тренер пишет, игрок отвечает своим видением.
 * Приватно — виден только тренеру и самому игроку.
 */
function FeedbackBlock({ age, player }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    setItems(null); setText(''); setErr(''); setDone(false);
    if (!age || !player?.id) return undefined;
    fetchPlayerFeedback(age, player.id)
      .then((d) => alive && setItems(d?.items ?? []))
      // Пустая история — не ошибка: показываем чистое поле, а не текст сбоя.
      // Реальные сбои всплывут при отправке, там они и уместны.
      .catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [age, player?.id]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr(''); setDone(false);
    try {
      await savePlayerFeedback(age, player.id, t);
      const d = await fetchPlayerFeedback(age, player.id);
      setItems(d?.items ?? []); setText(''); setDone(true);
    } catch (e) {
      const raw = String(e?.message ?? e);
      setErr(/not found|404/i.test(raw)
        ? 'Сервис разборов ещё не готов — попробуйте через минуту'
        : `Не сохранилось: ${raw}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="lite-fb">
      <h3 className="lite-fb__t">Разбор для игрока</h3>
      <p className="lite-fb__hint">
        Видят только вы и сам игрок. Пишите про игру, а не про человека — и просите
        игрока ответить своим видением: цикл работает, когда он думает сам.
      </p>

      <textarea
        className="lite-fb__area"
        rows={4}
        maxLength={4000}
        placeholder={`Что ${player.fullName.split(' ')[0] || 'игрок'} сделал хорошо и над чем работаем к следующему матчу`}
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(false); }}
      />
      <div className="lite-fb__row">
        <button type="button" className="lite-btn" onClick={send} disabled={busy || !text.trim()}>
          {busy ? 'Сохраняем…' : 'Отправить игроку'}
        </button>
        {done && <span className="lite-fb__ok">Отправлено</span>}
        {err && <span className="lite-fb__err">{err}</span>}
      </div>

      {items === null && !err && <p className="lite-note">Загружаем прошлые разборы…</p>}
      {items?.length > 0 && (
        <ul className="lite-fb__list">
          {items.map((it) => (
            <li key={it.id} className="lite-fb__item">
              <div className="lite-fb__meta">{fmtDate(it.createdAt)}</div>
              <p className="lite-fb__coach">{it.coachText}</p>
              {it.playerText
                ? <p className="lite-fb__answer"><b>Ответ игрока:</b> {it.playerText}</p>
                : <p className="lite-fb__wait">Игрок ещё не ответил</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Тонкая строка состояния: что открыто игроку и есть ли у него вход.
 * Сама настройка живёт в листе — в карточке ей не место, она открывается редко.
 */
function ShareStrip({ age, player, onOpen, epoch }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    setState(null);
    fetchPlayerShare(age, player.id)
      .then((d) => alive && setState(d))
      .catch(() => alive && setState({ metrics: [], axes: [], access: null }));
    return () => { alive = false; };
  }, [age, player.id, epoch]);

  const labels = (state?.axes ?? [])
    .filter((a) => (state?.metrics ?? []).includes(a.key))
    .map((a) => a.label);
  const access = state?.access?.status;

  return (
    <button type="button" className="lite-strip" onClick={onOpen}>
      <span className="lite-strip__main">
        <span className="lite-strip__t">Игрок видит</span>
        <span className="lite-strip__v">
          {state === null ? '…' : labels.length ? labels.join(' · ') : 'только ваш разбор'}
          {state?.showOverall && ' · общий индекс'}
        </span>
      </span>
      <span className={`lite-strip__acc lite-strip__acc--${access ?? 'none'}`}>
        {access === 'active' ? 'вход есть' : access === 'invited' ? 'приглашён' : 'входа нет'}
      </span>
      <span className="lite-strip__go">Настроить</span>
    </button>
  );
}

/** Профиль игрока: вывод словами, пицца, три главных показателя. */
function PlayerCard({ player, peers, onCompare, compareLabel, compareDisabled, age, lite, onShare, shareEpoch }) {
  const { slices, line, poolSize } = useMemo(() => liteSlices(player, peers), [player, peers]);
  const verdict = useMemo(() => verdictOf(slices), [slices]);

  if (!line) {
    return (
      <div className="lite-card">
        <div className="lite-card__name">{player.fullName}</div>
        <p className="lite-note">
          У игрока не определено амплуа — профиль по позиции не строится.
          Позиция берётся из отчёта по матчам.
        </p>
      </div>
    );
  }

  const focusKeys = LINE_SETS[line].focus;
  const focusSlices = slices.filter((s) => focusKeys.includes(s.key));

  return (
    <div className="lite-card">
      <div className="lite-card__head">
        <div className="lite-who">
          <span className="lite-ava">
            {player.photoUrl
              ? <img src={player.photoUrl} alt="" />
              : <span className="lite-ava__ini">{initials(player.fullName)}</span>}
          </span>
          <div>
            <div className="lite-card__name">{player.fullName}</div>
            <div className="lite-card__meta">
              {player.positionDetail || player.position} · матчей {player.matches} ·
              {' '}в среднем {player.minutesPerMatch} мин
            </div>
          </div>
        </div>
        <div className="lite-card__ov">
          <b>{num(player.avgOverall)}</b>
          <span>общий</span>
        </div>
      </div>

      {/* Вывод словами — первым и крупно: это то, что тренер забирает с собой.
          Числа ниже объясняют вывод, а не заменяют его (контракт CLAUDE.md). */}
      {verdict && <p className="lite-verdict">{verdict.text}</p>}

      <div className="lite-card__pizza">
        <PizzaChart
          subjectName=""
          slices={slices}
          vsLabel={LINE_PLURAL[line]}
          centerLabel={LINE_SETS[line].label.toUpperCase()}
          size={620}
          showLegend={false}
        />
      </div>

      <div className="lite-focus">
        {focusSlices.map((s) => (
          <div key={s.key} className="lite-focus__item">
            <span className="lite-focus__val">{s.displayValue}</span>
            <span className="lite-focus__ax">{s.axis}</span>
            <span className="lite-focus__pct">выше {s.value}% {LINE_PLURAL[line]}</span>
          </div>
        ))}
      </div>

      <p className="lite-note">
        Длина сектора — место среди {LINE_PLURAL[line]} команды, число на секторе — сам
        показатель по десятибалльной шкале. Ярко выделены три главных для амплуа.
        {poolSize < 8 && ` Сравнение идёт всего с ${poolSize} игроками — доли приблизительны.`}
      </p>

      <div className="lite-actions">
        <button type="button" className="lite-btn lite-btn--ghost" onClick={onCompare} disabled={compareDisabled}>
          {compareLabel}
        </button>
        {/* На тарифе Lite полного профиля в кабинете нет — ссылке некуда вести. */}
        {!lite && (
          <Link className="lite-btn lite-btn--ghost" to={`/players/${encodeURIComponent(player.id)}`}>
            Подробный разбор
          </Link>
        )}
      </div>

      {age && <FeedbackBlock age={age} player={player} />}
      {age && <ShareStrip age={age} player={player} epoch={shareEpoch} onOpen={() => onShare(player)} />}
    </div>
  );
}

export default function LiteView() {
  const { selectedTeamId, selectedTeam } = useTeam();
  const { tenant } = useAuth();
  const lite = tenant?.plan === 'lite';
  // Кого настраиваем в листе. null — лист закрыт (частый путь ничем не занят).
  const [sharing, setSharing] = useState(null);
  // Строку состояния перечитываем после закрытия листа — иначе она врала бы
  // про «игрок видит», пока тренер не обновит страницу.
  const [shareEpoch, setShareEpoch] = useState(0);
  // teams.id = `{slug}-{age}` — возраст нужен роутам разбора (адресация как в callups).
  const age = selectedTeam?.ageGroup ?? (selectedTeamId ? String(selectedTeamId).split('-').pop() : '');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pickedId, setPickedId] = useState(null);
  const [rivalId, setRivalId] = useState(null);
  const [choosingRival, setChoosingRival] = useState(false);

  useEffect(() => {
    if (!selectedTeamId) return;
    let alive = true;
    setLoading(true); setErr(''); setPickedId(null); setRivalId(null); setChoosingRival(false);
    fetchPlayersSeason(selectedTeamId)
      .then((d) => { if (alive) { setPlayers(d?.players ?? []); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { alive = false; };
  }, [selectedTeamId]);

  // Состав по линиям. Группа берётся с бэкенда — единый источник позиции.
  const byLine = useMemo(() => {
    const acc = { GK: [], DEF: [], MID: [], FWD: [], NONE: [] };
    for (const p of players) acc[lineOfPlayer(p) ?? 'NONE'].push(p);
    for (const k of Object.keys(acc)) acc[k].sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0));
    return acc;
  }, [players]);

  // Экран никогда не должен встречать тренера пустой панелью: как только состав
  // загружен — открываем сильнейшего игрока.
  const ordered = useMemo(
    () => LINE_ORDER.flatMap((l) => byLine[l]).concat(byLine.NONE),
    [byLine],
  );
  useEffect(() => {
    if (!pickedId && ordered.length) {
      const best = [...ordered].sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0))[0];
      setPickedId(best?.id ?? null);
    }
  }, [ordered, pickedId]);

  const picked = ordered.find((p) => p.id === pickedId) ?? null;
  const rival = ordered.find((p) => p.id === rivalId) ?? null;

  const peersOf = (p) => {
    const l = lineOfPlayer(p);
    return l ? players.filter((x) => lineOfPlayer(x) === l) : [];
  };

  const rivalCandidates = picked
    ? players.filter((x) => x.id !== picked.id && lineOfPlayer(x) === lineOfPlayer(picked))
    : [];

  const onPick = (p) => {
    if (choosingRival && picked && p.id !== picked.id) {
      if (lineOfPlayer(p) !== lineOfPlayer(picked)) return; // сравниваем только внутри амплуа
      setRivalId(p.id); setChoosingRival(false);
      return;
    }
    setPickedId(p.id); setRivalId(null); setChoosingRival(false);
  };

  return (
    <div className="lite">
      <header className="lite-head">
        <div>
          <h1 className="lite-title">Разбор игрока</h1>
          <p className="lite-sub">
            Шесть показателей по амплуа, три главных выделены
            {selectedTeam?.name ? ` · ${selectedTeam.name}` : ''}
          </p>
        </div>
      </header>

      {err && <p className="lite-error">Не удалось загрузить состав: {err}</p>}
      {loading && <p className="lite-note">Загружаем состав…</p>}

      {!loading && !err && !players.length && (
        <div className="lite-empty">
          <p>У этой команды пока нет разобранных матчей — профили появятся после первого разбора.</p>
        </div>
      )}

      {!loading && !err && players.length > 0 && (
        <div className="lite-grid">
          <aside className="lite-squad">
            {choosingRival && (
              <p className="lite-hint">Выберите второго {LINE_PLURAL[lineOfPlayer(picked)] ? 'игрока того же амплуа' : 'игрока'}</p>
            )}
            {LINE_ORDER.map((l) => (
              byLine[l].length > 0 && (
                <section key={l} className="lite-line">
                  <h2 className="lite-line__t">{LINE_SETS[l].label}</h2>
                  {byLine[l].map((p) => (
                    <SquadRow
                      key={p.id}
                      player={p}
                      active={picked?.id === p.id || rival?.id === p.id}
                      onPick={onPick}
                    />
                  ))}
                </section>
              )
            ))}
            {byLine.NONE.length > 0 && (
              <section className="lite-line">
                <h2 className="lite-line__t">Без амплуа</h2>
                {byLine.NONE.map((p) => (
                  <SquadRow key={p.id} player={p} active={picked?.id === p.id} onPick={onPick} />
                ))}
              </section>
            )}
          </aside>

          <main className="lite-stage">
            {picked && (
              <div className={`lite-compare${rival ? ' lite-compare--two' : ''}`}>
                <PlayerCard
                  player={picked}
                  peers={peersOf(picked)}
                  age={age}
                  lite={lite}
                  onShare={setSharing}
                  shareEpoch={shareEpoch}
                  compareDisabled={!rival && rivalCandidates.length === 0}
                  compareLabel={
                    rival ? 'Убрать сравнение'
                      : rivalCandidates.length ? 'Сравнить с игроком'
                        : 'Сравнивать не с кем'
                  }
                  onCompare={() => {
                    if (rival) { setRivalId(null); return; }
                    if (rivalCandidates.length) setChoosingRival(true);
                  }}
                />
                {rival && (
                  <PlayerCard
                    player={rival}
                    peers={peersOf(rival)}
                    age={age}
                    lite={lite}
                    onShare={setSharing}
                    shareEpoch={shareEpoch}
                    compareLabel="Убрать"
                    onCompare={() => setRivalId(null)}
                  />
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {sharing && (
        <ShareSheet
          age={age}
          player={sharing}
          onClose={() => { setSharing(null); setShareEpoch((n) => n + 1); }}
          onSaved={() => setShareEpoch((n) => n + 1)}
        />
      )}
    </div>
  );
}

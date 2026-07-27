// Lite — упрощённый экран тренера.
//
// Задача: тренер за один взгляд видит профиль игрока по своей позиции — 6 осей,
// из них 3 главных подсвечены. Всё лишнее убрано. Кто хочет глубже — жмёт
// «Подробный разбор» и уходит в полный профиль (28 осей по `stats`).
//
// Данные: /data/players/season — сезонный радар (среднее по матчам). Пер-матчевую
// пиццу сознательно НЕ берём: на одном матче выборка = шум.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTeams, fetchPlayersSeason } from '../../services/api';
import PizzaChart from '../../components/PizzaChart';
import {
  LINE_ORDER, LINE_SETS, LINE_PLURAL, AXIS_LABEL,
  lineOfPlayer, liteSlices, verdictOf,
} from './liteMetrics';
import './lite.css';

const num = (v, d = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—');

/** Карточка игрока в списке состава. */
function SquadRow({ player, active, onPick }) {
  return (
    <button
      type="button"
      className={`lite-row${active ? ' lite-row--active' : ''}`}
      onClick={() => onPick(player)}
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

/** Профиль игрока: пицца + словесный вывод + три фокусных показателя. */
function PlayerCard({ player, peers, onCompare, compareLabel }) {
  const { slices, line, poolSize } = useMemo(() => liteSlices(player, peers), [player, peers]);
  const verdict = useMemo(() => verdictOf(slices), [slices]);

  if (!line) {
    return (
      <div className="lite-card lite-card--empty">
        <div className="lite-card__name">{player.fullName}</div>
        <p className="lite-note">Позиция игрока не определена — профиль по амплуа не строится.</p>
      </div>
    );
  }

  const focusKeys = LINE_SETS[line].focus;
  const focusSlices = slices.filter((s) => focusKeys.includes(s.key));

  return (
    <div className="lite-card">
      <div className="lite-card__head">
        <div>
          <div className="lite-card__name">{player.fullName}</div>
          <div className="lite-card__meta">
            {LINE_SETS[line].label} · {player.positionDetail || player.position} ·
            {' '}матчей {player.matches} · в среднем {player.minutesPerMatch} мин
          </div>
        </div>
        <div className="lite-card__ov">
          <b>{num(player.avgOverall)}</b>
          <span>общий</span>
        </div>
      </div>

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

      {verdict && <p className="lite-verdict">{verdict.text}</p>}

      <p className="lite-note">
        Длина сектора — место среди {LINE_PLURAL[line]} команды, число на секторе — сам показатель
        по десятибалльной шкале. Ярко выделены три главных для амплуа, остальные три — для контекста.
        {poolSize < 8 && ` Сравнение идёт всего с ${poolSize} игроками — на малой группе доли приблизительны.`}
      </p>

      <div className="lite-actions">
        <button type="button" className="lite-btn" onClick={onCompare}>{compareLabel}</button>
        <Link className="lite-btn lite-btn--ghost" to={`/players/${encodeURIComponent(player.id)}`}>
          Подробный разбор
        </Link>
      </div>
    </div>
  );
}

export default function LiteView() {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState(null);
  const [rival, setRival] = useState(null);
  const [choosingRival, setChoosingRival] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTeams()
      .then((d) => {
        if (!alive) return;
        const list = d?.teams ?? d ?? [];
        setTeams(list);
        if (list.length && !teamId) setTeamId(list[0].id ?? list[0].teamId ?? '');
      })
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    setLoading(true); setErr(''); setPicked(null); setRival(null);
    fetchPlayersSeason(teamId)
      .then((d) => { if (alive) { setPlayers(d?.players ?? []); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { alive = false; };
  }, [teamId]);

  // Состав по линиям — группа берётся с бэкенда (единый источник позиции).
  const byLine = useMemo(() => {
    const acc = { GK: [], DEF: [], MID: [], FWD: [], NONE: [] };
    for (const p of players) {
      const l = lineOfPlayer(p);
      acc[l ?? 'NONE'].push(p);
    }
    for (const k of Object.keys(acc)) {
      acc[k].sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0));
    }
    return acc;
  }, [players]);

  const peersOf = (p) => {
    const l = lineOfPlayer(p);
    return l ? players.filter((x) => lineOfPlayer(x) === l) : [];
  };

  const onPick = (p) => {
    if (choosingRival && picked && p.id !== picked.id) {
      if (lineOfPlayer(p) !== lineOfPlayer(picked)) return; // сравниваем только внутри амплуа
      setRival(p); setChoosingRival(false);
      return;
    }
    setPicked(p); setRival(null); setChoosingRival(false);
  };

  const rivalCandidates = picked
    ? players.filter((x) => x.id !== picked.id && lineOfPlayer(x) === lineOfPlayer(picked))
    : [];

  return (
    <div className="lite">
      <header className="lite-head">
        <div>
          <h1 className="lite-title">Разбор игрока</h1>
          <p className="lite-sub">Шесть показателей по амплуа. Три главных — выделены.</p>
        </div>
        {teams.length > 1 && (
          <select
            className="lite-select"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            aria-label="Команда"
          >
            {teams.map((t) => (
              <option key={t.id ?? t.teamId} value={t.id ?? t.teamId}>
                {t.name ?? t.title ?? t.ageGroup ?? t.id}
              </option>
            ))}
          </select>
        )}
      </header>

      {err && <p className="lite-error">Не удалось загрузить данные: {err}</p>}
      {loading && <p className="lite-note">Загружаем состав…</p>}

      {!loading && !err && (
        <div className="lite-grid">
          <aside className="lite-squad">
            {choosingRival && (
              <p className="lite-hint">Выберите второго игрока того же амплуа для сравнения</p>
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
            {!players.length && <p className="lite-note">В этой команде пока нет разобранных матчей.</p>}
          </aside>

          <main className="lite-stage">
            {!picked && (
              <div className="lite-placeholder">
                <p>Выберите игрока слева — покажем его профиль по позиции.</p>
              </div>
            )}

            {picked && (
              <div className={`lite-compare${rival ? ' lite-compare--two' : ''}`}>
                <PlayerCard
                  player={picked}
                  peers={peersOf(picked)}
                  compareLabel={rival ? 'Убрать сравнение' : 'Сравнить с игроком'}
                  onCompare={() => {
                    if (rival) { setRival(null); return; }
                    if (rivalCandidates.length) setChoosingRival(true);
                  }}
                />
                {rival && (
                  <PlayerCard
                    player={rival}
                    peers={peersOf(rival)}
                    compareLabel="Убрать"
                    onCompare={() => setRival(null)}
                  />
                )}
              </div>
            )}

            {picked && !rival && rivalCandidates.length === 0 && (
              <p className="lite-note">
                Сравнивать не с кем: в команде нет другого игрока этого амплуа с разобранными матчами.
              </p>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

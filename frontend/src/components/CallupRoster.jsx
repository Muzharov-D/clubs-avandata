// CallupRoster — модалка для тренера: «Состав на матч».
// Поведение Model C: тренер сам формирует список из игроков команды,
// затем нажимает «Отправить призыв» — все добавленные получают push.
// Игроки могут ответить (Иду / Не смогу / Уваж.), это видно в списке.

import { useEffect, useState } from 'react';
import {
  fetchCallupsByMatch, callPlayers, removeFromCallup, respondCallup,
  fetchPlayers,
} from '../services/api';
import { getToken } from '../services/api';
import './CallupRoster.css';

const STATUS_LABELS = {
  pending:   { label: '— добавлен —', cls: 'pending', icon: '·' },
  called:    { label: 'Призван',  cls: 'called',  icon: '📞' },
  confirmed: { label: 'Идёт',     cls: 'go',      icon: '✓' },
  declined:  { label: 'Не идёт',  cls: 'no',      icon: '✗' },
  excused:   { label: 'Уваж.',    cls: 'excused', icon: '✎' },
};

const apiBase = import.meta.env.VITE_API_BASE_URL || '';
const PREFIX = `${apiBase.replace(/\/+$/, '')}/api`;

async function notifyAll(age, extMatchId) {
  const token = getToken();
  const res = await fetch(`${PREFIX}/callups/match/${encodeURIComponent(age)}/${encodeURIComponent(extMatchId)}/notify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(JSON.parse(t).error || `HTTP ${res.status}`);
  }
  return res.json();
}

// На год младше: 2010 → 2011 → 2012 → 2013 → null. Тренер старшей команды
// может вызвать игроков из младшей (стандартная практика «play-down» в детском футболе).
function youngerAgeOf(age) {
  const n = parseInt(age, 10);
  if (!Number.isFinite(n)) return null;
  const next = n + 1;
  // Допустим до 2013 (наш самый младший возраст)
  return next <= 2013 ? String(next) : null;
}

export default function CallupRoster({ match, age, teamId, onClose }) {
  const [roster, setRoster] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [youngerPlayers, setYoungerPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [youngerExpanded, setYoungerExpanded] = useState(false);

  const youngerAge = youngerAgeOf(age);
  const youngerTeamId = youngerAge ? `legirus-${youngerAge}` : null;

  async function load() {
    if (!match?.matchId || !age) return;
    setLoading(true);
    setErr(null);
    try {
      const promises = [
        fetchCallupsByMatch(age, match.matchId),
        fetchPlayers(teamId),
      ];
      if (youngerTeamId) promises.push(fetchPlayers(youngerTeamId));
      const results = await Promise.all(promises);
      setRoster(results[0].callups || []);
      setAllPlayers(results[1].players || []);
      setYoungerPlayers(results[2]?.players || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [match?.matchId, age]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!match) return null;

  const rosterIds = new Set(roster.map((r) => r.playerId));
  const notIn = allPlayers.filter((p) => !rosterIds.has(p.id));

  // Сводка
  const counts = roster.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const total = roster.length;
  const ready = (counts.confirmed || 0);
  const declined = (counts.declined || 0);
  const excused = (counts.excused || 0);
  const noAnswer = (counts.pending || 0) + (counts.called || 0);
  const hasUnsent = (counts.pending || 0) > 0;

  async function handleAddPlayer(playerId) {
    setBusy('add-' + playerId);
    try { await callPlayers(age, match.matchId, [playerId]); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function handleAddAll() {
    setBusy('add-all');
    try {
      const ids = notIn.map((p) => p.id);
      if (ids.length > 0) await callPlayers(age, match.matchId, ids);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function handleRemove(playerId) {
    setBusy('rem-' + playerId);
    try { await removeFromCallup(age, match.matchId, playerId); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function handleNotify() {
    if (!window.confirm(`Отправить призыв ${total} игрокам? Каждый получит push-уведомление.`)) return;
    setBusy('notify');
    setNotice(null);
    try {
      const r = await notifyAll(age, match.matchId);
      setNotice(`Отправлено ${r.notified} игрокам${r.push?.sent ? ` · push: ${r.push.sent}` : ''}`);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function handleSetStatus(playerId, status) {
    setBusy('set-' + playerId);
    try { await respondCallup(age, match.matchId, status, null, playerId); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  return (
    <div className="cr-backdrop" onClick={onClose}>
      <div className="cr-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="cr-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="cr-head">
          <h3>Состав на матч</h3>
          <div className="cr-match">{match.home} — {match.away}</div>
        </div>

        <div className="cr-summary">
          <div className="cr-stat cr-stat--total"><b>{total}</b><span>в составе</span></div>
          <div className="cr-stat cr-stat--go"><b>{ready}</b><span>идут</span></div>
          <div className="cr-stat cr-stat--no"><b>{declined}</b><span>не идут</span></div>
          <div className="cr-stat cr-stat--excused"><b>{excused}</b><span>уваж.</span></div>
          <div className="cr-stat cr-stat--pending"><b>{noAnswer}</b><span>без ответа</span></div>
        </div>

        {loading && <div className="cr-empty">Загрузка...</div>}
        {err && <div className="cr-err">{err}</div>}
        {notice && <div className="cr-notice">{notice}</div>}

        {!loading && (
          <>
            <div className="cr-actions">
              {total > 0 && (
                <button
                  className="cr-call-all"
                  disabled={busy === 'notify' || total === 0}
                  onClick={handleNotify}
                  title={hasUnsent
                    ? 'Часть игроков ещё не уведомлены — отправит всем (включая повторно тех кто уже видел)'
                    : 'Отправить всем игрокам в составе push «ты в составе»'}
                >
                  {busy === 'notify'
                    ? 'Отправляем...'
                    : hasUnsent
                      ? `📨 Отправить призыв (${total})`
                      : `📨 Уведомить ещё раз (${total})`}
                </button>
              )}
              {notIn.length > 0 && (
                <button
                  className="cr-add-all"
                  disabled={busy === 'add-all'}
                  onClick={handleAddAll}
                  title="Добавить всех игроков команды в состав (потом можно убрать лишних)"
                >
                  {busy === 'add-all' ? 'Добавляем...' : `+ Добавить всех (${notIn.length})`}
                </button>
              )}
            </div>

            <div className="cr-list">
              {roster.length > 0 && <div className="cr-section-title">В составе ({roster.length})</div>}
              {roster.map((r) => {
                const meta = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
                return (
                  <div key={r.playerId} className={`cr-row cr-row--${meta.cls}`}>
                    <div className="cr-player">
                      {r.playerNumber != null && <b>{r.playerNumber}</b>}
                      <span>{r.playerName}</span>
                    </div>
                    <div className="cr-status">
                      <span className="cr-status-icon">{meta.icon}</span>
                      <span>{meta.label}</span>
                    </div>
                    <div className="cr-row-actions">
                      <select
                        value={r.status}
                        disabled={busy === 'set-' + r.playerId}
                        onChange={(e) => handleSetStatus(r.playerId, e.target.value)}
                      >
                        <option value="pending" disabled>— добавлен —</option>
                        <option value="called">Призван</option>
                        <option value="confirmed">Идёт</option>
                        <option value="declined">Не идёт</option>
                        <option value="excused">Уваж.</option>
                      </select>
                      <button
                        className="cr-remove"
                        disabled={busy === 'rem-' + r.playerId}
                        onClick={() => handleRemove(r.playerId)}
                        title="Убрать из состава"
                      >×</button>
                    </div>
                  </div>
                );
              })}

              {notIn.length > 0 && (
                <>
                  <div className="cr-section-title">Не в составе ({notIn.length})</div>
                  {notIn.map((p) => (
                    <div key={p.id} className="cr-row cr-row--out">
                      <div className="cr-player">
                        {p.number != null && <b>{p.number}</b>}
                        <span>{p.fullName}</span>
                      </div>
                      <div className="cr-status">—</div>
                      <div className="cr-row-actions">
                        <button
                          className="cr-add"
                          disabled={busy === 'add-' + p.id}
                          onClick={() => handleAddPlayer(p.id)}
                        >+ Добавить</button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Раздел «На год младше» — игроки из младшей команды, которых тренер старшей может вызвать */}
              {youngerAge && (() => {
                const ynotIn = youngerPlayers.filter((p) => !rosterIds.has(p.id));
                if (ynotIn.length === 0) return null;
                return (
                  <>
                    <button
                      className="cr-younger-toggle"
                      onClick={() => setYoungerExpanded(!youngerExpanded)}
                    >
                      <span>{youngerExpanded ? '▼' : '▶'} 👶 Игроки {youngerAge}</span>
                      <span className="cr-younger-count">{ynotIn.length}</span>
                    </button>
                    {youngerExpanded && ynotIn.map((p) => (
                      <div key={p.id} className="cr-row cr-row--younger">
                        <div className="cr-player">
                          {p.number != null && <b>{p.number}</b>}
                          <span>{p.fullName}</span>
                          <span className="cr-younger-tag">{youngerAge}</span>
                        </div>
                        <div className="cr-status">—</div>
                        <div className="cr-row-actions">
                          <button
                            className="cr-add"
                            disabled={busy === 'add-' + p.id}
                            onClick={() => handleAddPlayer(p.id)}
                          >+ Добавить</button>
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            {roster.length === 0 && (
              <div className="cr-helper">
                Состав пустой. Нажмите «<b>+ Добавить</b>» рядом с игроком, чтобы включить в состав. Когда состав готов — нажмите «<b>📨 Отправить призыв</b>», и каждый получит push-уведомление.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

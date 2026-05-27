// /trainings — управление тренировками команды (Sprint 5.1).
// Только для тренеров (head_coach / team_coach). Игроки видят свой профиль,
// где будет блок "Посещаемость" (Sprint 5.3).
//
// Возможности:
//   - Список ближайших / прошедших тренировок
//   - Создание/редактирование/удаление
//   - Массовая отметка посещаемости (presence | absent | late | excused)

import { useEffect, useMemo, useState } from 'react';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchTrainingsByTeam, createTraining, updateTraining, deleteTraining,
  fetchAttendance, saveAttendance, fetchPlayers,
} from '../services/api';
import './TrainingsPage.css';

const TYPES = [
  { id: 'training', label: 'Тренировка' },
  { id: 'extra',    label: 'Доп. занятие' },
  { id: 'warmup',   label: 'Разминка перед матчем' },
  { id: 'recovery', label: 'Восстановление' },
  { id: 'meet',     label: 'Сбор / разбор' },
];

const STATUS = [
  { id: 'present',  label: 'Был',          short: '✓', cls: 'present' },
  { id: 'late',     label: 'Опоздание',    short: '⏱', cls: 'late' },
  { id: 'excused',  label: 'Уваж. причина',short: '✎', cls: 'excused' },
  { id: 'absent',   label: 'Прогул',       short: '✗', cls: 'absent' },
];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local) {
  // <input type="datetime-local"> возвращает '2026-05-08T17:00' без TZ.
  // Считаем как МСК (+03:00).
  if (!local) return null;
  return `${local}:00+03:00`;
}

export default function TrainingsPage() {
  const { selectedTeam } = useTeam();
  const { user, isCoach, isHeadCoach } = useAuth();
  const teamId = selectedTeam?.id;

  const [scope, setScope] = useState('upcoming');
  const [trainings, setTrainings] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);   // training object | 'new' | null
  const [openAttendance, setOpenAttendance] = useState(null); // training id | null

  const canManage = useMemo(() => {
    if (!user || !teamId) return false;
    if (isHeadCoach) return true;
    return user.role === 'team_coach' && user.teamId === teamId;
  }, [user, teamId, isHeadCoach]);

  // Загрузка тренировок и игроков
  async function reload() {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [trs, pls] = await Promise.all([
        fetchTrainingsByTeam(teamId, { scope }),
        fetchPlayers(teamId),
      ]);
      setTrainings(trs.trainings || []);
      setPlayers(pls.players || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [teamId, scope]);

  if (!isCoach) {
    return (
      <div className="trainings-page">
        <div className="trainings-page__empty">Раздел доступен только тренерам.</div>
      </div>
    );
  }

  return (
    <div className="trainings-page">
      <header className="trainings-page__head">
        <div>
          <h1 className="trainings-page__title">Тренировки</h1>
          <div className="trainings-page__subtitle">
            {selectedTeam?.name || '—'} · {trainings.length} {scope === 'upcoming' ? 'предстоящих' : scope === 'past' ? 'прошедших' : 'всего'}
          </div>
        </div>
        {canManage && (
          <button className="trainings-page__add" onClick={() => setEditing('new')}>
            + Добавить
          </button>
        )}
      </header>

      <div className="trainings-page__filters">
        {[
          { id: 'upcoming', label: 'Предстоящие' },
          { id: 'past',     label: 'Прошедшие' },
          { id: 'all',      label: 'Все' },
        ].map((f) => (
          <button
            key={f.id}
            className={`trainings-page__filter ${scope === f.id ? 'is-active' : ''}`}
            onClick={() => setScope(f.id)}
          >{f.label}</button>
        ))}
      </div>

      {loading && <div className="trainings-page__empty">Загрузка...</div>}
      {error && <div className="trainings-page__empty trainings-page__empty--error">{error}</div>}

      {!loading && !error && trainings.length === 0 && (
        <div className="trainings-page__empty">
          {scope === 'upcoming' ? 'Будущих тренировок нет — создайте первую' : 'Нет записей'}
        </div>
      )}

      <div className="trainings-page__list">
        {trainings.map((t) => (
          <article key={t.id} className="tr-card">
            <div className="tr-card__main">
              <div className="tr-card__date">{fmtDate(t.startsAt)}</div>
              <div className="tr-card__type">
                {TYPES.find((x) => x.id === t.type)?.label || t.type}
                {' · '}{t.durationMin} мин
              </div>
              {(t.venueText || t.venueId) && (
                <div className="tr-card__venue">📍 {t.venueText || t.venueId}</div>
              )}
              {t.notes && <div className="tr-card__notes">{t.notes}</div>}
            </div>
            <div className="tr-card__actions">
              <button onClick={() => setOpenAttendance(t.id)}>Посещаемость</button>
              {canManage && (
                <>
                  <button onClick={() => setEditing(t)}>Изм.</button>
                  <button
                    className="tr-card__delete"
                    onClick={async () => {
                      if (!window.confirm('Удалить тренировку?')) return;
                      try {
                        await deleteTraining(t.id);
                        await reload();
                      } catch (e) { alert(e.message); }
                    }}
                  >Удалить</button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <TrainingForm
          training={editing === 'new' ? null : editing}
          teamId={teamId}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}

      {openAttendance && (
        <AttendanceSheet
          trainingId={openAttendance}
          players={players}
          canManage={canManage}
          onClose={() => setOpenAttendance(null)}
        />
      )}
    </div>
  );
}

// === Форма создания/редактирования ===
function TrainingForm({ training, teamId, onClose, onSaved }) {
  const init = training || {};
  const [startsAtLocal, setStartsAtLocal] = useState(
    init.startsAt ? toLocalInput(init.startsAt) : toLocalInput(new Date(Date.now() + 24 * 3600e3).toISOString())
  );
  const [duration, setDuration] = useState(init.durationMin || 90);
  const [type, setType] = useState(init.type || 'training');
  const [venueText, setVenueText] = useState(init.venueText || '');
  const [notes, setNotes] = useState(init.notes || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const body = {
        teamId,
        startsAt: fromLocalInput(startsAtLocal),
        durationMin: Number(duration) || 90,
        type,
        venueText: venueText || null,
        notes: notes || null,
      };
      if (training?.id) await updateTraining(training.id, body);
      else              await createTraining(body);
      await onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tr-modal" onClick={onClose}>
      <form className="tr-modal__panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="tr-modal__head">
          <h3>{training ? 'Изменить тренировку' : 'Новая тренировка'}</h3>
          <button type="button" className="tr-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <label className="tr-field">
          <span>Дата и время</span>
          <input type="datetime-local" value={startsAtLocal} onChange={(e) => setStartsAtLocal(e.target.value)} required />
        </label>

        <div className="tr-row">
          <label className="tr-field">
            <span>Длительность (мин)</span>
            <input type="number" min="15" max="240" step="5" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </label>
          <label className="tr-field">
            <span>Тип</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        </div>

        <label className="tr-field">
          <span>Место (Балтика, Кировец и т.п.)</span>
          <input type="text" value={venueText} onChange={(e) => setVenueText(e.target.value)} placeholder="Поле / стадион" />
        </label>

        <label className="tr-field">
          <span>Заметка (необязательно)</span>
          <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Установка, акцент тренировки..." />
        </label>

        {err && <div className="tr-modal__err">{err}</div>}

        <div className="tr-modal__actions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="submit" disabled={saving} className="tr-modal__primary">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}

// === Лист посещаемости ===
function AttendanceSheet({ trainingId, players, canManage, onClose }) {
  const [att, setAtt] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchAttendance(trainingId).then((r) => {
      if (!alive) return;
      const map = {};
      for (const [pid, val] of Object.entries(r.attendance || {})) map[pid] = val.status;
      setAtt(map);
    }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [trainingId]);

  function setStatus(playerId, status) {
    setAtt((prev) => ({ ...prev, [playerId]: prev[playerId] === status ? null : status }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const marks = {};
      for (const [pid, status] of Object.entries(att)) if (status) marks[pid] = status;
      await saveAttendance(trainingId, marks);
      setDirty(false);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  function bulk(status) {
    const map = {};
    for (const p of players) map[p.id] = status;
    setAtt(map);
    setDirty(true);
  }

  return (
    <div className="tr-modal" onClick={onClose}>
      <div className="tr-modal__panel tr-modal__panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="tr-modal__head">
          <h3>Посещаемость</h3>
          <button type="button" className="tr-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        {canManage && (
          <div className="tr-bulk">
            <span>Отметить всех:</span>
            <button type="button" onClick={() => bulk('present')}>✓ Все были</button>
            <button type="button" onClick={() => bulk('absent')}>✗ Никто</button>
          </div>
        )}

        <div className="tr-att">
          {players.length === 0 && <div className="trainings-page__empty">Нет игроков в команде</div>}
          {players.map((p) => {
            const cur = att[p.id];
            return (
              <div key={p.id} className="tr-att__row">
                <div className="tr-att__name">
                  {p.number ? <b>{p.number}</b> : null} {p.fullName}
                </div>
                <div className="tr-att__btns">
                  {STATUS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!canManage}
                      className={`tr-att__btn tr-att__btn--${s.cls} ${cur === s.id ? 'is-on' : ''}`}
                      onClick={() => setStatus(p.id, s.id)}
                      title={s.label}
                    >{s.short}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {err && <div className="tr-modal__err">{err}</div>}

        <div className="tr-modal__actions">
          <button type="button" onClick={onClose}>Закрыть</button>
          {canManage && (
            <button type="button" disabled={!dirty || saving} className="tr-modal__primary" onClick={save}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

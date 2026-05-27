import { useState } from 'react';
import { updateMatchCoachComment } from '../services/api';
import './CoachCommentForm.css';

export default function CoachCommentForm({ age, extMatchId, initialValue, onSaved }) {
  const [value, setValue] = useState(initialValue || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [okFlash, setOkFlash] = useState(false);

  async function handleSave() {
    setErr(null);
    setSaving(true);
    try {
      const res = await updateMatchCoachComment(age, extMatchId, value);
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 1800);
      if (typeof onSaved === 'function') onSaved(res?.coachComment ?? value);
    } catch (e) {
      setErr(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="coach-comment-form">
      <label className="coach-comment-form__label">Комментарий после матча</label>
      <textarea
        className="coach-comment-form__textarea"
        rows={4}
        maxLength={4000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Краткий разбор матча для родителей: что получилось, над чем работаем дальше…"
      />
      <div className="coach-comment-form__actions">
        <span className="coach-comment-form__count">{value.length} / 4000</span>
        <button
          type="button"
          className="coach-comment-form__save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Сохраняю…' : okFlash ? 'Сохранено ✓' : 'Сохранить'}
        </button>
      </div>
      {err && <div className="coach-comment-form__err">{err}</div>}
    </div>
  );
}

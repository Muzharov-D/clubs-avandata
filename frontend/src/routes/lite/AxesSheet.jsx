// «Показатели по амплуа» — тренер собирает наборы сам.
//
// ПОЧЕМУ ЭТО ЕСТЬ. Наборы были зашиты в коде, и владелец справедливо возразил:
// какие показатели ключевые для позиции — решает тренер, это его методика, а не
// наш выбор. Здесь весь каталог показателей, у каждого есть опора в базовых 36.
//
// Набор общий для клуба: методика не меняется от команды к команде. Менять может
// старший тренер; остальные видят, но не правят.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLiteConfig, saveLineAxes, resetLineAxes } from '../../services/api';

const GROUP_LABEL = { attack: 'Атака', defence: 'Оборона' };

export default function AxesSheet({ canEdit, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [line, setLine] = useState('FWD');
  const [draft, setDraft] = useState(null);      // { axes, focus } редактируемого амплуа
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchLiteConfig()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Черновик заводим на выбранное амплуа: правки не должны применяться, пока
  // тренер не сохранил — иначе полкоманды увидит недособранный набор.
  const current = useMemo(() => data?.lines?.find((l) => l.line === line) ?? null, [data, line]);
  useEffect(() => {
    if (current) setDraft({ axes: [...current.axes], focus: [...current.focus] });
    setSaved(false); setErr('');
  }, [current]);

  if (err && !data) return null;
  const limits = data?.limits ?? { minAxes: 4, maxAxes: 8, maxFocus: 4 };

  const toggleAxis = (key) => {
    if (!canEdit || !draft) return;
    setSaved(false);
    setDraft((d) => {
      const on = d.axes.includes(key);
      if (on) {
        return { axes: d.axes.filter((k) => k !== key), focus: d.focus.filter((k) => k !== key) };
      }
      if (d.axes.length >= limits.maxAxes) return d;
      return { ...d, axes: [...d.axes, key] };
    });
  };

  const toggleFocus = (key) => {
    if (!canEdit || !draft || !draft.axes.includes(key)) return;
    setSaved(false);
    setDraft((d) => {
      const on = d.focus.includes(key);
      if (on) return { ...d, focus: d.focus.filter((k) => k !== key) };
      if (d.focus.length >= limits.maxFocus) return d;
      return { ...d, focus: [...d.focus, key] };
    });
  };

  const reload = async () => {
    const d = await fetchLiteConfig();
    setData(d);
    onSaved?.();
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true); setErr(''); setSaved(false);
    try {
      await saveLineAxes(line, draft.axes, draft.focus);
      await reload();
      setSaved(true);
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (busy) return;
    setBusy(true); setErr(''); setSaved(false);
    try {
      await resetLineAxes(line);
      await reload();
      setSaved(true);
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const byGroup = (g) => (data?.catalog ?? []).filter((a) => a.group === g);
  const tooFew = draft ? draft.axes.length < limits.minAxes : false;
  const dirty = draft && current
    && (draft.axes.join() !== current.axes.join() || draft.focus.join() !== current.focus.join());

  return (
    <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="sheet sheet--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Показатели по амплуа"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="sheet__head">
          <div>
            <h2 className="sheet__t">Показатели по амплуа</h2>
            <p className="sheet__sub">
              {canEdit
                ? 'Что считать ключевым для позиции — решаете вы. Набор общий для клуба.'
                : 'Набор задаёт старший тренер. Здесь видно, что выбрано.'}
            </p>
          </div>
          <button type="button" className="sheet__x" onClick={onClose} aria-label="Закрыть">✕</button>
        </header>

        <div className="ax-tabs" role="tablist">
          {(data?.lines ?? []).map((l) => (
            <button
              key={l.line}
              type="button"
              role="tab"
              aria-selected={l.line === line}
              className={`ax-tab${l.line === line ? ' ax-tab--on' : ''}`}
              onClick={() => setLine(l.line)}
            >
              {l.label}
              {!l.isDefault && <i className="ax-tab__dot" title="набор изменён" />}
            </button>
          ))}
        </div>

        <div className="sheet__body">
          {!data && <p className="lite-note">Загружаем каталог…</p>}

          {draft && (
            <>
              <p className="sheet__hint">
                Отметьте показатели амплуа — они станут секторами пиццы. Из них выберите
                главные: их видно крупно, и именно они по умолчанию открыты игроку.
                Сейчас выбрано {draft.axes.length} из {limits.maxAxes}, главных {draft.focus.length}.
              </p>

              {['attack', 'defence'].map((g) => (
                <section key={g} className="ax-group">
                  <h3 className="ax-group__t">{GROUP_LABEL[g]}</h3>
                  <div className="ax-list">
                    {byGroup(g).map((a) => {
                      const on = draft.axes.includes(a.key);
                      const isFocus = draft.focus.includes(a.key);
                      return (
                        <div key={a.key} className={`ax-row${on ? ' ax-row--on' : ''}`}>
                          <label className="ax-row__pick">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!canEdit}
                              onChange={() => toggleAxis(a.key)}
                            />
                            <span className="ax-row__main">
                              <span className="ax-row__label">
                                {a.label}
                                {a.inverse && <span className="ax-row__inv">меньше — лучше</span>}
                              </span>
                              <span className="ax-row__hint">{a.hint}</span>
                            </span>
                          </label>
                          <button
                            type="button"
                            className={`ax-star${isFocus ? ' ax-star--on' : ''}`}
                            onClick={() => toggleFocus(a.key)}
                            disabled={!canEdit || !on}
                            title={isFocus ? 'Убрать из главных' : 'Сделать главным'}
                            aria-pressed={isFocus}
                          >
                            {isFocus ? 'главный' : 'главный?'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>

        <footer className="sheet__foot">
          <span className="sheet__state">
            {busy ? 'Сохраняем…'
              : err ? <span className="lite-fb__err">{err}</span>
                : tooFew ? <span className="lite-fb__err">Нужно минимум {limits.minAxes} показателя</span>
                  : saved ? <span className="lite-fb__ok">Сохранено</span>
                    : dirty ? 'Есть несохранённые правки'
                      : 'Изменений нет'}
          </span>
          <div className="ax-foot__btns">
            {canEdit && current && !current.isDefault && (
              <button type="button" className="lite-btn lite-btn--ghost" onClick={reset} disabled={busy}>
                Вернуть наш набор
              </button>
            )}
            {canEdit ? (
              <button type="button" className="lite-btn" onClick={save} disabled={busy || tooFew || !dirty}>
                Сохранить
              </button>
            ) : (
              <button type="button" className="lite-btn" onClick={onClose}>Понятно</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
